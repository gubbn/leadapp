import { createHash, timingSafeEqual } from 'node:crypto'
import { getM365ConfigStatus, sendM365Mail } from '@/lib/m365Graph'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

type Delivery = {
  quote_id: string
  step: string
  recipient: string
  subject: string
  body: string
}

export async function POST(request: Request) {
  const secret = process.env.QUOTE_NURTURE_SECRET?.trim()
  if (!secret) return Response.json({ error: 'Quote nurture is disabled.' }, { status: 503 })

  const digest = (value: string) => createHash('sha256').update(value).digest()
  const supplied = request.headers.get('authorization') ?? ''
  if (!timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const client = createSupabaseAdminClient()
  if (!client || !getM365ConfigStatus().ready) {
    return Response.json({ error: 'Database or Microsoft 365 sending is unavailable.' }, { status: 503 })
  }

  let accepted = 0
  let failed = 0
  for (let index = 0; index < 10; index++) {
    const { data, error } = await client.rpc('claim_quote_nurture').maybeSingle<Delivery>()
    if (error) return Response.json({ error: 'Could not claim a nurture email.', accepted, failed }, { status: 500 })
    if (!data) break

    let status = 'failed'
    try {
      const escaped = data.body.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      const result = await sendM365Mail({
        to: data.recipient,
        subject: data.subject,
        html: escaped.replace(/\r?\n/g, '<br>'),
      })
      if (result.accepted) status = 'accepted'
    } catch {
      // Keep the attempt for review because the provider might have accepted it.
    }

    const { error: updateError } = await client.from('quote_nurture_attempts')
      .update({ status }).eq('quote_id', data.quote_id).eq('step', data.step)
    if (updateError) return Response.json({ error: 'Could not record a nurture email result.', accepted, failed }, { status: 500 })
    if (status === 'accepted') accepted++
    else failed++
  }

  return Response.json({ accepted, failed })
}
