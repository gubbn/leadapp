import { NextResponse } from 'next/server'
import {
  addTrackingToHtml,
  getM365ConfigStatus,
  sendM365Mail,
} from '@/lib/m365Graph'

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

  const trackedHtml = body.trackingId
    ? addTrackingToHtml({
        html,
        trackingId: body.trackingId,
        baseUrl,
      })
    : html

  try {
    const result = await sendM365Mail({
      to,
      subject,
      html: trackedHtml,
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
