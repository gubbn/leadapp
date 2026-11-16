'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AppHeader from '@/app/components/AppHeader'
import { formatCurrency, formatShortDate } from '@/lib/crm'
import { supabase } from '@/lib/supabaseClient'
import QuoteNurture from './QuoteNurture'

type Company = { id: string; company_name: string }
type Contact = { id: string; first_name: string | null; last_name: string | null; company_id: string | null }
type Deal = { id: string; name: string; company_id: string; stage: string }
type Quote = {
  id: string
  company_id: string
  contact_id: string
  deal_id?: string | null
  quote_number: string
  one_off_value: number
  subscription_value: number
  issued_on: string
  chase_due_date: string
  status: string
  notes: string | null
  nurture_enabled: boolean
  nurture_steps: Record<string, { days: number; subject: string; body: string }>
  lost_at: string | null
  companies: Company | Company[] | null
}

const statuses = ['issued', 'chased', 'won', 'lost', 'withdrawn']

export default function QuoteDetailPage() {
  const params = useParams()
  const quoteId = Array.isArray(params.id) ? params.id[0] : String(params.id ?? '')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const quoteResult = await supabase.from('quotes').select('*,companies(id,company_name)').eq('id', quoteId).single()
    if (quoteResult.error) { setError(quoteResult.error.message); setLoading(false); return }
    const loadedQuote = quoteResult.data as Quote
    const [contactsResult, dealsResult] = await Promise.all([
      supabase.from('contacts').select('id,first_name,last_name,company_id').eq('company_id', loadedQuote.company_id)
        .or(`is_active.eq.true,id.eq.${loadedQuote.contact_id}`).order('last_name'),
      loadedQuote.deal_id === undefined ? null :
        supabase.from('deals').select('id,name,company_id,stage').eq('company_id', loadedQuote.company_id).order('updated_at', { ascending: false }),
    ])
    const childError = contactsResult.error || dealsResult?.error
    if (childError) setError(childError.message)
    setQuote(loadedQuote)
    setContacts((contactsResult.data ?? []) as Contact[])
    setDeals((dealsResult?.data ?? null) as Deal[] | null)
    setLoading(false)
  }, [quoteId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!quote) return
    const form = new FormData(event.currentTarget)
    setSaving(true); setError(''); setSuccess('')
    const payload = {
      contact_id: String(form.get('contact_id')),
      ...(form.has('deal_id') ? { deal_id: String(form.get('deal_id') || '') || null } : {}),
      quote_number: String(form.get('quote_number') || '').trim(),
      one_off_value: Number(form.get('one_off_value') || 0),
      subscription_value: Number(form.get('subscription_value') || 0),
      issued_on: String(form.get('issued_on')),
      chase_due_date: String(form.get('chase_due_date')),
      status: String(form.get('status')),
      notes: String(form.get('notes') || '').trim() || null,
      updated_at: new Date().toISOString(),
    }
    const { error: saveError } = await supabase.from('quotes').update(payload).eq('id', quote.id).select('id').single()
    if (saveError) setError(saveError.message)
    else { setSuccess('Quote updated.'); await load() }
    setSaving(false)
  }

  const company = quote ? (Array.isArray(quote.companies) ? quote.companies[0] : quote.companies) : null
  const linkedDeal = deals?.find((deal) => deal.id === quote?.deal_id)

  return <main className="min-h-screen bg-stone-100 text-stone-900">
    <AppHeader />
    <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50"><div className="mx-auto max-w-5xl px-4 py-10"><Link href="/quotes" className="text-sm font-black text-red-600">← Back to quotes</Link><p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-red-600">Quote record</p><h1 className="mt-2 text-4xl font-black tracking-tight text-stone-950">{quote?.quote_number ?? 'Quote'}</h1>{company ? <Link href={`/companies/${company.id}`} className="mt-3 inline-block text-sm font-bold text-stone-500 hover:text-red-600">{company.company_name}</Link> : null}</div></section>
    <section className="mx-auto max-w-5xl px-4 py-8">
      {error ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}
      {success ? <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-700">{success}</p> : null}
      {loading ? <p className="rounded-2xl bg-white p-8 text-sm font-bold text-stone-500">Loading quote…</p> : quote ? <>
        <div className="grid gap-4 sm:grid-cols-3"><Metric label="Total value" value={formatCurrency(Number(quote.one_off_value) + Number(quote.subscription_value))} /><Metric label="Next chase" value={formatShortDate(quote.chase_due_date)} /><Metric label="Status" value={quote.status} /></div>
        <form onSubmit={save} className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Commercial details</p><h2 className="mt-1 text-2xl font-black text-stone-950">Edit quote</h2></div>{linkedDeal ? <Link href={`/sales/${linkedDeal.id}`} className="rounded-xl bg-stone-950 px-4 py-2 text-xs font-black text-white">Open opportunity →</Link> : null}</div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Field label="Quote number"><input required name="quote_number" defaultValue={quote.quote_number} className="form-input" /></Field>
            <Field label="Status"><select name="status" defaultValue={quote.status} className="form-input">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field>
            <Field label="Contact"><select required name="contact_id" defaultValue={quote.contact_id} className="form-input">{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}</option>)}</select></Field>
            {deals ? <Field label="Opportunity"><select name="deal_id" defaultValue={quote.deal_id ?? ''} className="form-input"><option value="">No linked opportunity</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name} · {deal.stage}</option>)}</select></Field> : null}
            <Field label="One-off value (£)"><input name="one_off_value" type="number" min="0" step="0.01" defaultValue={quote.one_off_value} className="form-input" /></Field>
            <Field label="Subscription value (£)"><input name="subscription_value" type="number" min="0" step="0.01" defaultValue={quote.subscription_value} className="form-input" /></Field>
            <Field label="Issued on"><input required name="issued_on" type="date" defaultValue={quote.issued_on} className="form-input" /></Field>
            <Field label="Next chase"><input required name="chase_due_date" type="date" defaultValue={quote.chase_due_date} className="form-input" /></Field>
            <label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Notes</span><textarea name="notes" rows={5} defaultValue={quote.notes ?? ''} className="form-input resize-y" /></label>
          </div>
          <div className="mt-6 flex justify-end"><button disabled={saving} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save quote'}</button></div>
        </form>
        {typeof quote.nurture_enabled === 'boolean' ? <QuoteNurture key={quote.id} quoteId={quote.id} enabled={quote.nurture_enabled}
          settings={quote.nurture_steps ?? {}} status={quote.status} lostAt={quote.lost_at} /> : null}
      </> : <p className="rounded-2xl bg-white p-8 text-sm font-bold text-stone-500">Quote not found.</p>}
    </section>
  </main>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>{children}</label> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-stone-400">{label}</p><p className="mt-3 text-2xl font-black capitalize text-stone-950">{value}</p></div> }
function contactName(contact: Contact) { return `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Contact' }
