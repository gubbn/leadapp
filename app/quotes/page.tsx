'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'
import { formatCurrency, formatShortDate } from '@/lib/crm'
import { supabase } from '@/lib/supabaseClient'

type Company = { id: string; company_name: string }
type Contact = { id: string; first_name: string | null; last_name: string | null; company_id: string | null }
type Quote = {
  id: string
  quote_number: string
  one_off_value: number | null
  subscription_value: number | null
  issued_on: string
  chase_due_date: string
  status: string
  companies: Company | Company[] | null
  contacts: Pick<Contact, 'id' | 'first_name' | 'last_name'> | Pick<Contact, 'id' | 'first_name' | 'last_name'>[] | null
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const statuses = ['issued', 'chased', 'won', 'lost', 'withdrawn']

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [quotesResult, companiesResult, contactsResult] = await Promise.all([
      supabase.from('quotes').select('id,quote_number,one_off_value,subscription_value,issued_on,chase_due_date,status,companies(id,company_name),contacts(id,first_name,last_name)').order('chase_due_date'),
      supabase.from('companies').select('id,company_name').order('company_name'),
      supabase.from('contacts').select('id,first_name,last_name,company_id').eq('is_active', true).order('last_name'),
    ])
    const firstError = [quotesResult.error, companiesResult.error, contactsResult.error].find(Boolean)
    if (firstError) setError(firstError.message)
    setQuotes((quotesResult.data ?? []) as Quote[])
    setCompanies((companiesResult.data ?? []) as Company[])
    setContacts((contactsResult.data ?? []) as Contact[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const totals = useMemo(() => ({
    open: quotes.filter((quote) => isOpen(quote.status)).length,
    due: quotes.filter((quote) => isOpen(quote.status) && quote.chase_due_date <= today).length,
    oneOff: quotes.filter((quote) => isOpen(quote.status)).reduce((sum, quote) => sum + Number(quote.one_off_value ?? 0), 0),
    subscriptions: quotes.filter((quote) => isOpen(quote.status)).reduce((sum, quote) => sum + Number(quote.subscription_value ?? 0), 0),
  }), [quotes])

  async function setStatus(quote: Quote, status: string) {
    const { error: saveError } = await supabase.from('quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', quote.id)
    if (saveError) setError(saveError.message)
    else await load()
  }

  return <main className="min-h-screen bg-stone-100 text-stone-900"><AppHeader />
    <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50"><div className="mx-auto max-w-7xl px-4 py-9"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">Quote tracker</p><h1 className="mt-4 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">Every quote has a next chase.</h1><p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">Track commercial value, the customer contact and the five-working-day follow-up.</p></div><button onClick={() => setShowForm(true)} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700">+ New quote</button></div></div></section>
    <section className="mx-auto max-w-7xl px-4 py-8">
      {error ? <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      {showForm ? <QuoteForm companies={companies} contacts={contacts} onClose={() => setShowForm(false)} onSaved={load} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Open quotes" value={totals.open} /><Metric label="Chases due" value={totals.due} urgent={totals.due > 0} /><Metric label="One-off value" value={formatCurrency(totals.oneOff)} /><Metric label="Subscription value" value={formatCurrency(totals.subscriptions)} /></div>
      <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="flex items-end justify-between border-b border-stone-200 p-5"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">Quote register</p><h2 className="mt-1 text-xl font-black text-stone-950">Quotes and chases</h2></div><Link href="/#tasks" className="text-xs font-black text-red-600">View Do next →</Link></div>{loading ? <p className="p-6 text-sm font-bold text-stone-500">Loading quotes...</p> : quotes.length ? <div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-stone-50 text-[10px] font-black uppercase tracking-wide text-stone-500"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Quote no.</th><th className="px-5 py-3">One-off</th><th className="px-5 py-3">Subscription</th><th className="px-5 py-3">Chase</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{quotes.map((quote) => <tr key={quote.id} className="border-t border-stone-100"><td className="px-5 py-4 text-sm font-black text-stone-900">{companyName(quote.companies)}</td><td className="px-5 py-4 text-sm text-stone-600">{contactName(quote.contacts)}</td><td className="px-5 py-4 font-mono text-sm font-bold text-stone-700">{quote.quote_number}</td><td className="px-5 py-4 text-sm font-bold text-stone-800">{formatCurrency(quote.one_off_value)}</td><td className="px-5 py-4 text-sm font-bold text-stone-800">{formatCurrency(quote.subscription_value)}</td><td className={`px-5 py-4 text-sm font-black ${quote.chase_due_date <= today && isOpen(quote.status) ? 'text-red-600' : 'text-stone-700'}`}>{formatShortDate(quote.chase_due_date)}</td><td className="px-5 py-4"><select value={quote.status} onChange={(event) => void setStatus(quote, event.target.value)} className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-xs font-black text-stone-700">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-stone-500">No quotes recorded. Add the next issued quote here so its chase is never missed.</p>}</section>
    </section>
  </main>
}

function QuoteForm({ companies, contacts, onClose, onSaved }: { companies: Company[]; contacts: Contact[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const matchingContacts = contacts.filter((contact) => !companyId || contact.company_id === companyId)
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const issuedOn = String(form.get('issued_on') || today); setSaving(true); const { error: saveError } = await supabase.from('quotes').insert({ company_id: companyId, contact_id: String(form.get('contact_id')), quote_number: String(form.get('quote_number')).trim(), one_off_value: Number(form.get('one_off_value') || 0), subscription_value: Number(form.get('subscription_value') || 0), issued_on: issuedOn, chase_due_date: addBusinessDays(issuedOn, 5), notes: String(form.get('notes') || '').trim() || null }); if (saveError) { setError(saveError.message); setSaving(false); return } await onSaved(); onClose() }
  return <section className="mb-6 rounded-2xl border border-red-200 bg-white p-5 shadow-lg"><div className="mb-5 flex items-start justify-between gap-5"><div><p className="text-xs font-black uppercase tracking-wide text-red-600">New quote</p><h2 className="mt-1 text-2xl font-black text-stone-950">Set the chase while recording the quote.</h2><p className="mt-1 text-sm text-stone-500">The first chase is automatically set for five business days after issue.</p></div><button type="button" onClick={onClose} className="text-sm font-bold text-stone-400">Close</button></div><form onSubmit={submit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><select required value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="form-input"><option value="">Choose customer</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select><select required name="contact_id" disabled={!companyId} className="form-input"><option value="">Choose contact</option>{matchingContacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}</select><input required name="quote_number" className="form-input" placeholder="Quote number" /><input required name="issued_on" type="date" defaultValue={today} className="form-input" /><input name="one_off_value" type="number" min="0" step="0.01" className="form-input" placeholder="One-off value (£)" /><input name="subscription_value" type="number" min="0" step="0.01" className="form-input" placeholder="Subscription value (£)" /><textarea name="notes" rows={2} className="form-input resize-y md:col-span-2" placeholder="Notes (optional)" /><div className="flex items-center justify-end gap-3 lg:col-span-4">{error ? <p className="mr-auto text-xs font-bold text-red-600">{error}</p> : null}<button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button><button disabled={saving} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white">{saving ? 'Saving...' : 'Record quote'}</button></div></form></section>
}

function addBusinessDays(date: string, days: number) { const result = new Date(`${date}T12:00:00Z`); let added = 0; while (added < days) { result.setUTCDate(result.getUTCDate() + 1); if (result.getUTCDay() !== 0 && result.getUTCDay() !== 6) added += 1 } return result.toISOString().slice(0, 10) }
function isOpen(status: string) { return status === 'issued' || status === 'chased' }
function companyName(value: Quote['companies']) { const company = Array.isArray(value) ? value[0] : value; return company?.company_name ?? 'Customer' }
function contactName(value: Quote['contacts'] | Contact) { const contact = Array.isArray(value) ? value[0] : value; return `${contact?.first_name ?? ''} ${contact?.last_name ?? ''}`.trim() || 'Contact' }
function Metric({ label, value, urgent = false }: { label: string; value: string | number; urgent?: boolean }) { return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'}`}><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className={`mt-3 text-3xl font-black ${urgent ? 'text-red-600' : 'text-stone-950'}`}>{value}</p></div> }
