'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  brandGuardrails,
  playbookMonths,
  scorecardFields,
  strategicTargets,
  weeklyCommitments,
} from '@/app/playbook/data'

type StateValue = {
  completed?: boolean
  note?: string
  metrics?: Record<string, number | ''>
}

type StateRow = {
  state_key: string
  value: StateValue
}

type LiveMetrics = {
  totalCompanies: number
  targets: number
  opportunities: number
  wins: number
}

function monthTaskKey(month: string, index: number) {
  return `month:${month}:task:${index}`
}

function noteKey(month: string) {
  return `month:${month}:next-action`
}

function metricKey(month: string) {
  return `month:${month}:scorecard`
}

function currentWeekKey() {
  const now = new Date()
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
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

export default function PlaybookWorkspace() {
  const [selectedMonth, setSelectedMonth] = useState(getInitialMonth)
  const [state, setState] = useState<Record<string, StateValue>>({})
  const [loading, setLoading] = useState(true)
  const [savingKeys, setSavingKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>({
    totalCompanies: 0,
    targets: 0,
    opportunities: 0,
    wins: 0,
  })
  const weekKey = useMemo(() => currentWeekKey(), [])

  const loadState = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('marketing_playbook_state')
      .select('state_key,value')

    if (loadError) {
      setError(
        loadError.code === '42P01'
          ? 'The playbook database table has not been installed yet.'
          : loadError.message,
      )
    } else {
      const nextState: Record<string, StateValue> = {}
      for (const row of (data ?? []) as StateRow[]) {
        nextState[row.state_key] = row.value ?? {}
      }
      setState(nextState)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Initial client-side data hydration from Supabase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadState()
  }, [loadState])

  useEffect(() => {
    async function loadLiveMetrics() {
      const [totalResult, qualifiedResult, winsResult] = await Promise.all([
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase
          .from('companies')
          .select('id', { count: 'exact', head: true })
          .eq('prospecting_status', 'qualified'),
        supabase
          .from('companies')
          .select('id', { count: 'exact', head: true })
          .eq('relationship_status', 'customer'),
      ])

      const firstError = [totalResult.error, qualifiedResult.error, winsResult.error].find(Boolean)
      if (firstError) {
        setError(firstError.message)
        return
      }
      setLiveMetrics({
        totalCompanies: totalResult.count ?? 0,
        targets: totalResult.count ?? 0,
        opportunities: qualifiedResult.count ?? 0,
        wins: winsResult.count ?? 0,
      })
    }

    // Load the current CRM totals used by read-only scorecard fields.
    void loadLiveMetrics()
  }, [])

  async function persist(key: string, value: StateValue) {
    const previous = state[key]
    setState((current) => ({ ...current, [key]: value }))
    setSavingKeys((current) => new Set(current).add(key))
    setError('')
    setSavedMessage('')

    const { error: saveError } = await supabase
      .from('marketing_playbook_state')
      .upsert(
        {
          state_key: key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'state_key' },
      )

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
    setSavedMessage('Progress saved')
  }

  const month = playbookMonths.find((item) => item.key === selectedMonth) ?? playbookMonths[0]
  const completedByMonth = useMemo(
    () =>
      Object.fromEntries(
        playbookMonths.map((item) => [
          item.key,
          item.tasks.filter((_, index) => state[monthTaskKey(item.key, index)]?.completed)
            .length,
        ]),
      ),
    [state],
  )
  const completedTotal = Object.values(completedByMonth).reduce(
    (sum, value) => sum + value,
    0,
  )
  const totalTasks = playbookMonths.reduce((sum, item) => sum + item.tasks.length, 0)
  const overallPercent = Math.round((completedTotal / totalTasks) * 100)
  const monthCompleted = completedByMonth[month.key] ?? 0
  const monthPercent = Math.round((monthCompleted / month.tasks.length) * 100)
  const noteStateKey = noteKey(month.key)
  const metricsStateKey = metricKey(month.key)
  const metrics = state[metricsStateKey]?.metrics ?? {}

  return (
    <>
      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-end">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">
                Six-month growth playbook
              </p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
                Turn the strategy into this week&apos;s work.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
                Follow the monthly campaign, protect the weekly rhythm and keep
                every opportunity moving toward a dated next action.
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-stone-500">Overall completion</p>
                  <p className="mt-1 text-4xl font-black text-stone-950">{overallPercent}%</p>
                </div>
                <p className="text-sm font-bold text-stone-400">
                  {completedTotal}/{totalTasks} actions
                </p>
              </div>
              <ProgressBar value={overallPercent} />
              <p className="mt-4 text-xs leading-5 text-stone-500">
                Core outcome: 5-8 signed clients. Stretch outcome: 10-15.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="monthly-plan" className="mx-auto max-w-7xl scroll-mt-32 px-4 py-8">
        {error ? (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => void loadState()} className="rounded-lg bg-white px-3 py-2">
              Retry
            </button>
          </div>
        ) : null}

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {playbookMonths.map((item) => {
              const active = item.key === month.key
              const count = completedByMonth[item.key] ?? 0
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedMonth(item.key)}
                  className={`min-w-24 rounded-xl px-4 py-3 text-left transition ${
                    active
                      ? 'bg-stone-950 text-white shadow-sm'
                      : 'bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-700'
                  }`}
                >
                  <span className="block text-sm font-black">{item.shortLabel}</span>
                  <span className={`mt-1 block text-xs ${active ? 'text-stone-300' : 'text-stone-400'}`}>
                    {count}/{item.tasks.length} done
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2 px-2 text-xs font-bold text-stone-400">
            {loading ? 'Loading progress...' : savingKeys.size ? 'Saving...' : savedMessage || 'All changes saved'}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 bg-stone-950 p-6 text-white md:p-8">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">
                      {month.label}
                    </p>
                    <h2 className="mt-2 text-3xl font-black">{month.theme}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-300">
                      {month.objective}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-5 py-4 text-right">
                    <p className="text-3xl font-black">{monthPercent}%</p>
                    <p className="mt-1 text-xs font-bold text-stone-300">
                      {monthCompleted} of {month.tasks.length} complete
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-8">
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500">
                    Accountability target
                  </p>
                  <p className="mt-1 text-sm font-black leading-6 text-red-900">{month.target}</p>
                </div>

                <div className="mt-6 grid gap-3">
                  {month.tasks.map((task, index) => {
                    const key = monthTaskKey(month.key, index)
                    const checked = state[key]?.completed ?? false
                    return (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
                          checked
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-stone-200 bg-white hover:border-red-200 hover:bg-red-50/40'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={savingKeys.has(key)}
                          onChange={() => void persist(key, { completed: !checked })}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-red-600"
                        />
                        <span className={`text-sm font-semibold leading-6 ${checked ? 'text-emerald-800 line-through decoration-emerald-400' : 'text-stone-700'}`}>
                          {task}
                        </span>
                      </label>
                    )
                  })}
                </div>

                <div className="mt-7 rounded-2xl bg-stone-50 p-5">
                  <label className="block">
                    <span className="text-sm font-black text-stone-800">
                      The next action that moves revenue
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      Make it specific: person, action and date.
                    </span>
                    <textarea
                      rows={3}
                      value={state[noteStateKey]?.note ?? ''}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          [noteStateKey]: { note: event.target.value },
                        }))
                      }
                      onBlur={(event) => void persist(noteStateKey, { note: event.target.value.trim() })}
                      className="form-input mt-3 resize-y"
                      placeholder="Example: Send the resilience report to Sarah by Friday and book the proposal review."
                    />
                  </label>
                </div>
              </div>
            </section>

            <div id="weekly-rhythm" className="scroll-mt-32">
            <WeeklyRhythm
              weekKey={weekKey}
              state={state}
              savingKeys={savingKeys}
              onToggle={persist}
            />
            </div>
          </div>

          <aside className="space-y-6">
            <div id="scorecard" className="scroll-mt-32">
            <Scorecard
              monthLabel={month.label}
              metrics={metrics}
              autoMetrics={{
                targets: liveMetrics.targets,
                opportunities: liveMetrics.opportunities,
                wins: liveMetrics.wins,
              }}
              disabled={savingKeys.has(metricsStateKey)}
              onChange={(key, value) =>
                setState((current) => ({
                  ...current,
                  [metricsStateKey]: {
                    metrics: { ...(current[metricsStateKey]?.metrics ?? {}), [key]: value },
                  },
                }))
              }
              onSave={() => void persist(metricsStateKey, { metrics })}
            />
            </div>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                Six-month targets
              </p>
              <div className="mt-4 space-y-3">
                {strategicTargets.map((target) => (
                  <div key={target.label} className="rounded-xl bg-stone-50 p-3">
                    <p className="text-xs font-bold text-stone-500">{target.label}</p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-black text-stone-800">{target.core} core</span>
                      <span className="font-black text-red-600">{target.stretch} stretch</span>
                    </div>
                    {target.label === 'Named targets' ? (
                      <p className="mt-2 text-xs font-black text-emerald-700">
                        {liveMetrics.totalCompanies} currently in CRM
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <details className="rounded-2xl border border-stone-200 bg-white shadow-sm">
              <summary className="cursor-pointer list-none p-5 [&::-webkit-details-marker]:hidden">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                  Brand guardrails
                </p>
                <p className="mt-1 text-lg font-black text-stone-950">
                  Keep the work human +
                </p>
              </summary>
              <ul className="space-y-3 border-t border-stone-100 p-5">
                {brandGuardrails.map((guardrail) => (
                  <li key={guardrail} className="flex gap-3 text-sm leading-6 text-stone-600">
                    <span className="font-black text-red-500">•</span>
                    <span>{guardrail}</span>
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        </div>
      </section>
    </>
  )
}

function WeeklyRhythm({
  weekKey,
  state,
  savingKeys,
  onToggle,
}: {
  weekKey: string
  state: Record<string, StateValue>
  savingKeys: Set<string>
  onToggle: (key: string, value: StateValue) => Promise<void>
}) {
  const completed = weeklyCommitments.filter(
    (item) => state[`week:${weekKey}:${item.key}`]?.completed,
  ).length

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm md:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
            Week {weekKey.split('-W')[1]}
          </p>
          <h2 className="mt-1 text-2xl font-black text-stone-950">The repeatable week</h2>
          <p className="mt-2 text-sm text-stone-500">This checklist resets automatically each week.</p>
        </div>
        <p className="text-sm font-black text-stone-500">
          {completed}/{weeklyCommitments.length} complete
        </p>
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {weeklyCommitments.map((item) => {
          const key = `week:${weekKey}:${item.key}`
          const checked = state[key]?.completed ?? false
          return (
            <label
              key={key}
              className={`cursor-pointer rounded-2xl border p-4 transition ${
                checked ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 hover:border-red-200'
              }`}
            >
              <span className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={savingKeys.has(key)}
                  onChange={() => void onToggle(key, { completed: !checked })}
                  className="mt-0.5 h-5 w-5 accent-red-600"
                />
                <span>
                  <span className="block text-sm font-black text-stone-900">{item.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-stone-500">{item.commitment}</span>
                  <span className="mt-2 inline-flex rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black uppercase text-stone-500">
                    {item.time}
                  </span>
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}

function Scorecard({
  monthLabel,
  metrics,
  autoMetrics,
  disabled,
  onChange,
  onSave,
}: {
  monthLabel: string
  metrics: Record<string, number | ''>
  autoMetrics: Partial<Record<string, number>>
  disabled: boolean
  onChange: (key: string, value: number | '') => void
  onSave: () => void
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
        Monthly scorecard
      </p>
      <h2 className="mt-1 text-xl font-black text-stone-950">{monthLabel}</h2>
      <div className="mt-5 space-y-3">
        {scorecardFields.map((field) => (
          <label key={field.key} className="grid grid-cols-[1fr_6rem] items-center gap-3">
            <span className="text-xs font-bold leading-5 text-stone-600">
              {field.label}
              {field.key in autoMetrics ? (
                <span className="mt-0.5 block text-[10px] font-black uppercase text-emerald-600">
                  Live CRM
                </span>
              ) : null}
            </span>
            <input
              type="number"
              min="0"
              value={autoMetrics[field.key] ?? metrics[field.key] ?? ''}
              readOnly={field.key in autoMetrics}
              onChange={(event) =>
                onChange(field.key, event.target.value === '' ? '' : Number(event.target.value))
              }
              className={`form-input text-right ${field.key in autoMetrics ? 'cursor-not-allowed bg-emerald-50 font-black text-emerald-800' : ''}`}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className="mt-5 w-full rounded-xl bg-stone-950 px-4 py-3 text-sm font-black text-white transition hover:bg-red-600 disabled:opacity-50"
      >
        {disabled ? 'Saving...' : 'Save scorecard'}
      </button>
    </section>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-stone-100">
      <div
        className="h-full rounded-full bg-red-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}
