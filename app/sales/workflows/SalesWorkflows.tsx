'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatCurrency, formatShortDate } from '@/lib/crm'

type CompanyRef = { id: string; company_name: string }
type DealRef = { id: string; name: string }
type HealthCheck = {
  id: string
  status: string
  scheduled_at: string | null
  review_at: string | null
  report_url: string | null
  companies: CompanyRef | CompanyRef[] | null
  deals: DealRef | DealRef[] | null
}
type Proposal = {
  id: string
  status: string
  annual_value: number
  decision_due: string | null
  issued_on: string | null
  companies: CompanyRef | CompanyRef[] | null
  deals: DealRef | DealRef[] | null
}
type Renewal = {
  id: string
  company_name: string
  current_it_provider: string | null
  provider_renewal_date: string | null
  customer_contract_end: string | null
  relationship_status: string | null
}

const currentDateKey = new Date().toISOString().slice(0, 10)
const currentTime = Date.now()
const ninetyDaysFromNow = (() => {
  const date = new Date(currentTime)
  date.setUTCDate(date.getUTCDate() + 90)
  return date.toISOString().slice(0, 10)
})()

export default function SalesWorkflows() {
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [renewals, setRenewals] = useState<Renewal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'health' | 'proposals' | 'renewals'>('health')

  const load = useCallback(async () => {
    setLoading(true)
    const [healthResult, proposalResult, renewalResult] = await Promise.all([
      supabase.from('it_health_checks').select('id,status,scheduled_at,review_at,report_url,companies(id,company_name),deals(id,name)').not('status', 'eq', 'closed').order('scheduled_at', { ascending: true, nullsFirst: false }),
      supabase.from('proposals').select('id,status,annual_value,decision_due,issued_on,companies(id,company_name),deals(id,name)').not('status', 'in', '("accepted","rejected","expired")').order('decision_due', { ascending: true, nullsFirst: false }),
      supabase.from('companies').select('id,company_name,current_it_provider,provider_renewal_date,customer_contract_end,relationship_status').or('provider_renewal_date.not.is.null,customer_contract_end.not.is.null').order('provider_renewal_date', { ascending: true, nullsFirst: false }),
    ])
    const firstError = [healthResult.error, proposalResult.error, renewalResult.error].find(Boolean)
    if (firstError) setError(firstError.message)
    setHealthChecks((healthResult.data ?? []) as HealthCheck[])
    setProposals((proposalResult.data ?? []) as Proposal[])
    setRenewals((renewalResult.data ?? []) as Renewal[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const dueProposals = useMemo(() => proposals.filter((proposal) => proposal.decision_due && proposal.decision_due <= currentDateKey), [proposals])
  const reportsOutstanding = healthChecks.filter((check) => ['completed', 'report_drafting'].includes(check.status)).length
  const renewals180 = renewals.filter((renewal) => {
    const value = renewal.relationship_status === 'customer' ? renewal.customer_contract_end : renewal.provider_renewal_date
    if (!value) return false
    const days = (new Date(`${value}T00:00:00Z`).getTime() - currentTime) / 86400000
    return days >= 0 && days <= 180
  }).length

  return <>
    <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50"><div className="mx-auto max-w-7xl px-4 py-9"><p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">Sales work queues</p><h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">Timing should never be accidental.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">See every health-check report, proposal decision and contract renewal that needs attention.</p></div></section>
    <section className="mx-auto max-w-7xl px-4 py-8">
      {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-3"><Metric label="Reports outstanding" value={reportsOutstanding} urgent={reportsOutstanding > 0} /><Metric label="Proposal decisions due" value={dueProposals.length} urgent={dueProposals.length > 0} /><Metric label="Renewals within 180 days" value={renewals180} /></div>
      <div className="mt-6 flex gap-2 overflow-x-auto">{([['health','Health checks'],['proposals','Proposals'],['renewals','Renewals']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-black ${view === key ? 'bg-stone-950 text-white' : 'bg-white text-stone-600'}`}>{label}</button>)}</div>
      {loading ? <p className="mt-6 rounded-2xl bg-white p-8 text-sm font-bold text-stone-500">Loading work queues...</p> : (
        <div className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm">
          {view === 'health' ? <Queue title="IT Resilience Checks" empty="No active health checks.">{healthChecks.map((check) => { const deal = one(check.deals); const company = one(check.companies); return <QueueRow key={check.id} title={company?.company_name ?? 'Company'} subtitle={`${label(check.status)} · ${check.scheduled_at ? new Date(check.scheduled_at).toLocaleString('en-GB') : 'Not scheduled'}`} badge={check.status} urgent={['completed','report_drafting'].includes(check.status)} href={deal ? `/sales/${deal.id}` : `/companies/${company?.id}`} /> })}</Queue> : null}
          {view === 'proposals' ? <Queue title="Open proposals" empty="No open proposals.">{proposals.map((proposal) => { const deal = one(proposal.deals); const company = one(proposal.companies); return <QueueRow key={proposal.id} title={`${company?.company_name ?? 'Company'} · ${formatCurrency(proposal.annual_value)}`} subtitle={`Issued ${formatShortDate(proposal.issued_on)} · Decision ${formatShortDate(proposal.decision_due)}`} badge={proposal.status} urgent={Boolean(proposal.decision_due && proposal.decision_due <= currentDateKey)} href={deal ? `/sales/${deal.id}` : `/companies/${company?.id}`} /> })}</Queue> : null}
          {view === 'renewals' ? <Queue title="Renewal calendar" empty="No renewal dates have been recorded.">{renewals.map((renewal) => { const customer = renewal.relationship_status === 'customer'; const date = customer ? renewal.customer_contract_end : renewal.provider_renewal_date; return <QueueRow key={renewal.id} title={renewal.company_name} subtitle={`${customer ? 'Fixing IT contract' : renewal.current_it_provider || 'Current provider'} · ${formatShortDate(date)}`} badge={customer ? 'customer renewal' : 'prospect timing'} urgent={Boolean(date && date <= ninetyDaysFromNow)} href={`/companies/${renewal.id}`} /> })}</Queue> : null}
        </div>
      )}
    </section>
  </>
}

function Queue({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const count = Array.isArray(children) ? children.length : children ? 1 : 0; return <section><div className="border-b border-stone-200 p-5"><h2 className="text-xl font-black text-stone-950">{title}</h2></div><div className="divide-y divide-stone-100">{count ? children : <p className="p-8 text-sm text-stone-500">{empty}</p>}</div></section> }
function QueueRow({ title, subtitle, badge, urgent, href }: { title: string; subtitle: string; badge: string; urgent: boolean; href: string }) { return <Link href={href} className={`flex flex-col justify-between gap-3 p-5 transition hover:bg-stone-50 sm:flex-row sm:items-center ${urgent ? 'bg-red-50/60' : ''}`}><div><p className="text-sm font-black text-stone-900">{title}</p><p className="mt-1 text-xs text-stone-500">{subtitle}</p></div><span className={`self-start rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${urgent ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-500'}`}>{label(badge)}</span></Link> }
function Metric({ label: title, value, urgent = false }: { label: string; value: number; urgent?: boolean }) { return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'}`}><p className="text-xs font-black uppercase tracking-wide text-stone-400">{title}</p><p className={`mt-3 text-3xl font-black ${urgent ? 'text-red-600' : 'text-stone-950'}`}>{value}</p></div> }
function one<T>(value: T | T[] | null) { return Array.isArray(value) ? value[0] : value }
function label(value: string) { return value.replaceAll('_', ' ') }
