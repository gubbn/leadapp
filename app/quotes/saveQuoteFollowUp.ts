import { OPEN_QUOTE_STATUSES, quoteFollowUpUpdate } from '@/lib/quoteActions'
import { supabase } from '@/lib/supabaseClient'

const followUpFields = 'follow_up_sent_on,chase_due_date,status'

export async function saveQuoteFollowUp(id: string, sentOn: string | null, checked: boolean) {
  const update = supabase.from('quotes')
    .update(quoteFollowUpUpdate(checked))
    .eq('id', id)
    .in('status', OPEN_QUOTE_STATUSES)
  const pending = sentOn ? update.eq('follow_up_sent_on', sentOn) : update.is('follow_up_sent_on', null)
  const result = await pending.select(followUpFields).maybeSingle()
  if (result.error || result.data) return result

  // Another session may have changed the follow-up or closed the quote.
  return supabase.from('quotes').select(followUpFields).eq('id', id).single()
}
