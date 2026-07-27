'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { activeDealStages, dealStages, DealStage, formatCurrency, formatShortDate, stageFor } from '@/lib/crm'

type Company = { id: string; company_name: string }
type Deal = {
  id: string
  company_id: string
  name: string
  stage: DealStage
  annual_value: number | null
  number_of_users: number | null
  next_action: string | null
  next_action_due: string | null
  probability: number
  source: string | null
  companies: Company | Company[] | null
}

export default function SalesPipeline() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<'active' | 'closed'>('active')

  const load = useCallback(async () => {
    setLoading(true)
    const [dealResult, companyResult] = await Promise.all([
      supabase.from('deals').select('id,company_id,name,stage,annual_value,number_of_users,next_action,next_action_due,probability,source,companies(id,company_name)').order('updated_at', { ascending: false }),
      supabase.from('companies').select('id,company_name').order('company_name'),
    ])
    if (dealResult.error || companyResult.error) setError((dealResult.error || companyResult.error)?.message ?? '')
    setDeals((dealResult.data ?? []) as Deal[])
    setCompanies((companyResult.data ?? []) as Company[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const activeDeals = deals.filter((deal) => !['won', 'lost', 'nurture'].includes(deal.stage))
  const closedDeals = deals.filter((deal) => ['won', 'lost', 'nurture'].includes(deal.stage))
  const pipelineValue = activeDeals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0)
  const weightedValue = activeDeals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0) * deal.probability / 100, 0)
  const wonValue = deals.filter((deal) => deal.stage === 'won').reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0)
  const shownStages = view === 'active' ? activeDealStages : dealStages.filter((stage) => ['won', 'lost', 'nurture'].includes(stage.key))

  async function moveDeal(deal: Deal, stage: DealStage) {
    const probability = stageFor(stage).probability
    setDeals((current) => current.map((item) => item.id === deal.id ? { ...item, stage, probability } : item))
    const { error: saveError } = await supabase.from('deals').update({ stage, probability, updated_at: new Date().toISOString() }).eq('id', deal.id)
    if (saveError) { setError(saveError.message); await load(); return }
    await supabase.from('crm_activities').insert({
      activity_type: 'status_change',
      summary: `Deal moved to ${stageFor(stage).label}.`,
      company_id: deal.company_id,
      deal_id: deal.id,
    })
  }

  return <>
    <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50"><div className="mx-auto max-w-[96rem] px-4 py-9"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">Sales pipeline</p><h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">Every deal needs a next action.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">Track the journey from first conversation to managed support contract.</p></div><button onClick={() => setShowForm(true)} className="self-start rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700">+ New opportunity</button></div></div></section>
    <section className="mx-auto max-w-[96rem] px-4 py-8">
      {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      {showForm ? <DealForm companies={companies} onClose={() => setShowForm(false)} onSaved={load} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Open deals" value={activeDeals.length} /><Metric label="Pipeline value" value={formatCurrency(pipelineValue)} /><Metric label="Weighted forecast" value={formatCurrency(weightedValue)} /><Metric label="Won annual value" value={formatCurrency(wonValue)} /></div>
      <div className="mt-6 flex gap-2"><button onClick={() => setView('active')} className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'active' ? 'bg-stone-950 text-white' : 'bg-white text-stone-600'}`}>Active pipeline</button><button onClick={() => setView('closed')} className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'closed' ? 'bg-stone-950 text-white' : 'bg-white text-stone-600'}`}>Won, lost and nurture</button></div>
      {loading ? <p className="mt-6 rounded-2xl bg-white p-8 text-sm font-bold text-stone-500">Loading pipeline...</p> : <div className="mt-5 overflow-x-auto pb-4"><div className="flex min-w-max gap-4">{shownStages.map((stage) => { const stageDeals = (view === 'active' ? activeDeals : closedDeals).filter((deal) => deal.stage === stage.key); const value = stageDeals.reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0); return <section key={stage.key} className="w-72 shrink-0 rounded-2xl bg-stone-200/60 p-3"><div className="flex items-start justify-between gap-3 px-1 py-2"><div><h2 className="text-sm font-black text-stone-900">{stage.label}</h2><p className="mt-1 text-xs font-bold text-stone-500">{stageDeals.length} deals · {formatCurrency(value)}</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-stone-500">{stage.probability}%</span></div><div className="mt-2 space-y-3">{stageDeals.length ? stageDeals.map((deal) => <DealCard key={deal.id} deal={deal} onMove={moveDeal} />) : <p className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-4 text-xs text-stone-400">No deals in this stage.</p>}</div></section> })}</div></div>}
    </section>
  </>
}

