import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const trackingId = url.searchParams.get('id') || ''
  const target = url.searchParams.get('url') || ''

  console.info('Campaign email link clicked', {
    trackingId,
    target,
    userAgent: request.headers.get('user-agent'),
  })

  if (!target || !isSafeRedirect(target)) {
    return NextResponse.json({ error: 'Missing or invalid URL.' }, { status: 400 })
  }

  await recordClickEvent(trackingId, target, request)

  return NextResponse.redirect(target)
}

function isSafeRedirect(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

async function recordClickEvent(
  trackingId: string,
  target: string,
  request: Request,
) {
  if (!trackingId) return

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
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', data.id)

  await supabase.from('campaign_events').insert({
    campaign_company_id: data.id,
    campaign_id: data.campaign_id,
    contact_id: data.contact_id,
    event_type: 'clicked',
    event_source: 'tracked_link',
    event_payload: {
      target,
      userAgent: request.headers.get('user-agent'),
    },
  })
}
