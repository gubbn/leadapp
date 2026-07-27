'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { dealStages, DealStage, formatCurrency, formatShortDate, stageFor } from '@/lib/crm'

type Company = {
  id: string
  company_name: string
  number_of_users: number | null
  current_it_provider: string | null
  provider_renewal_date: string | null
}
type Contact = { id: string; first_name: string | null; last_name: string | null; role: string | null }
type Deal = {
  id: string
  company_id: string
  primary_contact_id: string | null
  name: string
  stage: DealStage
  annual_value: number | null
  number_of_users: number | null
  service_interest: string | null
  source: string | null
  current_provider: string | null
  renewal_date: string | null
  expected_close_date: string | null
  probability: number
  next_action: string | null
  next_action_due: string | null
  loss_reason: string | null
  notes: string | null
  companies: Company | Company[] | null
}
type Task = { id: string; title: string; due_date: string | null; priority: string; status: string }
type Activity = { id: string; activity_type: string; summary: string; outcome: string | null; occurred_at: string }
type HealthCheck = {
  id: string
  status: string
  scheduled_at: string | null
  review_at: string | null
  backups_status: string | null
  endpoint_protection_status: string | null
  mfa_status: string | null
  microsoft_365_status: string | null
  device_updates_status: string | null
  continuity_status: string | null
  key_findings: string | null
  recommendations: string | null
  report_url: string | null
}
type Proposal = {
  id: string
  status: string
  annual_value: number
  contract_months: number
  services: string[]
  issued_on: string | null
  decision_due: string | null
  document_url: string | null
  follow_up_2_on: string | null
  follow_up_7_on: string | null
  follow_up_14_on: string | null
  lost_reason: string | null
}

const healthStatuses = [
  ['offered', 'Offered'],
  ['booked', 'Booked'],
  ['completed', 'Completed'],
  ['report_drafting', 'Report being prepared'],
  ['report_sent', 'Report sent'],
  ['review_booked', 'Review booked'],
  ['converted', 'Converted'],
  ['closed', 'Closed'],
]
const proposalStatuses = ['draft', 'sent', 'viewed', 'negotiation', 'accepted', 'rejected', 'expired']

