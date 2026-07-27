'use client'

import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'
import CompanyLookupLinks from '@/app/components/CompanyLookupLinks'
import { supabase } from '@/lib/supabaseClient'

type Status = 'research' | 'qualified' | 'nurture' | 'disqualified'
type Panel = 'enrich' | 'contact' | 'task' | 'campaign' | 'opportunity'
type Company = {
  id: string
  company_name: string
  domain: string | null
  location: string | null
  industry: string | null
  number_of_users: number | null
  current_it_provider: string | null
  provider_renewal_date: string | null
  lead_source: string | null
  account_notes: string | null
  prospecting_status: Status
  qualification_reason: string | null
  research_notes: string | null
  prospecting_updated_at: string
}
type Contact = {
  id: string
  company_id: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  email: string | null
  telephone: string | null
}
type Campaign = { id: string; name: string; campaign_name: string }

const statusLabels: Record<Status, string> = {
  research: 'Research incomplete',
  qualified: 'Qualified',
  nurture: 'Nurture',
  disqualified: 'Disqualified',
}

export default function ProspectingPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [dealCompanyIds, setDealCompanyIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Status | 'active'>('active')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<{ company: Company; panel: Panel } | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [companyResult, contactResult, campaignResult, dealResult] = await Promise.all([
      supabase
        .from('companies')
        .select('id,company_name,domain,location,industry,number_of_users,current_it_provider,provider_renewal_date,lead_source,account_notes,prospecting_status,qualification_reason,research_notes,prospecting_updated_at')
        .order('prospecting_updated_at', { ascending: false }),
      supabase.from('contacts').select('id,company_id,first_name,last_name,role,email,telephone'),
      supabase.from('campaigns').select('id,name,campaign_name').order('created_at', { ascending: false }),
      supabase.from('deals').select('company_id').not('stage', 'eq', 'lost'),
    ])
    const firstError = [companyResult.error, contactResult.error, campaignResult.error, dealResult.error].find(Boolean)
    if (firstError) setError(firstError.message)
    setCompanies((companyResult.data ?? []) as Company[])
    setContacts((contactResult.data ?? []) as Contact[])
    setCampaigns((campaignResult.data ?? []) as Campaign[])
    setDealCompanyIds(new Set((dealResult.data ?? []).map((deal) => String(deal.company_id))))
    setLoading(false)
  }, [])

  useEffect(() => {
    // Initial queue load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const contactsByCompany = useMemo(() => {
    const result = new Map<string, Contact[]>()
    contacts.forEach((contact) => {
      if (!contact.company_id) return
      result.set(contact.company_id, [...(result.get(contact.company_id) ?? []), contact])
    })
    return result
  }, [contacts])

  const counts = useMemo(() => {
    return companies.reduce(
      (result, company) => ({ ...result, [company.prospecting_status]: result[company.prospecting_status] + 1 }),
      { research: 0, qualified: 0, nurture: 0, disqualified: 0 } as Record<Status, number>,
    )
  }, [companies])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return companies.filter((company) => {
      const matchesStatus =
        statusFilter === 'active'
          ? company.prospecting_status !== 'disqualified'
          : company.prospecting_status === statusFilter
      const matchesSearch =
        !term ||
        [company.company_name, company.domain, company.location, company.industry, company.current_it_provider]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)
      return matchesStatus && matchesSearch
    })
  }, [companies, search, statusFilter])

  async function changeStatus(company: Company, status: Status) {
    setError('')
    const updatedAt = new Date().toISOString()
    const { error: saveError } = await supabase
      .from('companies')
      .update({ prospecting_status: status, prospecting_updated_at: updatedAt })
      .eq('id', company.id)
    if (saveError) {
      setError(saveError.message)
      return
    }
    await supabase.from('crm_activities').insert({
      company_id: company.id,
      activity_type: 'status_change',
      summary: `Prospecting status changed to ${statusLabels[status]}.`,
    })
    setCompanies((current) =>
      current.map((item) =>
        item.id === company.id
          ? { ...item, prospecting_status: status, prospecting_updated_at: updatedAt }
          : item,
      ),
    )
    setMessage(`${company.company_name} moved to ${statusLabels[status]}.`)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Daily prospecting queue</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-950">Turn clean data into conversations.</h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            Research, enrich and qualify companies, then create the next action, campaign target or sales opportunity.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(statusLabels) as Status[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-2xl border p-5 text-left shadow-sm ${statusFilter === status ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-white'}`}
            >
              <span className="text-xs font-black uppercase text-stone-500">{statusLabels[status]}</span>
              <span className="mt-2 block text-3xl font-black text-stone-950">{counts[status]}</span>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search company, location, industry or provider"
            className="form-input flex-1"
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status | 'active')} className="form-input sm:w-56">
            <option value="active">All active prospects</option>
            {(Object.keys(statusLabels) as Status[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </div>

        {message ? <p className="mt-5 rounded-xl bg-green-50 p-4 text-sm font-bold text-green-700">{message}</p> : null}
        {error ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-6 space-y-5">
          {loading ? <Empty text="Loading prospecting queue…" /> : null}
          {!loading && !visible.length ? <Empty text="No companies match this queue." /> : null}
          {visible.map((company) => {
            const companyContacts = contactsByCompany.get(company.id) ?? []
            const primary = companyContacts.find((contact) => contact.email) ?? companyContacts[0]
            const missing = [
              !primary && 'decision-maker',
              !primary?.email && 'email',
              !company.number_of_users && 'user count',
              !company.current_it_provider && 'IT provider',
              !company.provider_renewal_date && 'renewal date',
            ].filter(Boolean) as string[]
            return (
              <article key={company.id} className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 xl:w-72">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={company.prospecting_status} />
                      {dealCompanyIds.has(company.id) ? <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black uppercase text-blue-700">Opportunity exists</span> : null}
                    </div>
                    <Link href={`/companies/${company.id}`} className="mt-3 block text-xl font-black text-stone-950 hover:text-red-600">
                      {company.company_name}
                    </Link>
                    <p className="mt-1 text-sm text-stone-500">{[company.industry, company.location].filter(Boolean).join(' · ') || 'Sector and location unknown'}</p>
                    <div className="mt-4">
                      <CompanyLookupLinks companyName={company.company_name} domain={company.domain ?? ''} telephone={primary?.telephone ?? ''} compact />
                    </div>
                  </div>

                  <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Fact label="Decision-maker" value={primary ? contactName(primary) : 'Missing'} warning={!primary} />
                    <Fact label="Email" value={primary?.email ?? 'Missing'} warning={!primary?.email} />
                    <Fact label="Users" value={company.number_of_users ? String(company.number_of_users) : 'Unknown'} warning={!company.number_of_users} />
                    <Fact label="Timing" value={company.provider_renewal_date ? formatDate(company.provider_renewal_date) : 'Unknown'} warning={!company.provider_renewal_date} />
                    <div className="sm:col-span-2 lg:col-span-4">
                      <p className="text-xs font-black uppercase text-stone-400">Missing research</p>
                      <p className="mt-1 text-sm font-bold text-stone-700">{missing.length ? missing.join(', ') : 'Core qualification data complete'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:w-80 xl:justify-end">
                    <Action label="Enrich" onClick={() => setActive({ company, panel: 'enrich' })} />
                    <Action label="+ Contact" onClick={() => setActive({ company, panel: 'contact' })} />
                    <Action label="+ Task" onClick={() => setActive({ company, panel: 'task' })} />
                    <Action label="Campaign" onClick={() => setActive({ company, panel: 'campaign' })} />
                    <Action label="Opportunity" onClick={() => setActive({ company, panel: 'opportunity' })} dark />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
                  <span className="mr-2 text-xs font-black uppercase text-stone-400">Qualify:</span>
                  {(Object.keys(statusLabels) as Status[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void changeStatus(company, status)}
                      className={`rounded-lg px-3 py-2 text-xs font-black ${company.prospecting_status === status ? 'bg-red-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                    >
                      {statusLabels[status]}
                    </button>
                  ))}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      {active ? (
        <QueuePanel
          key={`${active.company.id}-${active.panel}`}
          company={active.company}
          panel={active.panel}
          contacts={contactsByCompany.get(active.company.id) ?? []}
          campaigns={campaigns}
          onClose={() => setActive(null)}
          onSaved={async (successMessage) => {
            setActive(null)
            setMessage(successMessage)
            await load()
          }}
        />
      ) : null}
    </main>
  )
}

function QueuePanel({ company, panel, contacts, campaigns, onClose, onSaved }: { company: Company; panel: Panel; contacts: Contact[]; campaigns: Campaign[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    let result: { error: { message: string } | null }
    let message = ''

    if (panel === 'enrich') {
      result = await supabase.from('companies').update({
        number_of_users: Number(form.get('number_of_users') || 0) || null,
        current_it_provider: text(form, 'current_it_provider'),
        provider_renewal_date: text(form, 'provider_renewal_date'),
        lead_source: text(form, 'lead_source'),
        qualification_reason: text(form, 'qualification_reason'),
        research_notes: text(form, 'research_notes'),
        prospecting_updated_at: new Date().toISOString(),
      }).eq('id', company.id)
      message = `${company.company_name} enrichment saved.`
    } else if (panel === 'contact') {
      result = await supabase.from('contacts').insert({
        company_id: company.id,
        first_name: text(form, 'first_name'),
        last_name: text(form, 'last_name'),
        role: text(form, 'role'),
        email: text(form, 'email'),
        telephone: text(form, 'telephone'),
        contact_source: 'prospecting',
      })
      message = `Contact added to ${company.company_name}.`
    } else if (panel === 'task') {
      result = await supabase.from('crm_tasks').insert({
        company_id: company.id,
        contact_id: text(form, 'contact_id'),
        title: text(form, 'title'),
        due_date: text(form, 'due_date'),
        priority: String(form.get('priority') || 'normal'),
      })
      message = `Next action created for ${company.company_name}.`
    } else if (panel === 'campaign') {
      const contactId = text(form, 'contact_id')
      const contact = contacts.find((item) => item.id === contactId)
      result = await supabase.from('campaign_companies').insert({
        campaign_id: text(form, 'campaign_id'),
        company_id: company.id,
        contact_id: contactId,
        email_address_used: contact?.email ?? null,
      })
      message = `${company.company_name} added to campaign.`
    } else {
      result = await supabase.from('deals').insert({
        company_id: company.id,
        primary_contact_id: text(form, 'contact_id'),
        name: text(form, 'name') || `${company.company_name} managed IT opportunity`,
        annual_value: Number(form.get('annual_value') || 0) || null,
        number_of_users: Number(form.get('number_of_users') || 0) || company.number_of_users,
        current_provider: company.current_it_provider,
        renewal_date: company.provider_renewal_date,
        source: company.lead_source || 'prospecting',
        next_action: text(form, 'next_action'),
        next_action_due: text(form, 'next_action_due'),
        stage: 'new',
        probability: 10,
      })
      message = `Opportunity created for ${company.company_name}.`
    }

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }
    await onSaved(message)
  }

  const title = {
    enrich: 'Enrich and qualify',
    contact: 'Add decision-maker',
    task: 'Create next action',
    campaign: 'Add to campaign',
    opportunity: 'Create opportunity',
  }[panel]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
      <form onSubmit={submit} className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-7 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase text-red-600">{company.company_name}</p><h2 className="mt-1 text-2xl font-black">{title}</h2></div>
          <button type="button" onClick={onClose} className="rounded-xl border px-3 py-2 font-black text-stone-500">✕</button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {panel === 'enrich' ? <>
            <Field label="Number of users"><input name="number_of_users" type="number" min="0" defaultValue={company.number_of_users ?? ''} className="form-input" /></Field>
            <Field label="Current IT provider"><input name="current_it_provider" defaultValue={company.current_it_provider ?? ''} className="form-input" /></Field>
            <Field label="Provider renewal date"><input name="provider_renewal_date" type="date" defaultValue={company.provider_renewal_date ?? ''} className="form-input" /></Field>
            <Field label="Lead source"><input name="lead_source" defaultValue={company.lead_source ?? ''} className="form-input" /></Field>
            <Field label="Qualification reason" wide><input name="qualification_reason" defaultValue={company.qualification_reason ?? ''} className="form-input" placeholder="Why is this a fit, nurture or disqualification?" /></Field>
            <Field label="Research notes" wide><textarea name="research_notes" defaultValue={company.research_notes ?? ''} rows={4} className="form-input" /></Field>
          </> : null}
          {panel === 'contact' ? <>
            <Field label="First name"><input required name="first_name" className="form-input" /></Field>
            <Field label="Last name"><input name="last_name" className="form-input" /></Field>
            <Field label="Role"><input name="role" className="form-input" placeholder="CEO, Finance Director…" /></Field>
            <Field label="Email"><input name="email" type="email" className="form-input" /></Field>
            <Field label="Telephone" wide><input name="telephone" className="form-input" /></Field>
          </> : null}
          {panel === 'task' ? <>
            <Field label="Action" wide><input required name="title" className="form-input" placeholder="Call to discuss current IT support" /></Field>
            <Field label="Due date"><input required name="due_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="form-input" /></Field>
            <Field label="Priority"><select name="priority" className="form-input"><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option><option value="low">Low</option></select></Field>
            <Field label="Contact" wide><ContactSelect contacts={contacts} /></Field>
          </> : null}
          {panel === 'campaign' ? <>
            <Field label="Campaign" wide><select required name="campaign_id" className="form-input"><option value="">Choose campaign</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name || campaign.campaign_name}</option>)}</select></Field>
            <Field label="Contact" wide><ContactSelect contacts={contacts} required /></Field>
          </> : null}
          {panel === 'opportunity' ? <>
            <Field label="Opportunity name" wide><input name="name" className="form-input" placeholder={`${company.company_name} managed IT opportunity`} /></Field>
            <Field label="Annual value (£)"><input name="annual_value" type="number" min="0" className="form-input" /></Field>
            <Field label="Number of users"><input name="number_of_users" type="number" min="0" defaultValue={company.number_of_users ?? ''} className="form-input" /></Field>
            <Field label="Primary contact" wide><ContactSelect contacts={contacts} /></Field>
            <Field label="Next action" wide><input required name="next_action" className="form-input" placeholder="Book discovery call" /></Field>
            <Field label="Next action due"><input required name="next_action_due" type="date" className="form-input" /></Field>
          </> : null}
        </div>
        {error ? <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <div className="mt-7 flex justify-end gap-3 border-t pt-5">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-stone-500">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : title}</button>
        </div>
      </form>
    </div>
  )
}

function ContactSelect({ contacts, required = false }: { contacts: Contact[]; required?: boolean }) {
  return <select required={required} name="contact_id" className="form-input"><option value="">{required ? 'Choose contact' : 'No specific contact'}</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select>
}
function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-1.5 block text-xs font-black uppercase text-stone-500">{label}</span>{children}</label>
}
function Action({ label, onClick, dark = false }: { label: string; onClick: () => void; dark?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded-xl px-3 py-2 text-xs font-black ${dark ? 'bg-stone-950 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'}`}>{label}</button>
}
function Fact({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className={`rounded-xl p-3 ${warning ? 'bg-amber-50' : 'bg-stone-50'}`}><p className="text-[10px] font-black uppercase text-stone-400">{label}</p><p className={`mt-1 truncate text-sm font-black ${warning ? 'text-amber-800' : 'text-stone-800'}`}>{value}</p></div>
}
function StatusPill({ status }: { status: Status }) {
  const tone = status === 'qualified' ? 'bg-green-100 text-green-800' : status === 'nurture' ? 'bg-blue-100 text-blue-800' : status === 'disqualified' ? 'bg-stone-200 text-stone-700' : 'bg-amber-100 text-amber-800'
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{statusLabels[status]}</span>
}
function Empty({ text: value }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm font-bold text-stone-500">{value}</p>
}
function contactName(contact: Contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed contact'
}
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB')
}
function text(form: FormData, name: string) {
  return String(form.get(name) || '').trim() || null
}
