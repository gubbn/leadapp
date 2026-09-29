import { NextResponse } from 'next/server'
import { PDFParse } from 'pdf-parse'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_EXTRACTED_TEXT_LENGTH = 500_000

export async function POST(request: Request) {
  try {
    return await extractAttendees(request)
  } catch (error) {
    console.error('Networking PDF service failed', error)
    return NextResponse.json(
      { error: 'The PDF service is temporarily unavailable. Refresh the page and try again.' },
      { status: 500 },
    )
  }
}

async function extractAttendees(request: Request) {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Sign in to import an attendee list.' }, { status: 401 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Choose a PDF attendee list.' }, { status: 400 })
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'Choose a PDF smaller than 10 MB.' },
      { status: 413 },
    )
  }

  const data = new Uint8Array(await file.arrayBuffer())
  const signature = new TextDecoder('ascii').decode(data.slice(0, 5))

  if (signature !== '%PDF-') {
    return NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 })
  }

  const parser = new PDFParse({ data })

  try {
    const result = await parser.getText()
    const text = result.text.trim()

    if (!text) {
      return NextResponse.json(
        {
          error: 'No selectable text was found. This may be a scanned PDF; add attendees manually or export a text-based copy.',
        },
        { status: 422 },
      )
    }

    if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
      return NextResponse.json(
        { error: 'That PDF contains too much text for an attendee list.' },
        { status: 413 },
      )
    }

    return NextResponse.json({ text, pageCount: result.total })
  } catch (error) {
    console.error('Networking PDF extraction failed', error)
    return NextResponse.json(
      { error: 'The PDF could not be read. Try exporting it again or add the attendees manually.' },
      { status: 422 },
    )
  } finally {
    await parser.destroy().catch(() => undefined)
  }
}
