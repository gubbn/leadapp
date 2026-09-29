'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  ListChecks,
  MessageSquareText,
  Plus,
  Radar,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency, formatShortDate, normalizeDealStage, stageFor } from '@/lib/crm'

type Company = {
  id: string
  company_name: string
  prospecting_status?: 'research' | 'qualified' | 'nurture' | 'disqualified'
  relationship_status?: string | null
  customer_contract_end?: string | null
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
type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  next_contact_opportunity: string | null
  companies: Company | Company[] | null
}
type Quote = {
  id: string
  quote_number: string
  chase_due_date: string
  status: string
  companies: Company | Company[] | null
}
type NextAction = {
  id: string
  title: string
  detail: string
  dueDate: string | null
  href: string
  kind: 'task' | 'opportunity' | 'contact' | 'customer' | 'quote'
  task?: Task
  deal?: Deal
}

const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const today = londonDate.format(new Date())
const daysUntilSunday = 7 - new Date(`${today}T12:00:00Z`).getUTCDay()
const endOfWeek = new Date(`${today}T12:00:00Z`)
endOfWeek.setUTCDate(endOfWeek.getUTCDate() + daysUntilSunday)
const endOfWeekDate = endOfWeek.toISOString().slice(0, 10)
const stalledCutoff = Date.now() - 14 * 86400000
const nurtureCutoff = Date.now() - 10 * 86400000
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
  const [contacts, setContacts] = useState<Contact[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [contactCount, setContactCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    const [companiesResult, contactsResult, tasksResult, dealsResult, activitiesResult, quotesResult] =
      await Promise.all([
        supabase.from('companies').select('id,company_name,prospecting_status,relationship_status,customer_contract_end').order('company_name'),
        supabase.from('contacts').select('id,first_name,last_name,next_contact_opportunity,companies(id,company_name)', { count: 'exact' }).eq('is_active', true),
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
        supabase
          .from('quotes')
          .select('id,quote_number,chase_due_date,status,companies(id,company_name)')
          .in('status', ['issued', 'chased'])
          .order('chase_due_date'),
      ])

    const firstError = [
      companiesResult.error,
      contactsResult.error,
      tasksResult.error,
      dealsResult.error,
      activitiesResult.error,
      quotesResult.error,
    ].find(Boolean)

    if (firstError) setError(firstError.message)
    const uniqueCompanies = dedupeCompanies((companiesResult.data ?? []) as Company[])
    const uniqueContacts = dedupeContacts((contactsResult.data ?? []) as Contact[])
    setCompanies(uniqueCompanies)
    setContactCount(uniqueContacts.length)
    setContacts(uniqueContacts)
    setQuotes((quotesResult.data ?? []) as Quote[])
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
  const visibleDeals = useMemo(
    () => deals.filter((deal) => normalizeDealStage(deal.stage) !== 'nurture' || new Date(deal.updated_at).getTime() <= nurtureCutoff),
    [deals],
  )
  const nextActions = useMemo<NextAction[]>(() => {
    const datedTasks = tasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.title,
      detail: companyName(task.companies),
      dueDate: task.due_date,
      href: '#tasks',
      kind: 'task' as const,
      task,
    }))
    const datedDeals = visibleDeals.flatMap((deal) => {
      const stage = normalizeDealStage(deal.stage)
      if (stage === 'nurture') return [{
        id: `deal-${deal.id}`,
        title: `Continue nurturing: ${deal.name}`,
        detail: `${companyName(deal.companies)} · no update for 10 days`,
        dueDate: addDays(deal.updated_at.slice(0, 10), 10),
        href: `/sales/${deal.id}`,
        kind: 'opportunity' as const,
        deal,
      }]
      return deal.next_action_due ? [{
        id: `deal-${deal.id}`,
        title: deal.next_action || deal.name,
        detail: `${companyName(deal.companies)} · opportunity`,
        dueDate: deal.next_action_due,
        href: `/sales/${deal.id}`,
        kind: 'opportunity' as const,
        deal,
      }] : []
    })
    const customerDates = companies.flatMap((company) =>
      company.relationship_status === 'customer' && company.customer_contract_end ? [{
        id: `customer-${company.id}`,
        title: `Review ${company.company_name} contract`,
        detail: 'Customer contract end',
        dueDate: company.customer_contract_end,
        href: `/companies/${company.id}`,
        kind: 'customer' as const,
      }] : [],
    )
    const quoteChases = quotes.filter((quote) => quote.chase_due_date <= today).map((quote) => ({
      id: `quote-${quote.id}`,
      title: `Chase quote ${quote.quote_number}`,
      detail: `${companyName(quote.companies)} · quote follow-up`,
      dueDate: quote.chase_due_date,
      href: '/quotes',
      kind: 'quote' as const,
    }))
    const companiesWithUpdates = new Set([
      ...datedTasks.map((action) => companyIdentity(action.task.companies)),
      ...datedDeals.map((action) => companyIdentity(action.deal.companies)),
      ...companies
        .filter((company) => company.relationship_status === 'customer' && company.customer_contract_end)
        .map((company) => companyIdentityFromName(company.company_name)),
      ...quotes.filter((quote) => quote.chase_due_date <= today).map((quote) => companyIdentity(quote.companies)),
    ].filter(Boolean))
    const datedContacts = contacts.flatMap((contact) => {
      if (!contact.next_contact_opportunity) return []
      const contactCompany = companyIdentity(contact.companies)
      if (contactCompany && companiesWithUpdates.has(contactCompany)) return []
      return [{
        id: `contact-${contact.id}`,
        title: `Follow up with ${contactName(contact)}`,
        detail: `${companyName(contact.companies)} · contact`,
        dueDate: contact.next_contact_opportunity,
        href: '/contacts',
        kind: 'contact' as const,
      }]
    })

    return [...datedTasks, ...datedDeals, ...datedContacts, ...customerDates, ...quoteChases]
      .sort((first, second) => (first.dueDate ?? '9999-12-31').localeCompare(second.dueDate ?? '9999-12-31'))
  }, [companies, contacts, quotes, tasks, visibleDeals])
  const stalledDeals = useMemo(() => {
    return visibleDeals.filter(
      (deal) =>
        normalizeDealStage(deal.stage) !== 'nurture' && (
          !deal.next_action ||
          !deal.next_action_due ||
          new Date(deal.updated_at).getTime() < stalledCutoff
        ),
    )
  }, [visibleDeals])
  const activePipelineDeals = deals.filter((deal) => !['nurture', 'lost', 'won'].includes(normalizeDealStage(deal.stage)))
  const pipelineValue = activePipelineDeals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0)
  const weightedValue = activePipelineDeals.reduce(
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
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-80" aria-hidden="true">
          <div className="absolute -right-20 -top-40 h-[30rem] w-[30rem] rounded-full bg-red-600/15 blur-3xl" />
          <div className="absolute bottom-0 left-[35%] h-px w-[45%] bg-gradient-to-r from-transparent via-red-400/50 to-transparent" />
        </div>
        <div className="relative mx-auto max-w-[96rem] px-4 py-8 sm:px-6 lg:py-10">
          <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-stone-200">
                  <CalendarDays size={14} className="text-red-400" />
                  <time dateTime={today}>{todayLabel}</time>
                </span>
                <span className="inline-flex items-center gap-2 text-stone-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Workspace live
                </span>
              </div>
              <h1 className="mt-5 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl lg:text-[3.5rem] lg:leading-[1.02]">
                Focus on what moves<br className="hidden sm:block" /> the relationship forward.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-stone-400">
                Your priorities, pipeline risks and latest conversations—distilled into one place to act.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <button onClick={() => setShowTaskForm(true)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white shadow-[0_10px_30px_rgba(221,63,39,0.24)] transition hover:-translate-y-0.5 hover:bg-red-500">
                <Plus size={17} strokeWidth={2.8} /> Add task
              </button>
              <button onClick={() => setShowActivityForm(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm font-black text-white transition hover:bg-white/12">
                <MessageSquareText size={17} /> Log activity
              </button>
              <Link href="/sales" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-stone-200 transition hover:border-white/25 hover:bg-white/8 hover:text-white">
                Pipeline <ArrowRight size={16} />
              </Link>
            </div>
          </div>

          <div className="mt-9 grid overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045] sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={<Clock3 size={17} />} label="Due now" value={dueToday.length} urgent={dueToday.length > 0} />
            <Metric icon={<CircleAlert size={17} />} label="Overdue" value={overdueTasks.length} urgent={overdueTasks.length > 0} />
            <Metric icon={<BriefcaseBusiness size={17} />} label="Open pipeline" value={formatCurrency(pipelineValue)} />
            <Metric icon={<TrendingUp size={17} />} label="Weighted forecast" value={formatCurrency(weightedValue)} />
            <Metric icon={<Building2 size={17} />} label="CRM reach" value={`${companies.length} / ${contactCount}`} helper="companies / contacts" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[96rem] px-4 py-7 sm:px-6 lg:py-9">
        {error ? <p role="alert" className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"><CircleAlert size={18} />{error}</p> : null}
        {showTaskForm ? <TaskForm companies={companies} onClose={() => setShowTaskForm(false)} onSaved={loadWorkspace} /> : null}
        {showActivityForm ? <ActivityForm companies={companies} onClose={() => setShowActivityForm(false)} onSaved={loadWorkspace} /> : null}

        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-sm font-bold text-stone-500 shadow-[0_8px_30px_rgba(16,19,18,0.04)]">
            Loading today&apos;s work...
          </div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
            <section id="tasks" className="scroll-mt-28 rounded-2xl border border-stone-200 bg-white shadow-[0_12px_40px_rgba(16,19,18,0.055)]">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 px-5 py-5 sm:px-6">
                <SectionTitle icon={<ListChecks size={18} />} eyebrow="Priority queue" title="Next actions" />
                <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-black text-stone-600">{nextActions.length} open</span>
              </div>
              <div className="divide-y divide-stone-100 px-5 sm:px-6">
                {nextActions.length ? nextActions.slice(0, 10).map((action) => (
                  <div key={action.id} className="group flex items-start gap-3 py-4">
                    {action.task ? (
                      <button onClick={() => void completeTask(action.task!)} title="Mark complete" aria-label={`Mark ${action.title} complete`} className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-stone-300 text-transparent transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-600">
                        <Check size={13} strokeWidth={3} />
                      </button>
                    ) : (
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-100 text-stone-500">
                        <ChevronRight size={14} strokeWidth={2.8} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={action.href} className="text-sm font-black text-stone-900 transition group-hover:text-red-600">{action.title}</Link>
                        {action.task ? <Priority value={action.task.priority} /> : <ActionType value={action.kind} />}
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-stone-500">
                        <span>{action.detail}</span>
                        <span className="text-stone-300">•</span>
                        <span className={dueDateTextTone(action.dueDate)}>{formatShortDate(action.dueDate)}</span>
                      </p>
                    </div>
                    <Link href={action.href} aria-label={`Open ${action.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-300 transition group-hover:bg-red-50 group-hover:text-red-600">
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                )) : <div className="py-6"><Empty text="Nothing is due. Add a next action to keep momentum visible." /></div>}
              </div>
            </section>

            <div className="grid gap-5">
              <Link href="/prospecting" className="group relative overflow-hidden rounded-2xl bg-red-600 p-5 text-white shadow-[0_12px_35px_rgba(221,63,39,0.2)] transition hover:-translate-y-0.5 hover:bg-red-500 sm:p-6">
                <Radar size={110} strokeWidth={0.7} className="absolute -bottom-7 -right-5 rotate-12 text-white/15 transition group-hover:rotate-6 group-hover:scale-105" />
                <div className="relative flex items-start justify-between gap-5">
                  <div>
                    <p className="text-[0.65rem] font-black uppercase tracking-[0.2em] text-red-100">Prospecting pulse</p>
                    <p className="mt-3 text-2xl font-black tracking-tight">{researchQueueCount} ready to research</p>
                    <p className="mt-2 text-sm leading-6 text-red-100">{qualifiedProspectCount} qualified and ready for a considered next step.</p>
                  </div>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-red-600"><ArrowRight size={17} /></span>
                </div>
              </Link>

              <section className="rounded-2xl border border-stone-200 bg-white shadow-[0_12px_40px_rgba(16,19,18,0.05)]">
                <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-5">
                  <SectionTitle icon={<CircleAlert size={18} />} eyebrow="Pipeline health" title="Needs attention" />
                  <Link href="/sales" className="text-xs font-black text-red-600 hover:text-red-700">View all</Link>
                </div>
                <div className="divide-y divide-stone-100 px-5">
                  {stalledDeals.length ? stalledDeals.slice(0, 5).map((deal) => (
                    <article key={deal.id} className="group py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link href={`/sales/${deal.id}`} className="truncate text-sm font-black text-stone-900 group-hover:text-red-600">{deal.name}</Link>
                          <p className="mt-1 text-xs text-stone-500">{companyName(deal.companies)} · {stageFor(deal.stage).label}</p>
                        </div>
                        <p className="shrink-0 text-sm font-black text-stone-900">{formatCurrency(deal.annual_value)}</p>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-800">
                        <Clock3 size={13} /> {deal.next_action || 'No next action set'} {deal.next_action_due ? `· ${formatShortDate(deal.next_action_due)}` : ''}
                      </p>
                    </article>
                  )) : <div className="py-5"><Empty text="Every open opportunity has a current next action." /></div>}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-stone-200 bg-white shadow-[0_12px_40px_rgba(16,19,18,0.05)] xl:col-span-2">
              <div className="flex items-center justify-between gap-4 border-b border-stone-100 px-5 py-5 sm:px-6">
                <SectionTitle icon={<Sparkles size={18} />} eyebrow="Relationship signal" title="Latest activity" />
                <span className="text-xs font-bold text-stone-400">Most recent first</span>
              </div>
              <div className="grid divide-y divide-stone-100 px-5 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4">
                {activities.length ? activities.slice(0, 8).map((activity, index) => (
                  <article key={activity.id} className={`py-5 sm:px-5 ${index === 0 ? 'sm:pl-0' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-2 py-1 text-[0.62rem] font-black uppercase tracking-wide text-stone-600">{activity.activity_type.replace('_', ' ')}</span>
                      <span className="text-[0.65rem] font-bold text-stone-400">{new Date(activity.occurred_at).toLocaleDateString('en-GB')}</span>
                    </div>
                    <p className="mt-3 text-sm font-bold leading-5 text-stone-800">{activity.summary}</p>
                    <p className="mt-2 text-xs font-bold text-red-600">{companyName(activity.companies)}</p>
                  </article>
                )) : <div className="col-span-full py-5"><Empty text="No activity logged yet." /></div>}
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
  return <section className="mb-6 rounded-2xl border border-red-200 bg-white p-5 shadow-[0_18px_50px_rgba(16,19,18,0.09)]"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-black tracking-tight text-stone-950">{title}</h2><button type="button" onClick={onClose} className="text-sm font-bold text-stone-500 hover:text-stone-950">Close</button></div>{children}</section>
}
function Metric({ icon, label, value, helper, urgent = false }: { icon: React.ReactNode; label: string; value: string | number; helper?: string; urgent?: boolean }) {
  return <div className="border-b border-white/10 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-5"><div className={`flex items-center gap-2 text-xs font-bold ${urgent ? 'text-red-300' : 'text-stone-400'}`}><span className={urgent ? 'text-red-400' : 'text-stone-500'}>{icon}</span>{label}</div><p className={`mt-3 text-2xl font-black tracking-tight lg:text-3xl ${urgent ? 'text-red-300' : 'text-white'}`}>{value}</p>{helper ? <p className="mt-1 text-[0.65rem] font-bold text-stone-500">{helper}</p> : null}</div>
}
function SectionTitle({ icon, eyebrow, title }: { icon: React.ReactNode; eyebrow: string; title: string }) { return <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600">{icon}</span><div><p className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-stone-400">{eyebrow}</p><h2 className="mt-0.5 text-lg font-black tracking-tight text-stone-950">{title}</h2></div></div> }
function Priority({ value }: { value: string }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${value === 'urgent' ? 'bg-red-100 text-red-700' : value === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}>{value}</span> }
function ActionType({ value }: { value: NextAction['kind'] }) { return <span className="rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase text-stone-600">{value}</span> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 p-5 text-sm leading-6 text-stone-500">{text}</p> }
function firstCompany(value: Company | Company[] | null) { return Array.isArray(value) ? value[0] : value }
function companyName(value: Company | Company[] | null) { return firstCompany(value)?.company_name ?? 'No company' }
function companyIdentity(value: Company | Company[] | null) { return companyIdentityFromName(firstCompany(value)?.company_name) }
function companyIdentityFromName(value: string | null | undefined) { return normaliseIdentity(value) }
function contactName(contact: Contact) { return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'contact' }
function normaliseIdentity(value: string | null | undefined) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(the|limited|ltd|plc|llp|incorporated|inc|company|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}
function dedupeCompanies(companies: Company[]) {
  const unique = new Map<string, Company>()
  for (const company of companies) {
    const key = normaliseIdentity(company.company_name) || company.id
    const existing = unique.get(key)
    if (!existing) unique.set(key, company)
    else unique.set(key, {
      ...existing,
      prospecting_status: existing.prospecting_status ?? company.prospecting_status,
      relationship_status: existing.relationship_status ?? company.relationship_status,
      customer_contract_end: earliestDate(existing.customer_contract_end, company.customer_contract_end),
    })
  }
  return [...unique.values()]
}
function dedupeContacts(contacts: Contact[]) {
  const unique = new Map<string, Contact>()
  for (const contact of contacts) {
    const company = firstCompany(contact.companies)
    const contactIdentity = [normaliseIdentity(contact.first_name), normaliseIdentity(contact.last_name)].filter(Boolean).join(' ')
    const key = contactIdentity ? `${contactIdentity}|${normaliseIdentity(company?.company_name)}` : contact.id
    const existing = unique.get(key)
    if (!existing) unique.set(key, contact)
    else if ((!existing.next_contact_opportunity && contact.next_contact_opportunity) || (contact.next_contact_opportunity && existing.next_contact_opportunity && contact.next_contact_opportunity < existing.next_contact_opportunity)) unique.set(key, contact)
  }
  return [...unique.values()]
}
function earliestDate(first: string | null | undefined, second: string | null | undefined) {
  if (!first) return second ?? null
  if (!second) return first
  return first < second ? first : second
}
function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
function dueDateTextTone(date: string | null) {
  if (!date) return 'font-bold text-stone-400'
  if (date < today) return 'font-black text-red-600'
  if (date === today) return 'font-black text-emerald-700'
  if (date <= endOfWeekDate) return 'font-black text-violet-700'
  return 'font-bold text-stone-500'
}