export default function OpportunityWorkspace() {
  const params = useParams()
  const dealId = Array.isArray(params.id) ? params.id[0] : String(params.id ?? '')
  const [deal, setDeal] = useState<Deal | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [activities, setActivities] = useState<Activity[]>([])
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [panel, setPanel] = useState<'task' | 'activity' | 'health' | 'proposal' | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const dealResult = await supabase
      .from('deals')
      .select('*,companies(id,company_name,number_of_users,current_it_provider,provider_renewal_date)')
      .eq('id', dealId)
      .single()
    if (dealResult.error) { setError(dealResult.error.message); setLoading(false); return }
    const loadedDeal = dealResult.data as Deal
    const [contactsResult, tasksResult, activitiesResult, healthResult, proposalResult] = await Promise.all([
      supabase.from('contacts').select('id,first_name,last_name,role').eq('company_id', loadedDeal.company_id).eq('is_active', true),
      supabase.from('crm_tasks').select('id,title,due_date,priority,status').eq('deal_id', dealId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('crm_activities').select('id,activity_type,summary,outcome,occurred_at').eq('deal_id', dealId).order('occurred_at', { ascending: false }),
      supabase.from('it_health_checks').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
      supabase.from('proposals').select('*').eq('deal_id', dealId).order('created_at', { ascending: false }),
    ])
    const childError = [contactsResult.error, tasksResult.error, activitiesResult.error, healthResult.error, proposalResult.error].find(Boolean)
    if (childError) setError(childError.message)
    setDeal(loadedDeal)
    setContacts((contactsResult.data ?? []) as Contact[])
    setTasks((tasksResult.data ?? []) as Task[])
    setActivities((activitiesResult.data ?? []) as Activity[])
    setHealthChecks((healthResult.data ?? []) as HealthCheck[])
    setProposals((proposalResult.data ?? []) as Proposal[])
    setLoading(false)
  }, [dealId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const company = useMemo(() => {
    if (!deal) return null
    return Array.isArray(deal.companies) ? deal.companies[0] : deal.companies
  }, [deal])
  const openTasks = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status))

  async function saveDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!deal) return
    const form = new FormData(event.currentTarget)
    const stage = String(form.get('stage')) as DealStage
    setSaving(true); setError(''); setSuccess('')
    const payload = {
      name: String(form.get('name') || '').trim(),
      primary_contact_id: String(form.get('primary_contact_id') || '') || null,
      stage,
      probability: stageFor(stage).probability,
      annual_value: Number(form.get('annual_value') || 0) || null,
      number_of_users: Number(form.get('number_of_users') || 0) || null,
      service_interest: String(form.get('service_interest') || '').trim() || null,
      source: String(form.get('source') || '').trim() || null,
      current_provider: String(form.get('current_provider') || '').trim() || null,
      renewal_date: String(form.get('renewal_date') || '') || null,
      expected_close_date: String(form.get('expected_close_date') || '') || null,
      next_action: String(form.get('next_action') || '').trim() || null,
      next_action_due: String(form.get('next_action_due') || '') || null,
      loss_reason: String(form.get('loss_reason') || '').trim() || null,
      notes: String(form.get('notes') || '').trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error: saveError } = await supabase.from('deals').update(payload).eq('id', dealId)
    if (saveError) setError(saveError.message)
    else { setSuccess('Opportunity updated.'); await load() }
    setSaving(false)
  }

  async function completeTask(task: Task) {
    const { error: saveError } = await supabase.from('crm_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', task.id)
    if (saveError) setError(saveError.message); else await load()
  }

  async function changeHealthStatus(check: HealthCheck, status: string) {
    const update: Record<string, string | null> = { status, updated_at: new Date().toISOString() }
    if (status === 'completed') update.completed_at = new Date().toISOString()
    const { error: saveError } = await supabase.from('it_health_checks').update(update).eq('id', check.id)
    if (saveError) { setError(saveError.message); return }
    if (status === 'report_sent' && deal) {
      await supabase.from('deals').update({ stage: 'report_sent', probability: 50, updated_at: new Date().toISOString() }).eq('id', dealId)
      await supabase.from('crm_activities').insert({ activity_type: 'health_check', summary: 'IT Resilience Check report sent.', company_id: deal.company_id, deal_id: dealId })
    }
    await load()
  }

  async function changeProposalStatus(proposal: Proposal, status: string) {
    if (!deal) return
    const today = new Date().toISOString().slice(0, 10)
    const update: Record<string, string | null> = { status, updated_at: new Date().toISOString() }
    if (status === 'sent' && !proposal.issued_on) update.issued_on = today
    if (status === 'accepted') update.accepted_at = new Date().toISOString()
    const { error: saveError } = await supabase.from('proposals').update(update).eq('id', proposal.id)
    if (saveError) { setError(saveError.message); return }
    if (status === 'sent') {
      await supabase.from('deals').update({ stage: 'proposal', probability: 75, updated_at: new Date().toISOString() }).eq('id', dealId)
      const dates = [proposal.follow_up_2_on, proposal.follow_up_7_on, proposal.follow_up_14_on].filter(Boolean)
      if (dates.length) {
        await supabase.from('crm_tasks').insert(dates.map((date, index) => ({
          title: `Proposal follow-up ${index === 0 ? '2' : index === 1 ? '7' : '14'} days`,
          due_date: date,
          priority: index === 2 ? 'high' : 'normal',
          company_id: deal.company_id,
          deal_id: dealId,
        })))
      }
    }
    if (status === 'accepted') {
      await supabase.from('deals').update({ stage: 'won', probability: 100, annual_value: proposal.annual_value, updated_at: new Date().toISOString() }).eq('id', dealId)
    }
    await supabase.from('crm_activities').insert({ activity_type: 'proposal', summary: `Proposal status changed to ${status}.`, company_id: deal.company_id, deal_id: dealId })
    await load()
  }

  if (loading) return <div className="mx-auto max-w-7xl px-4 py-12 text-sm font-bold text-stone-500">Loading opportunity...</div>
  if (!deal) return <div className="mx-auto max-w-7xl px-4 py-12 text-sm font-bold text-red-600">{error || 'Opportunity not found.'}</div>

  return <>
    <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50"><div className="mx-auto max-w-7xl px-4 py-9"><Link href="/sales" className="text-sm font-black text-red-600">← Back to pipeline</Link><div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Opportunity · {stageFor(deal.stage).label}</p><h1 className="mt-2 text-4xl font-black tracking-tight text-stone-950">{deal.name}</h1><Link href={`/companies/${deal.company_id}`} className="mt-3 inline-block text-sm font-bold text-stone-500 hover:text-red-600">{company?.company_name}</Link></div><div className="flex flex-wrap gap-3"><QuickButton label="+ Task" onClick={() => setPanel('task')} /><QuickButton label="Log activity" onClick={() => setPanel('activity')} /><QuickButton label="Book health check" onClick={() => setPanel('health')} /><QuickButton label="Create proposal" onClick={() => setPanel('proposal')} dark /></div></div></div></section>
    <section className="mx-auto max-w-7xl px-4 py-8">
      {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      {success ? <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</p> : null}
      {panel === 'task' ? <AddTask deal={deal} onClose={() => setPanel(null)} onSaved={load} /> : null}
      {panel === 'activity' ? <AddActivity deal={deal} contacts={contacts} onClose={() => setPanel(null)} onSaved={load} /> : null}
      {panel === 'health' ? <AddHealthCheck deal={deal} contacts={contacts} onClose={() => setPanel(null)} onSaved={load} /> : null}
      {panel === 'proposal' ? <AddProposal deal={deal} onClose={() => setPanel(null)} onSaved={load} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Annual value" value={formatCurrency(deal.annual_value)} /><Metric label="Contract value" value={formatCurrency(Number(deal.annual_value ?? 0) * 3)} /><Metric label="Users" value={deal.number_of_users ?? company?.number_of_users ?? 'Unknown'} /><Metric label="Open tasks" value={openTasks.length} urgent={openTasks.some((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10))} /><Metric label="Renewal" value={formatShortDate(deal.renewal_date ?? company?.provider_renewal_date)} /></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={saveDeal} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <SectionTitle eyebrow="Commercial record" title="Opportunity details" />
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Opportunity name"><input required name="name" defaultValue={deal.name} className="form-input" /></Field>
            <Field label="Primary contact"><select name="primary_contact_id" defaultValue={deal.primary_contact_id ?? ''} className="form-input"><option value="">Not assigned</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}{contact.role ? ` · ${contact.role}` : ''}</option>)}</select></Field>
            <Field label="Stage"><select name="stage" defaultValue={deal.stage} className="form-input">{dealStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></Field>
            <Field label="Annual value (£)"><input name="annual_value" type="number" min="0" defaultValue={deal.annual_value ?? ''} className="form-input" /></Field>
            <Field label="Number of users"><input name="number_of_users" type="number" min="0" defaultValue={deal.number_of_users ?? company?.number_of_users ?? ''} className="form-input" /></Field>
            <Field label="Services"><input name="service_interest" defaultValue={deal.service_interest ?? ''} className="form-input" placeholder="Managed IT, cyber, Microsoft 365..." /></Field>
            <Field label="Lead source"><input name="source" defaultValue={deal.source ?? ''} className="form-input" /></Field>
            <Field label="Current provider"><input name="current_provider" defaultValue={deal.current_provider ?? company?.current_it_provider ?? ''} className="form-input" /></Field>
            <Field label="Provider renewal"><input name="renewal_date" type="date" defaultValue={deal.renewal_date ?? company?.provider_renewal_date ?? ''} className="form-input" /></Field>
            <Field label="Expected decision"><input name="expected_close_date" type="date" defaultValue={deal.expected_close_date ?? ''} className="form-input" /></Field>
            <Field label="Next action"><input name="next_action" defaultValue={deal.next_action ?? ''} className="form-input" placeholder="Person, action and outcome" /></Field>
            <Field label="Next action due"><input name="next_action_due" type="date" defaultValue={deal.next_action_due ?? ''} className="form-input" /></Field>
            <Field label="Loss reason"><input name="loss_reason" defaultValue={deal.loss_reason ?? ''} className="form-input" /></Field>
            <Field label="Notes"><textarea name="notes" rows={3} defaultValue={deal.notes ?? ''} className="form-input resize-y" /></Field>
          </div>
          <div className="mt-6 flex justify-end"><button disabled={saving} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white">{saving ? 'Saving...' : 'Save opportunity'}</button></div>
        </form>
        <div className="space-y-6">
          <Card eyebrow="Next actions" title="Tasks">{openTasks.length ? openTasks.map((task) => <div key={task.id} className="flex items-start gap-3 rounded-xl bg-stone-50 p-4"><button onClick={() => void completeTask(task)} className="mt-0.5 h-5 w-5 rounded-full border-2 border-stone-300 hover:border-emerald-500" /><div><p className="text-sm font-black text-stone-900">{task.title}</p><p className="mt-1 text-xs text-stone-500">{formatShortDate(task.due_date)} · {task.priority}</p></div></div>) : <Empty text="No open tasks for this opportunity." />}</Card>
          <Card eyebrow="Relationship history" title="Activity">{activities.length ? activities.slice(0, 10).map((activity) => <div key={activity.id} className="border-l-2 border-red-100 pl-4"><span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black uppercase text-stone-500">{activity.activity_type.replace('_', ' ')}</span><p className="mt-2 text-sm font-bold leading-6 text-stone-800">{activity.summary}</p><p className="mt-1 text-[10px] font-bold text-stone-400">{new Date(activity.occurred_at).toLocaleString('en-GB')}</p></div>) : <Empty text="No activity logged for this opportunity." />}</Card>
        </div>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card eyebrow="Lead offer" title="IT Resilience Checks">{healthChecks.length ? healthChecks.map((check) => <div key={check.id} className="rounded-xl border border-stone-200 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-black text-stone-900">{check.scheduled_at ? new Date(check.scheduled_at).toLocaleString('en-GB') : 'Not scheduled'}</p><p className="mt-1 text-xs text-stone-500">{check.key_findings || 'Findings not recorded yet.'}</p></div><select value={check.status} onChange={(event) => void changeHealthStatus(check, event.target.value)} className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-black">{healthStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{check.report_url ? <a href={check.report_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-red-600">Open report →</a> : null}</div>) : <Empty text="No resilience check created yet." />}</Card>
        <Card eyebrow="Commercial decision" title="Proposals">{proposals.length ? proposals.map((proposal) => <div key={proposal.id} className="rounded-xl border border-stone-200 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-lg font-black text-stone-900">{formatCurrency(proposal.annual_value)} / year</p><p className="mt-1 text-xs text-stone-500">{proposal.contract_months} months · {proposal.services.join(', ') || 'Services not listed'}</p></div><select value={proposal.status} onChange={(event) => void changeProposalStatus(proposal, event.target.value)} className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-black">{proposalStatuses.map((status) => <option key={status}>{status}</option>)}</select></div><p className="mt-3 text-xs text-stone-500">Decision due: {formatShortDate(proposal.decision_due)}</p>{proposal.document_url ? <a href={proposal.document_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-black text-red-600">Open proposal →</a> : null}</div>) : <Empty text="No proposal created yet." />}</Card>
      </div>
    </section>
  </>
}

