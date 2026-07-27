'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency, formatShortDate, stageFor } from '@/lib/crm'

type Company = {
  id: string
  company_name: string
  prospecting_status?: 'research' | 'qualified' | 'nurture' | 'disqualified'
}
type Deal = {
  id: string
  name: string
  stage: string
  annual_value: number | null
  next_action: string | null
  next_action_due: string | null
  updated_at: string
  companies: Company | Company[] | null
}
type Task = {
  id: string
  title: string
  due_date: string | null
  priority: string
  status: string
  company_id: string | null
  companies: Company | Company[] | null
  deals: { id: string; name: string } | { id: string; name: string }[] | null
}
type Activity = {
  id: string
  activity_type: string
  summary: string
  outcome: string | null
  occurred_at: string
  companies: Company | Company[] | null
}

const today = new Date().toISOString().slice(0, 10)
const stalledCutoff = Date.now() - 14 * 86400000
const todayLabel = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/London',
}).format(new Date())

export default function TodayWorkspace() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    const [companiesResult, contactsResult, tasksResult, dealsResult, activitiesResult] =
      await Promise.all([
        supabase.from('companies').select('id,company_name,prospecting_status').order('company_name'),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase
          .from('crm_tasks')
          .select('id,title,due_date,priority,status,company_id,companies(id,company_name),deals(id,name)')
          .in('status', ['open', 'in_progress'])
          .order('due_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('deals')
          .select('id,name,stage,annual_value,next_action,next_action_due,updated_at,companies(id,company_name)')
          .not('stage', 'in', '("won","lost")')
          .order('updated_at', { ascending: false }),
        supabase
          .from('crm_activities')
          .select('id,activity_type,summary,outcome,occurred_at,companies(id,company_name)')
          .order('occurred_at', { ascending: false })
          .limit(8),
      ])

    const firstError = [
      companiesResult.error,
      contactsResult.error,
      tasksResult.error,
      dealsResult.error,
      activitiesResult.error,
    ].find(Boolean)

    if (firstError) setError(firstError.message)
    setCompanies((companiesResult.data ?? []) as Company[])
    setContactCount(contactsResult.count ?? 0)
    setTasks((tasksResult.data ?? []) as Task[])
    setDeals((dealsResult.data ?? []) as Deal[])
    setActivities((activitiesResult.data ?? []) as Activity[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWorkspace()
  }, [loadWorkspace])

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.due_date && task.due_date < today),
    [tasks],
  )
  const dueToday = useMemo(
    () => tasks.filter((task) => !task.due_date || task.due_date <= today),
    [tasks],
  )
  const stalledDeals = useMemo(() => {
    return deals.filter(
      (deal) =>
        !deal.next_action ||
        !deal.next_action_due ||
        new Date(deal.updated_at).getTime() < stalledCutoff,
    )
  }, [deals])
  const pipelineValue = deals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0)
  const weightedValue = deals.reduce(
    (sum, deal) => sum + Number(deal.annual_value ?? 0) * (stageFor(deal.stage).probability / 100),
    0,
  )
  const researchQueueCount = companies.filter(
    (company) => company.prospecting_status === 'research',
  ).length
  const qualifiedProspectCount = companies.filter(
    (company) => company.prospecting_status === 'qualified',
  ).length

  async function completeTask(task: Task) {
    const { error: saveError } = await supabase
      .from('crm_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id)
    if (saveError) setError(saveError.message)
    else await loadWorkspace()
  }

  return (
    <>
      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-9">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">
                  Today
                </p>
                <time
                  dateTime={today}
                  className="text-sm font-bold text-stone-500"
                >
                  {todayLabel}
                </time>
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
                Move the next relationship forward.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
                Tasks, stalled opportunities and recent activity in one working view.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => setShowTaskForm(true)} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700">
                + Add task
              </button>
              <button onClick={() => setShowActivityForm(true)} className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-black text-stone-800 shadow-sm hover:bg-stone-50">
                Log activity
              </button>
              <Link href="/sales" className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-black text-white hover:bg-stone-800">
                Open pipeline
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
        {showTaskForm ? <TaskForm companies={companies} onClose={() => setShowTaskForm(false)} onSaved={loadWorkspace} /> : null}
        {showActivityForm ? <ActivityForm companies={companies} onClose={() => setShowActivityForm(false)} onSaved={loadWorkspace} /> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Due now" value={dueToday.length} urgent={dueToday.length > 0} />
          <Metric label="Overdue" value={overdueTasks.length} urgent={overdueTasks.length > 0} />
          <Metric label="Open pipeline" value={formatCurrency(pipelineValue)} />
          <Metric label="Weighted forecast" value={formatCurrency(weightedValue)} />
          <Metric label="CRM reach" value={`${companies.length} / ${contactCount}`} helper="companies / contacts" />
        </div>

        <Link
          href="/prospecting"
          className="mt-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 transition hover:border-amber-300 hover:bg-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
              Prospecting queue
            </p>
            <p className="mt-1 text-lg font-black text-stone-950">
              {researchQueueCount} need research · {qualifiedProspectCount} qualified
            </p>
            <p className="mt-1 text-sm text-stone-600">
              Enrich a company, identify the decision-maker and create its next action.
            </p>
          </div>
          <span className="shrink-0 rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white">
            Work the queue →
          </span>
        </Link>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-8 text-sm font-bold text-stone-500">
            Loading today&apos;s work...
          </div>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr_0.85fr]">
            <section id="tasks" className="scroll-mt-28 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <SectionTitle eyebrow="Do next" title="Tasks and follow-ups" />
              <div className="mt-5 space-y-3">
                {tasks.length ? tasks.slice(0, 10).map((task) => (
                  <div key={task.id} className={`rounded-xl border p-4 ${task.due_date && task.due_date < today ? 'border-red-200 bg-red-50' : 'border-stone-200'}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => void completeTask(task)} title="Mark complete" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 border-stone-300 hover:border-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-stone-900">{task.title}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          {companyName(task.companies)} · {formatShortDate(task.due_date)}
                        </p>
                      </div>
                      <Priority value={task.priority} />
                    </div>
                  </div>
                )) : <Empty text="No open tasks. Add the next action for an opportunity." />}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <SectionTitle eyebrow="Protect the pipeline" title="Needs attention" action={<Link href="/sales" className="text-xs font-black text-red-600">View pipeline →</Link>} />
              <div className="mt-5 space-y-3">
                {stalledDeals.length ? stalledDeals.slice(0, 8).map((deal) => (
                  <Link key={deal.id} href={`/sales?deal=${deal.id}`} className="block rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-300">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-stone-900">{deal.name}</p>
                        <p className="mt-1 text-xs text-stone-500">{companyName(deal.companies)} · {stageFor(deal.stage).label}</p>
                      </div>
                      <p className="text-sm font-black text-stone-900">{formatCurrency(deal.annual_value)}</p>
                    </div>
                    <p className="mt-3 text-xs font-bold text-amber-800">
                      {deal.next_action || 'No next action set'} {deal.next_action_due ? `· ${formatShortDate(deal.next_action_due)}` : ''}
                    </p>
                  </Link>
                )) : <Empty text="Every open opportunity has a current next action." />}
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <SectionTitle eyebrow="Relationship history" title="Recent activity" />
              <div className="mt-5 space-y-4">
                {activities.length ? activities.map((activity) => (
                  <div key={activity.id} className="border-l-2 border-red-100 pl-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black uppercase text-stone-500">{activity.activity_type.replace('_', ' ')}</span>
                      <span className="text-[10px] font-bold text-stone-400">{new Date(activity.occurred_at).toLocaleDateString('en-GB')}</span>
                    </div>
                    <p className="mt-2 text-sm font-bold leading-5 text-stone-800">{activity.summary}</p>
                    <p className="mt-1 text-xs text-stone-400">{companyName(activity.companies)}</p>
                  </div>
                )) : <Empty text="No activity logged yet." />}
              </div>
            </section>
          </div>
        )}
      </section>
    </>
  )
}

function TaskForm({ companies, onClose, onSaved }: { companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    const { error: saveError } = await supabase.from('crm_tasks').insert({
      title: String(form.get('title') || '').trim(),
      due_date: String(form.get('due_date') || '') || null,
      priority: String(form.get('priority') || 'normal'),
      company_id: String(form.get('company_id') || '') || null,
    })
    if (saveError) { setError(saveError.message); setSaving(false); return }
    await onSaved(); onClose()
  }
  return <InlineForm title="Add a next action" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-4"><input required name="title" className="form-input md:col-span-2" placeholder="What needs to happen?" /><input name="due_date" type="date" className="form-input" /><select name="priority" className="form-input"><option value="normal">Normal priority</option><option value="high">High priority</option><option value="urgent">Urgent</option><option value="low">Low priority</option></select><select name="company_id" className="form-input md:col-span-2"><option value="">No company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select><div className="flex gap-3 md:col-span-2 md:justify-end">{error ? <p className="mr-auto text-xs font-bold text-red-600">{error}</p> : null}<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button><button disabled={saving} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white">{saving ? 'Saving...' : 'Add task'}</button></div></form></InlineForm>
}

function ActivityForm({ companies, onClose, onSaved }: { companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    const { error: saveError } = await supabase.from('crm_activities').insert({
      activity_type: String(form.get('activity_type') || 'note'),
      summary: String(form.get('summary') || '').trim(),
      company_id: String(form.get('company_id') || '') || null,
    })
    if (saveError) { setError(saveError.message); setSaving(false); return }
    await onSaved(); onClose()
  }
  return <InlineForm title="Log relationship activity" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-4"><select required name="company_id" className="form-input"><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select><select name="activity_type" className="form-input"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="health_check">Health check</option><option value="proposal">Proposal</option></select><input required name="summary" className="form-input md:col-span-2" placeholder="What happened and what matters next?" /><div className="flex gap-3 md:col-span-4 md:justify-end">{error ? <p className="mr-auto text-xs font-bold text-red-600">{error}</p> : null}<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button><button disabled={saving} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white">{saving ? 'Saving...' : 'Log activity'}</button></div></form></InlineForm>
}

function InlineForm({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <section className="mb-6 rounded-2xl border border-red-200 bg-white p-5 shadow-lg"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black text-stone-950">{title}</h2><button type="button" onClick={onClose} className="text-sm font-bold text-stone-400">Close</button></div>{children}</section>
}
function Metric({ label, value, helper, urgent = false }: { label: string; value: string | number; helper?: string; urgent?: boolean }) { return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'}`}><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-3 text-3xl font-black ${urgent ? 'text-red-600' : 'text-stone-950'}`}>{value}</p>{helper ? <p className="mt-1 text-xs text-stone-400">{helper}</p> : null}</div> }
function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) { return <div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">{eyebrow}</p><h2 className="mt-1 text-xl font-black text-stone-950">{title}</h2></div>{action}</div> }
function Priority({ value }: { value: string }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${value === 'urgent' ? 'bg-red-100 text-red-700' : value === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}>{value}</span> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm leading-6 text-stone-500">{text}</p> }
function companyName(value: Company | Company[] | null) { const company = Array.isArray(value) ? value[0] : value; return company?.company_name ?? 'No company' }
