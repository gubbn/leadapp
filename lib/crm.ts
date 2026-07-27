export const dealStages = [
  { key: 'new', label: 'New opportunity', probability: 10 },
  { key: 'conversation', label: 'Conversation', probability: 20 },
  { key: 'discovery', label: 'Discovery booked', probability: 30 },
  { key: 'health_check', label: 'Health check', probability: 40 },
  { key: 'report_sent', label: 'Report delivered', probability: 50 },
  { key: 'solution_agreed', label: 'Solution agreed', probability: 65 },
  { key: 'proposal', label: 'Proposal issued', probability: 75 },
  { key: 'decision', label: 'Decision pending', probability: 85 },
  { key: 'contract_sent', label: 'Contract sent', probability: 95 },
  { key: 'won', label: 'Won', probability: 100 },
  { key: 'lost', label: 'Lost', probability: 0 },
  { key: 'nurture', label: 'Nurture', probability: 10 },
] as const

export type DealStage = (typeof dealStages)[number]['key']

export const activeDealStages = dealStages.filter(
  (stage) => !['won', 'lost', 'nurture'].includes(stage.key),
)

export function stageFor(key: string) {
  return dealStages.find((stage) => stage.key === key) ?? dealStages[0]
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
