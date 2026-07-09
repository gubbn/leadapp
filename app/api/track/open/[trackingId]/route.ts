import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

const transparentGif = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

export async function GET(
  request: Request,
  context: { params: Promise<{ trackingId: string }> },
) {
  const { trackingId } = await context.params

  console.info('Campaign email opened', {
    trackingId,
    userAgent: request.headers.get('user-agent'),
  })

  await recordOpenEvent(trackingId, request)

  return new NextResponse(transparentGif, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'image/gif',
    },
  })
}

async function recordOpenEvent(trackingId: string, request: Request) {
  const supabase = createSupabaseAdminClient()

  if (!supabase) return

  const { data } = await supabase
    .from('campaign_companies')
    .select('id, campaign_id, contact_id')
    .eq('tracking_id', trackingId)
    .maybeSingle()

  if (!data?.id) return

  await supabase
    .from('campaign_companies')
    .update({ opened_at: new Date().toISOString() })
    .eq('id', data.id)

  await supabase.from('campaign_events').insert({
    campaign_company_id: data.id,
    campaign_id: data.campaign_id,
    contact_id: data.contact_id,
    event_type: 'opened',
    event_source: 'tracking_pixel',
    event_payload: {
      userAgent: request.headers.get('user-agent'),
    },
  })
}
