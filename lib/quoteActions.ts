export const OPEN_QUOTE_STATUSES = ['issued', 'chased'] as const
export const QUOTE_ACTION_COLUMNS = 'follow_up_sent_on,last_chased_on'
export const QUOTE_ACTION_SETUP = 'Apply docs/quote-follow-up.sql in Supabase to enable quote follow-up tracking.'

export type QuoteActionDates = {
  issued_on: string
  follow_up_sent_on?: string | null
  last_chased_on?: string | null
}

const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function quoteToday(now = new Date()) {
  return londonDate.format(now)
}

export function isOpenQuote(status: string) {
  return OPEN_QUOTE_STATUSES.some((openStatus) => openStatus === status)
}

export function isMissingQuoteActionColumns(error: { code: string; message: string } | null) {
  return error?.code === '42703' && QUOTE_ACTION_COLUMNS.split(',').some((column) => error.message.includes(column))
}

export function addBusinessDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00Z`)
  let added = 0
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1)
    if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) added += 1
  }
  return result.toISOString().slice(0, 10)
}

export function quoteFollowUpUpdate(checked: boolean, now = new Date()) {
  const sentOn = quoteToday(now)
  const chaseDate = new Date(`${sentOn}T12:00:00Z`)
  chaseDate.setUTCDate(chaseDate.getUTCDate() + 7)
  return {
    follow_up_sent_on: checked ? sentOn : null,
    ...(checked ? { chase_due_date: chaseDate.toISOString().slice(0, 10) } : {}),
    updated_at: now.toISOString(),
  }
}

export function daysSinceQuoteAction(quote: QuoteActionDates, today: string) {
  const lastAction = [quote.issued_on, quote.follow_up_sent_on ?? '', quote.last_chased_on ?? ''].sort().at(-1)
  const dateValue = (date: string) => Date.parse(`${date}T12:00:00Z`)
  return Math.max(0, Math.round((dateValue(today) - dateValue(lastAction ?? quote.issued_on)) / 86_400_000))
}