function AddTask({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const { error: saveError } = await supabase.from('crm_tasks').insert({ title: String(form.get('title') || '').trim(), due_date: String(form.get('due_date') || '') || null, priority: String(form.get('priority') || 'normal'), company_id: deal.company_id, deal_id: deal.id }); if (saveError) setError(saveError.message); else { await onSaved(); onClose() } }
  return <InlinePanel title="Add opportunity task" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-4"><input required name="title" className="form-input md:col-span-2" placeholder="What needs to happen?" /><input name="due_date" type="date" className="form-input" /><select name="priority" className="form-input"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select><PanelActions error={error} onClose={onClose} label="Add task" /></form></InlinePanel>
}
function AddActivity({ deal, contacts, onClose, onSaved }: { deal: Deal; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const { error: saveError } = await supabase.from('crm_activities').insert({ activity_type: String(form.get('activity_type') || 'note'), summary: String(form.get('summary') || '').trim(), outcome: String(form.get('outcome') || '').trim() || null, contact_id: String(form.get('contact_id') || '') || null, company_id: deal.company_id, deal_id: deal.id }); if (saveError) setError(saveError.message); else { await onSaved(); onClose() } }
  return <InlinePanel title="Log opportunity activity" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-4"><select name="activity_type" className="form-input"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="health_check">Health check</option><option value="proposal">Proposal</option></select><select name="contact_id" className="form-input"><option value="">No contact</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}</select><input required name="summary" className="form-input md:col-span-2" placeholder="What happened?" /><input name="outcome" className="form-input md:col-span-2" placeholder="Outcome or agreed next step" /><PanelActions error={error} onClose={onClose} label="Log activity" /></form></InlinePanel>
}
function AddHealthCheck({ deal, contacts, onClose, onSaved }: { deal: Deal; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const scheduled = String(form.get('scheduled_at') || '') || null; const { data, error: saveError } = await supabase.from('it_health_checks').insert({ company_id: deal.company_id, deal_id: deal.id, primary_contact_id: String(form.get('primary_contact_id') || '') || null, status: scheduled ? 'booked' : 'offered', scheduled_at: scheduled ? new Date(scheduled).toISOString() : null, key_findings: String(form.get('key_findings') || '').trim() || null, recommendations: String(form.get('recommendations') || '').trim() || null, report_url: String(form.get('report_url') || '').trim() || null }).select('id').single(); if (saveError) { setError(saveError.message); return } if (scheduled) await supabase.from('crm_tasks').insert({ title: 'Complete IT Resilience Check', due_date: scheduled.slice(0, 10), priority: 'high', company_id: deal.company_id, deal_id: deal.id }); await supabase.from('deals').update({ stage: 'health_check', probability: 40, updated_at: new Date().toISOString() }).eq('id', deal.id); await supabase.from('crm_activities').insert({ activity_type: 'health_check', summary: scheduled ? 'IT Resilience Check booked.' : 'IT Resilience Check offered.', company_id: deal.company_id, deal_id: deal.id, outcome: data?.id ?? null }); await onSaved(); onClose() }
  return <InlinePanel title="Create IT Resilience Check" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><select name="primary_contact_id" className="form-input"><option value="">No contact selected</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}</select><input name="scheduled_at" type="datetime-local" className="form-input" /><input name="report_url" type="url" className="form-input lg:col-span-2" placeholder="Report link (can add later)" /><textarea name="key_findings" rows={3} className="form-input resize-y lg:col-span-2" placeholder="Key findings" /><textarea name="recommendations" rows={3} className="form-input resize-y lg:col-span-2" placeholder="Recommendations" /><PanelActions error={error} onClose={onClose} label="Create health check" /></form></InlinePanel>
}
function AddProposal({ deal, onClose, onSaved }: { deal: Deal; onClose: () => void; onSaved: () => Promise<void> }) {
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const issuedOn = String(form.get('issued_on') || '') || null; const addDays = (days: number) => { if (!issuedOn) return null; const date = new Date(`${issuedOn}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }; const { error: saveError } = await supabase.from('proposals').insert({ company_id: deal.company_id, deal_id: deal.id, status: issuedOn ? 'sent' : 'draft', annual_value: Number(form.get('annual_value') || 0), contract_months: Number(form.get('contract_months') || 36), services: String(form.get('services') || '').split(',').map((value) => value.trim()).filter(Boolean), issued_on: issuedOn, decision_due: String(form.get('decision_due') || '') || null, document_url: String(form.get('document_url') || '').trim() || null, follow_up_2_on: addDays(2), follow_up_7_on: addDays(7), follow_up_14_on: addDays(14), notes: String(form.get('notes') || '').trim() || null }); if (saveError) { setError(saveError.message); return } if (issuedOn) { await supabase.from('deals').update({ stage: 'proposal', probability: 75, updated_at: new Date().toISOString() }).eq('id', deal.id); const followUps = [2, 7, 14].map((days) => ({ title: `Proposal follow-up ${days} days`, due_date: addDays(days), priority: days === 14 ? 'high' : 'normal', company_id: deal.company_id, deal_id: deal.id })); await supabase.from('crm_tasks').insert(followUps) } await supabase.from('crm_activities').insert({ activity_type: 'proposal', summary: issuedOn ? 'Proposal issued.' : 'Proposal draft created.', company_id: deal.company_id, deal_id: deal.id }); await onSaved(); onClose() }
  return <InlinePanel title="Create proposal" onClose={onClose}><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><input required name="annual_value" type="number" min="0" defaultValue={deal.annual_value ?? ''} className="form-input" placeholder="Annual value (£)" /><input required name="contract_months" type="number" min="1" defaultValue={36} className="form-input" /><input name="issued_on" type="date" className="form-input" /><input name="decision_due" type="date" className="form-input" /><input name="services" className="form-input lg:col-span-2" defaultValue={deal.service_interest ?? ''} placeholder="Managed IT, cybersecurity, Microsoft 365" /><input name="document_url" type="url" className="form-input lg:col-span-2" placeholder="Proposal document link" /><textarea name="notes" rows={2} className="form-input resize-y lg:col-span-4" placeholder="Commercial notes" /><PanelActions error={error} onClose={onClose} label="Create proposal" /></form></InlinePanel>
}

function PanelActions({ error, onClose, label }: { error: string; onClose: () => void; label: string }) { return <div className="flex items-center justify-end gap-3 md:col-span-2 lg:col-span-4">{error ? <p className="mr-auto text-xs font-bold text-red-600">{error}</p> : null}<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button><button className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white">{label}</button></div> }
function InlinePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <section className="mb-6 rounded-2xl border border-red-200 bg-white p-5 shadow-lg"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black text-stone-950">{title}</h2><button onClick={onClose} className="text-sm font-bold text-stone-400">Close</button></div>{children}</section> }
function QuickButton({ label, onClick, dark = false }: { label: string; onClick: () => void; dark?: boolean }) { return <button onClick={onClick} className={`rounded-xl px-4 py-3 text-sm font-black shadow-sm ${dark ? 'bg-stone-950 text-white' : 'border border-stone-300 bg-white text-stone-800'}`}>{label}</button> }
function Metric({ label, value, urgent = false }: { label: string; value: string | number; urgent?: boolean }) { return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'}`}><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-3 text-2xl font-black ${urgent ? 'text-red-600' : 'text-stone-950'}`}>{value}</p></div> }
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) { return <div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">{eyebrow}</p><h2 className="mt-1 text-2xl font-black text-stone-950">{title}</h2></div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-sm font-black text-stone-700">{label}</span>{children}</label> }
function Card({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><SectionTitle eyebrow={eyebrow} title={title} /><div className="mt-5 space-y-4">{children}</div></section> }
function Empty({ text }: { text: string }) { return <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm leading-6 text-stone-500">{text}</p> }
function contactName(contact: Contact) { return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Unnamed contact' }