function DealCard({ deal, onMove }: { deal: Deal; onMove: (deal: Deal, stage: DealStage) => Promise<void> }) {
  const company = Array.isArray(deal.companies) ? deal.companies[0] : deal.companies
  const overdue = deal.next_action_due && deal.next_action_due < new Date().toISOString().slice(0, 10)
  return <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><Link href={`/sales/${deal.id}`} className="text-sm font-black text-stone-950 hover:text-red-600">{deal.name}</Link><Link href={`/companies/${deal.company_id}`} className="mt-1 block text-xs font-bold text-red-600">{company?.company_name ?? 'Company'}</Link></div><p className="text-sm font-black text-stone-900">{formatCurrency(deal.annual_value)}</p></div><div className="mt-3 flex gap-2 text-[10px] font-black uppercase text-stone-500"><span className="rounded-full bg-stone-100 px-2 py-1">{deal.number_of_users ?? '?'} users</span>{deal.source ? <span className="rounded-full bg-stone-100 px-2 py-1">{deal.source}</span> : null}</div><div className={`mt-3 rounded-lg p-3 text-xs leading-5 ${overdue ? 'bg-red-50 font-bold text-red-700' : 'bg-stone-50 text-stone-600'}`}><p>{deal.next_action || 'No next action set'}</p><p className="mt-1 text-[10px] font-black uppercase opacity-70">{formatShortDate(deal.next_action_due)}</p></div><select value={deal.stage} onChange={(event) => void onMove(deal, event.target.value as DealStage)} className="form-input mt-3 text-xs">{dealStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></article>
}

function DealForm({ companies, onClose, onSaved }: { companies: Company[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const selectedCompanyName = useMemo(() => new Map(companies.map((company) => [company.id, company.company_name])), [companies])
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const companyId = String(form.get('company_id') || ''); setSaving(true); const { error: saveError } = await supabase.from('deals').insert({ company_id: companyId, name: String(form.get('name') || '').trim() || `${selectedCompanyName.get(companyId) ?? 'Company'} managed IT opportunity`, annual_value: Number(form.get('annual_value') || 0) || null, number_of_users: Number(form.get('number_of_users') || 0) || null, source: String(form.get('source') || '').trim() || null, next_action: String(form.get('next_action') || '').trim() || null, next_action_due: String(form.get('next_action_due') || '') || null, stage: 'new', probability: 10 }); if (saveError) { setError(saveError.message); setSaving(false); return } await onSaved(); onClose() }
  return <section className="mb-6 rounded-2xl border border-red-200 bg-white p-5 shadow-lg"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-red-600">New opportunity</p><h2 className="mt-1 text-2xl font-black text-stone-950">Start with fit, value and next action.</h2></div><button onClick={onClose} className="text-sm font-bold text-stone-400">Close</button></div><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><select required name="company_id" className="form-input"><option value="">Choose company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select><input name="name" className="form-input" placeholder="Opportunity name (optional)" /><input name="annual_value" type="number" min="0" className="form-input" placeholder="Annual value (£)" /><input name="number_of_users" type="number" min="0" className="form-input" placeholder="Number of users" /><input name="source" className="form-input" placeholder="Lead source" /><input name="next_action" className="form-input lg:col-span-2" placeholder="Next action" /><input name="next_action_due" type="date" className="form-input" /><div className="flex items-center justify-end gap-3 md:col-span-2 lg:col-span-4">{error ? <p className="mr-auto text-xs font-bold text-red-600">{error}</p> : null}<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button><button disabled={saving} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white">{saving ? 'Saving...' : 'Create opportunity'}</button></div></form></section>
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className="mt-3 text-3xl font-black text-stone-950">{value}</p></div> }
