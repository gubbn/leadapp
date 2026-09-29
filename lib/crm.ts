export const dealStages = [
  { key: 'new', label: 'New opportunity', probability: 10 },
  { key: 'conversation', label: 'Conversation', probability: 25 },
  { key: 'discovery', label: 'Discovery booked', probability: 40 },
  { key: 'proposal', label: 'Proposal delivered', probability: 75 },
  { key: 'decision', label: 'Decision pending', probability: 90 },
  { key: 'nurture', label: 'Nurtured', probability: 10 },
  { key: 'lost', label: 'Lost', probability: 0 },
  { key: 'won', label: 'Won', probability: 100 },
] as const

export type DealStage = (typeof dealStages)[number]['key']

export const activeDealStages = dealStages.filter(
  (stage) => !['won', 'lost', 'nurture'].includes(stage.key),
)

const legacyDealStages: Record<string, DealStage> = {
  health_check: 'discovery',
  report_sent: 'discovery',
  solution_agreed: 'discovery',
  contract_sent: 'decision',
}

export function normalizeDealStage(key: string): DealStage {
  if (legacyDealStages[key]) return legacyDealStages[key]
  return dealStages.some((stage) => stage.key === key) ? key as DealStage : 'new'
}

export function stageFor(key: string) {
  const normalized = normalizeDealStage(key)
  return dealStages.find((stage) => stage.key === normalized) ?? dealStages[0]
}

export function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No date'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}
