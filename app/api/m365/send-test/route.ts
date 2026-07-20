import { NextResponse } from 'next/server'
import {
  addTrackingToHtml,
  getM365ConfigStatus,
  type InlineMailAttachment,
  sendM365Mail,
} from '@/lib/m365Graph'

const MAX_INLINE_IMAGE_BYTES = 3_000_000
const MAX_INLINE_IMAGE_COUNT = 3

type SendTestRequest = {
  to?: string
  subject?: string
  html?: string
  trackingId?: string
}

export async function POST(request: Request) {
  const config = getM365ConfigStatus()

  if (!config.ready) {
    return NextResponse.json(
      {
        error: 'Microsoft 365 is not configured yet.',
        missing: config.missing,
      },
      { status: 400 },
    )
  }

  const body = (await request.json()) as SendTestRequest
  const to = body.to?.trim()
  const subject = body.subject?.trim() || 'Fixing IT campaign test'
  const html = body.html?.trim()

  if (!to) {
    return NextResponse.json(
      { error: 'Send a test recipient email address.' },
      { status: 400 },
    )
  }

  if (!html) {
    return NextResponse.json(
      { error: 'Send some email HTML to test.' },
      { status: 400 },
    )
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') ||
    new URL(request.url).origin

  const inlineResult = extractInlineImages(html)
  if ('error' in inlineResult) {
    return NextResponse.json({ error: inlineResult.error }, { status: 413 })
  }

  const trackedHtml = body.trackingId
    ? addTrackingToHtml({
        html: inlineResult.html,
        trackingId: body.trackingId,
        baseUrl,
      })
    : inlineResult.html

  try {
    const result = await sendM365Mail({
      to,
      subject,
      html: trackedHtml,
      inlineAttachments: inlineResult.attachments,
    })

    return NextResponse.json({
      ok: true,
      status: result.status,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not send the Microsoft 365 test email.',
      },
      { status: 500 },
    )
  }
}

function extractInlineImages(html: string): {
  html: string
  attachments: InlineMailAttachment[]
} | { error: string } {
  const attachments: InlineMailAttachment[] = []
  let totalBytes = 0
  let imageCount = 0

  const convertedHtml = html.replace(
    /src=(["'])data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=]+)\1/gi,
    (_match, quote: string, contentType: string, contentBytes: string) => {
      imageCount += 1
      if (imageCount > MAX_INLINE_IMAGE_COUNT) return 'src=""'

      const byteLength = Buffer.from(contentBytes, 'base64').byteLength
      totalBytes += byteLength
      const extension = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1]
      const contentId = `automation-image-${attachments.length + 1}`

      attachments.push({
        name: `${contentId}.${extension}`,
        contentType,
        contentBytes,
        contentId,
      })

      return `src=${quote}cid:${contentId}${quote}`
    },
  )

  if (imageCount > MAX_INLINE_IMAGE_COUNT) {
    return { error: `Add no more than ${MAX_INLINE_IMAGE_COUNT} images.` }
  }

  if (totalBytes > MAX_INLINE_IMAGE_BYTES) {
    return { error: 'The combined inline images must be smaller than 3 MB.' }
  }

  return { html: convertedHtml, attachments }
}
