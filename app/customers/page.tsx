'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '@/app/components/AppHeader'
import { formatCurrency, formatShortDate } from '@/lib/crm'
import { supabase } from '@/lib/supabaseClient'

type Customer = {
  id: string
  company_name: string
  industry: string | null
  location: string | null
  customer_contract_end: string | null
  contacts: { id: string }[] | null
  deals: { id: string; annual_value: number | null; stage: string }[] | null
  quotes: { id: string; status: string }[] | null
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: loadError } = await supabase
      .from('companies')
      .select('id,company_name,industry,location,customer_contract_end,contacts(id),deals(id,annual_value,stage),quotes(id,status)')
      .or('relationship_status.in.(customer,won),tags.cs.{#customer}')
      .order('company_name')
    if (loadError) setError(loadError.message)
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? customers.filter((customer) => [customer.company_name, customer.industry, customer.location].filter(Boolean).join(' ').toLowerCase().includes(term)) : customers
  }, [customers, search])
  const annualValue = customers.reduce((total, customer) => total + (customer.deals ?? []).filter((deal) => deal.stage === 'won').reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0), 0)
  const openQuotes = customers.reduce((total, customer) => total + (customer.quotes ?? []).filter((quote) => ['issued', 'chased'].includes(quote.status)).length, 0)

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">Customer zone</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">Every customer, in one place.</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">Won accounts pulled from the company relationship status, with their contacts, revenue and open quotes.</p>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-8">
        {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Metric label="Customers" value={customers.length} />
          <Metric label="Won annual value" value={formatCurrency(annualValue)} />
          <Metric label="Open quotes" value={openQuotes} urgent={openQuotes > 0} />
        </div>
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <label className="block max-w-xl">
            <span className="text-xs font-black uppercase tracking-wide text-stone-500">Search customers</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, industry or location" className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50" />
          </label>
        </div>
        {loading ? <p className="mt-6 rounded-2xl bg-white p-8 text-sm font-bold text-stone-500">Loading customers…</p> : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleCustomers.map((customer) => {
              const wonValue = (customer.deals ?? []).filter((deal) => deal.stage === 'won').reduce((sum, deal) => sum + Number(deal.annual_value ?? 0), 0)
              const quoteCount = (customer.quotes ?? []).filter((quote) => ['issued', 'chased'].includes(quote.status)).length
              return <Link key={customer.id} href={`/companies/${customer.id}`} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-black text-stone-950">{customer.company_name}</h2><p className="mt-1 text-sm text-stone-500">{[customer.industry, customer.location].filter(Boolean).join(' · ') || 'Details not set'}</p></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Customer</span></div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center"><SmallMetric label="Contacts" value={customer.contacts?.length ?? 0} /><SmallMetric label="Won value" value={formatCurrency(wonValue)} /><SmallMetric label="Open quotes" value={quoteCount} /></div>
                <p className="mt-4 text-xs font-bold text-stone-500">Contract end: {formatShortDate(customer.customer_contract_end)}</p>
              </Link>
            })}
            {!visibleCustomers.length ? <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-500">No customers match this search.</p> : null}
          </div>
        )}
      </section>
    </main>
  )
}

function Metric({ label, value, urgent = false }: { label: string; value: string | number; urgent?: boolean }) { return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'}`}><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-3 text-3xl font-black ${urgent ? 'text-red-600' : 'text-stone-950'}`}>{value}</p></div> }
function SmallMetric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl bg-stone-50 p-3"><p className="text-[9px] font-black uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 text-sm font-black text-stone-900">{value}</p></div> }
