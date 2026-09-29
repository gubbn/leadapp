'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  playbookMonths,
  scorecardFields,
  scorecardTargetsByMonth,
} from '@/app/playbook/data'

type MetricValue = number | ''

type StateValue = {
  note?: string
  metrics?: Record<string, MetricValue>
}

type StateRow = {
  state_key: string
  value: StateValue
}

type DealSnapshot = {
  stage: string
  annual_value: number | null
}

type LiveMetrics = {
  targets: number
  opportunities: number
  wins: number
  activeDeals: number
  openPipelineValue: number
}

const EMPTY_LIVE_METRICS: LiveMetrics = {
  targets: 0,
  opportunities: 0,
  wins: 0,
  activeDeals: 0,
  openPipelineValue: 0,
}

function metricKey(month: string) {
  return `month:${month}:scorecard`
}

function reviewKey(month: string) {
  return `month:${month}:scorecard-review`
}

function getInitialMonth() {
  const now = new Date()
  const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return playbookMonths.some((month) => month.key === key)
    ? key
    : now < new Date('2026-08-01T00:00:00')
      ? playbookMonths[0].key
      : playbookMonths.at(-1)?.key ?? playbookMonths[0].key
}

export default function ScorecardWorkspace() {
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth)
  const [state, setState] = useState<Record<string, StateValue>>({})
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>(EMPTY_LIVE_METRICS)
  const [loading, setLoading] = useState(true)
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    const [stateResult, targetsResult, qualifiedResult, winsResult, dealsResult] = await Promise.all([
      supabase.from('marketing_playbook_state').select('state_key,value'),
      supabase.from('companies').select('id', { count: 'exact', head: true }),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('prospecting_status', 'qualified'),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('relationship_status', 'customer'),
      supabase.from('deals').select('stage,annual_value'),
    ])

    const firstError = [
      stateResult.error,
      targetsResult.error,
      qualifiedResult.error,
      winsResult.error,
      dealsResult.error,
    ].find(Boolean)

    if (firstError) {
      setError(firstError.code === '42P01' ? 'The playbook database table has not been installed yet.' : firstError.message)
      setLoading(false)
      return
    }

    const nextState: Record<string, StateValue> = {}
    for (const row of (stateResult.data ?? []) as StateRow[]) nextState[row.state_key] = row.value ?? {}
    setState(nextState)

    const deals = (dealsResult.data ?? []) as DealSnapshot[]
    const activeDeals = deals.filter((deal) => !['won', 'lost', 'nurture'].includes(deal.stage))
    setLiveMetrics({
      targets: targetsResult.count ?? 0,
      opportunities: qualifiedResult.count ?? 0,
      wins: winsResult.count ?? 0,
      activeDeals: activeDeals.length,
      openPipelineValue: activeDeals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0),
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    // Initial client-side hydration from Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function persist(key: string, value: StateValue) {
    const previous = state[key]
    setState((current) => ({ ...current, [key]: value }))
    setSavingKeys((current) => new Set(current).add(key))
    setError('')
    setSavedMessage('')

    const { error: saveError } = await supabase.from('marketing_playbook_state').upsert({
      state_key: key,
      value,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'state_key' })

    setSavingKeys((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })

    if (saveError) {
      setState((current) => {
        const next = { ...current }
        if (previous) next[key] = previous
        else delete next[key]
        return next
      })
      setError(saveError.message)
      return
    }

    setSavedMessage('Scorecard saved')
  }

  const month = playbookMonths.find((item) => item.key === selectedMonth) ?? playbookMonths[0]
  const selectedMetricKey = metricKey(month.key)
  const selectedReviewKey = reviewKey(month.key)
  const metrics = state[selectedMetricKey]?.metrics ?? {}
  const targets = scorecardTargetsByMonth[month.key] ?? {}
  const autoMetrics: Record<string, number> = {
    targets: liveMetrics.targets,
    opportunities: liveMetrics.opportunities,
    wins: liveMetrics.wins,
  }
  const resolvedMetrics = { ...metrics, ...autoMetrics }

  const funnel = [
    { label: 'Contact to conversation', value: conversion(metrics.conversations, metrics.contacts) },
    { label: 'Conversation to opportunity', value: conversion(autoMetrics.opportunities, metrics.conversations) },
    { label: 'Opportunity to proposal', value: conversion(metrics.proposals, autoMetrics.opportunities) },
    { label: 'Proposal to win', value: conversion(autoMetrics.wins, metrics.proposals) },
  ]

  const sixMonthTotals = useMemo(() => {
    return playbookMonths.reduce<Record<string, number>>((totals, item) => {
      const itemMetrics = state[metricKey(item.key)]?.metrics ?? {}
      for (const field of scorecardFields) totals[field.key] = (totals[field.key] ?? 0) + Number(itemMetrics[field.key] || 0)
      return totals
    }, {})
  }, [state])

  const strategicProgress = [
    { label: 'Named targets', value: liveMetrics.targets, target: 200 },
    { label: 'Health checks', value: sixMonthTotals.checks ?? 0, target: 24 },
    { label: 'Qualified opportunities', value: liveMetrics.opportunities, target: 30 },
    { label: 'Signed clients', value: liveMetrics.wins, target: 5 },
  ]

  const measuredCount = scorecardFields.filter((field) => resolvedMetrics[field.key] !== '' && resolvedMetrics[field.key] !== undefined).length

  return (
    <>
      <section className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-red-400">Strategy scorecard</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">Know what moved, what converted and what needs attention.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-300">Record the monthly activity that is not already in the CRM, compare it with the plan and use the review to choose next month&apos;s priorities.</p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/playbook" className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500">Back to playbook</Link>
                <Link href="/reports" className="rounded-xl border border-stone-700 px-4 py-3 text-sm font-black text-stone-200 transition hover:border-stone-500">Open operational reports</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
              <HeroMetric label="Active deals" value={liveMetrics.activeDeals} />
              <HeroMetric label="Open pipeline" value={formatCurrency(liveMetrics.openPipelineValue)} />
              <HeroMetric label="Fields measured" value={`${measuredCount}/${scorecardFields.length}`} />
              <HeroMetric label="Saved status" value={savingKeys.size ? 'Saving' : savedMessage || 'Ready'} small />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {error ? (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void load()} className="rounded-lg bg-white px-3 py-2">Retry</button>
          </div>
        ) : null}

        <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
          {playbookMonths.map((item) => (
            <button key={item.key} type="button" onClick={() => setSelectedMonth(item.key)} className={`min-w-28 rounded-xl px-4 py-3 text-left transition ${item.key === month.key ? 'bg-stone-950 text-white' : 'bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-700'}`}>
              <span className="block text-sm font-black">{item.shortLabel}</span>
              <span className={`mt-1 block text-[10px] font-bold uppercase ${item.key === month.key ? 'text-stone-400' : 'text-stone-400'}`}>{item.theme}</span>
            </button>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-stone-200 bg-stone-50 p-5 md:flex-row md:items-end md:p-7">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Monthly actuals</p>
                  <h2 className="mt-2 text-2xl font-black text-stone-950">{month.label}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">Green fields are live CRM snapshots. Enter the remaining results, then save the month.</p>
                </div>
                <p className="rounded-full bg-white px-3 py-2 text-xs font-black text-stone-500">Target: {month.target}</p>
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 md:p-7">
                {scorecardFields.map((field) => {
                  const isAutomatic = field.key in autoMetrics
                  const value = autoMetrics[field.key] ?? metrics[field.key] ?? ''
                  const target = targets[field.key]
                  return (
                    <label key={field.key} className={`rounded-2xl border p-4 ${isAutomatic ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="text-sm font-black leading-5 text-stone-800">{field.label}</span>
                        {isAutomatic ? <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">Live CRM</span> : null}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={value}
                        readOnly={isAutomatic}
                        onChange={(event) => {
                          const nextValue: MetricValue = event.target.value === '' ? '' : Number(event.target.value)
                          setState((current) => ({
                            ...current,
                            [selectedMetricKey]: { metrics: { ...(current[selectedMetricKey]?.metrics ?? {}), [field.key]: nextValue } },
                          }))
                        }}
                        className={`form-input mt-4 text-right text-xl font-black ${isAutomatic ? 'cursor-not-allowed border-emerald-200 bg-white text-emerald-800' : ''}`}
                      />
                      <span className="mt-2 flex items-center justify-between text-xs font-bold text-stone-400">
                        <span>{target === undefined ? 'No fixed target' : `Target ${formatMetric(field.key, target)}`}</span>
                        {target !== undefined && typeof value === 'number' ? <StatusPill value={value} target={target} /> : null}
                      </span>
                    </label>
                  )
                })}
              </div>

              <div className="flex flex-col gap-3 border-t border-stone-100 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
                <p className="text-xs font-bold text-stone-400">{loading ? 'Loading scorecard...' : savingKeys.size ? 'Saving changes...' : savedMessage || 'Ready to save'}</p>
                <button type="button" disabled={savingKeys.has(selectedMetricKey)} onClick={() => void persist(selectedMetricKey, { metrics })} className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-50">Save {month.shortLabel} scorecard</button>
              </div>
            </section>

            <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-7">
              <div className="flex flex-col justify-between gap-3 border-b border-stone-100 pb-5 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Conversion</p>
                  <h2 className="mt-2 text-2xl font-black text-stone-950">Where momentum becomes revenue</h2>
                </div>
                <p className="text-xs font-bold text-stone-400">Blank inputs are excluded</p>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {funnel.map((item) => <div key={item.label} className="rounded-2xl bg-stone-50 p-4"><p className="text-xs font-bold leading-5 text-stone-500">{item.label}</p><p className="mt-2 text-3xl font-black text-stone-950">{item.value === null ? '—' : `${item.value}%`}</p></div>)}
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 p-5 md:p-7">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Six-month view</p>
                <h2 className="mt-2 text-2xl font-black text-stone-950">Progress by month</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Month</th><th className="px-4 py-3">Contacts</th><th className="px-4 py-3">Conversations</th><th className="px-4 py-3">Checks</th><th className="px-4 py-3">Proposals</th><th className="px-4 py-3">Contract value</th></tr></thead>
                  <tbody>
                    {playbookMonths.map((item) => {
                      const row = state[metricKey(item.key)]?.metrics ?? {}
                      return <tr key={item.key} className="border-t border-stone-100"><td className="px-5 py-4 font-black text-stone-900">{item.label}</td><MetricCell value={row.contacts} /><MetricCell value={row.conversations} /><MetricCell value={row.checks} /><MetricCell value={row.proposals} /><MetricCell value={row.contractValue} currency /></tr>
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Six-month outcomes</p>
              <div className="mt-4 space-y-4">
                {strategicProgress.map((item) => {
                  const percent = Math.round((item.value / item.target) * 100)
                  return <div key={item.label}><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold text-stone-500">{item.label}</p><p className="mt-1 text-xl font-black text-stone-950">{item.value} <span className="text-xs text-stone-400">/ {item.target}</span></p></div><span className="text-xs font-black text-red-600">{percent}%</span></div><ProgressBar value={percent} /></div>
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Monthly review</p>
              <h2 className="mt-2 text-xl font-black text-stone-950">What did the numbers teach us?</h2>
              <p className="mt-2 text-xs leading-5 text-stone-500">Capture the strongest signal, the biggest constraint and what will change next month.</p>
              <textarea rows={8} value={state[selectedReviewKey]?.note ?? ''} onChange={(event) => setState((current) => ({ ...current, [selectedReviewKey]: { note: event.target.value } }))} onBlur={(event) => void persist(selectedReviewKey, { note: event.target.value.trim() })} className="form-input mt-4 resize-y" placeholder="Example: Conversations improved, but too few moved to proposals. Tighten discovery qualification and book proposal reviews before sending documents." />
              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-stone-400">Saved when you leave the field</p>
            </section>

            <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Friday routine</p>
              <ol className="mt-3 space-y-3 text-sm font-bold leading-5 text-red-950"><li>1. Complete the missing actuals.</li><li>2. Review conversion, not just activity.</li><li>3. Explain the most important gap.</li><li>4. Choose one change for next week.</li></ol>
            </section>
          </aside>
        </div>
      </section>
    </>
  )
}

function conversion(numerator: MetricValue | undefined, denominator: MetricValue | undefined) {
  const top = Number(numerator || 0)
  const bottom = Number(denominator || 0)
  return bottom > 0 ? Math.round((top / bottom) * 100) : null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value)
}

function formatMetric(key: string, value: number) {
  return key === 'contractValue' ? formatCurrency(value) : value.toLocaleString('en-GB')
}

function HeroMetric({ label, value, small = false }: { label: string; value: number | string; small?: boolean }) {
  return <div className="min-w-32 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-2 font-black text-white ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p></div>
}

function StatusPill({ value, target }: { value: number; target: number }) {
  const percent = target > 0 ? Math.round((value / target) * 100) : 100
  const met = percent >= 100
  return <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${met ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{met ? 'Target met' : `${percent}%`}</span>
}

function MetricCell({ value, currency = false }: { value: MetricValue | undefined; currency?: boolean }) {
  return <td className="px-4 py-4 font-bold text-stone-600">{value === '' || value === undefined ? '—' : currency ? formatCurrency(Number(value)) : Number(value).toLocaleString('en-GB')}</td>
}

function ProgressBar({ value }: { value: number }) {
  return <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-red-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}
