'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type DbRow = Record<string, unknown>

type CampaignCompanyView = {
  id: string
  raw: DbRow
  company: DbRow | null
  contact: DbRow | null
}

type FilterValue =
  | 'all'
  | 'selected'
  | 'sent'
  | 'bounced'
  | 'out_of_office'
  | 'quoted'
  | 'customer'
  | 'no_response'

type NewContactForm = {
  firstName: string
  lastName: string
  email: string
  role: string
  phone: string
  notes: string
}

const emptyContactForm: NewContactForm = {
  firstName: '',
  lastName: '',
  email: '',
  role: '',
  phone: '',
  notes: '',
}

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignId = Array.isArray(params.id)
    ? params.id[0]
    : String(params.id || '')

  const [campaign, setCampaign] = useState<DbRow | null>(null)
  const [rows, setRows] = useState<CampaignCompanyView[]>([])
  const [contactColumnKeys, setContactColumnKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')
  const [openContactFormId, setOpenContactFormId] = useState<string | null>(
    null,
  )
  const [contactForms, setContactForms] = useState<
    Record<string, NewContactForm>
  >({})
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    loadCampaign()
  }, [campaignId])

  const stats = useMemo(() => {
    const selected = rows.length

    const sent = rows.filter((row) => getEmailStatus(row) === 'sent').length

    const bounced = rows.filter(
      (row) => getEmailStatus(row) === 'bounced',
    ).length

    const outOfOffice = rows.filter(
      (row) => getEmailStatus(row) === 'out_of_office',
    ).length

    const quoted = rows.filter(
      (row) => getEffectiveOutcome(row) === 'quoted',
    ).length

    const customers = rows.filter(
      (row) => getEffectiveOutcome(row) === 'customer',
    ).length

    const success = quoted + customers

    return {
      selected,
      sent,
      bounced,
      outOfOffice,
      quoted,
      customers,
      success,
      successRate: percent(success, selected),
      bounceRate: percent(bounced, selected),
      outOfOfficeRate: percent(outOfOffice, selected),
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows

    if (filter === 'quoted') {
      return rows.filter((row) => getEffectiveOutcome(row) === 'quoted')
    }

    if (filter === 'customer') {
      return rows.filter((row) => getEffectiveOutcome(row) === 'customer')
    }

    return rows.filter((row) => getEmailStatus(row) === filter)
  }, [rows, filter])

  async function loadCampaign() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')
    setWarningMessage('')

    const warnings: string[] = []

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      setErrorMessage(campaignError.message)
      setLoading(false)
      return
    }

    setCampaign((campaignData || null) as DbRow | null)

    const { data: campaignCompanyData, error: campaignCompanyError } =
      await supabase
        .from('campaign_companies')
        .select('*')
        .eq('campaign_id', campaignId)

    if (campaignCompanyError) {
      setErrorMessage(campaignCompanyError.message)
      setLoading(false)
      return
    }

    const campaignCompanyRows = ((campaignCompanyData ?? []) as DbRow[])
      .filter(isRowWithId)
      .map((row) => row as DbRow & { id: string })

    const companyIds = Array.from(
      new Set(
        campaignCompanyRows
          .map((row) => getString(row, ['company_id']))
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const contactIds = Array.from(
      new Set(
        campaignCompanyRows
          .map((row) => getString(row, ['contact_id']))
          .filter((value): value is string => Boolean(value)),
      ),
    )

    const companiesById = new Map<string, DbRow>()
    const contactsById = new Map<string, DbRow>()
    const contactKeys = new Set<string>()

    if (companyIds.length > 0) {
      const { rows: companyRows, error: companyError } = await fetchRowsByIds(
        'companies',
        companyIds,
      )

      if (companyError) {
        warnings.push(`Companies could not be loaded: ${companyError}`)
      } else {
        companyRows.forEach((company) => {
          const id = getString(company, ['id'])
          if (id) companiesById.set(id, company)
        })
      }
    }

    if (contactIds.length > 0) {
      const { rows: contactRows, error: contactError } = await fetchRowsByIds(
        'contacts',
        contactIds,
      )

      if (contactError) {
        warnings.push(`Contacts could not be loaded: ${contactError}`)
      } else {
        contactRows.forEach((contact) => {
          const id = getString(contact, ['id'])
          if (id) contactsById.set(id, contact)
          Object.keys(contact).forEach((key) => contactKeys.add(key))
        })
      }
    }

    const { data: sampleContacts, error: sampleContactError } = await supabase
      .from('contacts')
      .select('*')
      .limit(1)

    if (!sampleContactError) {
      ;((sampleContacts ?? []) as DbRow[]).forEach((contact) => {
        Object.keys(contact).forEach((key) => contactKeys.add(key))
      })
    }

    const viewRows = campaignCompanyRows
      .map((row) => {
        const companyId = getString(row, ['company_id'])
        const contactId = getString(row, ['contact_id'])

        return {
          id: row.id,
          raw: row,
          company: companyId ? companiesById.get(companyId) || null : null,
          contact: contactId ? contactsById.get(contactId) || null : null,
        }
      })
      .sort((a, b) => {
        return getCompanyName(a.company || {}).localeCompare(
          getCompanyName(b.company || {}),
        )
      })

    const initialNotes: Record<string, string> = {}

    viewRows.forEach((row) => {
      initialNotes[row.id] = getString(row.raw, ['notes'])
    })

    setRows(viewRows)
    setNoteDrafts(initialNotes)
    setContactColumnKeys(Array.from(contactKeys))
    setWarningMessage(warnings.join(' '))
    setLoading(false)
  }

  async function fetchRowsByIds(table: string, ids: string[]) {
    const rows: DbRow[] = []
    const chunks = chunkArray(ids, 500)

    for (const chunk of chunks) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .in('id', chunk)

      if (error) {
        return {
          rows,
          error: error.message,
        }
      }

      rows.push(...((data ?? []) as DbRow[]))
    }

    return {
      rows,
      error: '',
    }
  }

  async function updateCampaignRow(rowId: string, updates: DbRow) {
    setSavingId(rowId)
    setMessage('')
    setErrorMessage('')

    const payload: DbRow = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    let { data, error } = await supabase
      .from('campaign_companies')
      .update(payload)
      .eq('id', rowId)
      .select('*')

    if (error && error.message.includes('updated_at')) {
      const fallbackPayload = { ...updates }

      const fallbackResult = await supabase
        .from('campaign_companies')
        .update(fallbackPayload)
        .eq('id', rowId)
        .select('*')

      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return false
    }

    const updatedRow = ((data ?? []) as DbRow[]).find(
      (row) => getString(row, ['id']) === rowId,
    )

    if (!updatedRow) {
      setErrorMessage(
        'No campaign row was updated. This is usually caused by Supabase RLS blocking updates.',
      )
      setSavingId(null)
      return false
    }

    setRows((current) =>
      current.map((row) =>
        row.id === rowId
          ? {
              ...row,
              raw: updatedRow,
            }
          : row,
      ),
    )

    if (typeof updates.notes === 'string') {
      setNoteDrafts((current) => ({
        ...current,
        [rowId]: updates.notes as string,
      }))
    }

    setSavingId(null)
    return true
  }

  async function markEmailStatus(rowId: string, status: string) {
    const success = await updateCampaignRow(rowId, {
      email_status: status,
    })

    if (success) {
      setMessage(`Email status updated to ${status.replaceAll('_', ' ')}.`)
    }
  }

  async function markOutcome(rowId: string, outcome: string) {
    const success = await updateCampaignRow(rowId, {
      outcome,
    })

    if (success) {
      setMessage(`Outcome updated to ${outcome.replaceAll('_', ' ')}.`)
    }
  }

  async function saveNotes(rowId: string) {
    const success = await updateCampaignRow(rowId, {
      notes: noteDrafts[rowId] || null,
    })

    if (success) {
      setMessage('Notes saved.')
    }
  }

  function updateContactForm(
    rowId: string,
    field: keyof NewContactForm,
    value: string,
  ) {
    setContactForms((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] || emptyContactForm),
        [field]: value,
      },
    }))
  }

  async function addContactFromOutOfOffice(row: CampaignCompanyView) {
    const form = contactForms[row.id] || emptyContactForm
    const companyId = getString(row.raw, ['company_id'])

    if (!companyId) {
      setErrorMessage('This campaign row is not linked to a company.')
      return
    }

    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setErrorMessage('First name, last name and email are required.')
      return
    }

    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const insertResult = await insertContactWithFallbacks(companyId, form)

    if (!insertResult.success) {
      setErrorMessage(insertResult.error || 'Could not add contact.')
      setSavingId(null)
      return
    }

    const existingNotes = noteDrafts[row.id] || getString(row.raw, ['notes'])
    const newNote = `New contact added from out-of-office reply: ${form.firstName.trim()} ${form.lastName.trim()} <${form.email.trim()}>`

    await updateCampaignRow(row.id, {
      email_status: 'out_of_office',
      notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote,
    })

    setContactForms((current) => ({
      ...current,
      [row.id]: emptyContactForm,
    }))

    setOpenContactFormId(null)
    setMessage('New contact added to the company.')
    setSavingId(null)
  }

  async function insertContactWithFallbacks(
    companyId: string,
    form: NewContactForm,
  ) {
    const keySet = new Set(contactColumnKeys)

    if (keySet.size > 0) {
      const payload: DbRow = {}

      setIfColumnExists(payload, keySet, 'company_id', companyId)
      setIfColumnExists(payload, keySet, 'first_name', form.firstName.trim())
      setIfColumnExists(payload, keySet, 'last_name', form.lastName.trim())

      if (keySet.has('email_address')) {
        payload.email_address = form.email.trim()
      } else if (keySet.has('email')) {
        payload.email = form.email.trim()
      }

      setIfColumnExists(payload, keySet, 'role', cleanText(form.role))
      setIfColumnExists(payload, keySet, 'job_title', cleanText(form.role))
      setIfColumnExists(payload, keySet, 'telephone', cleanText(form.phone))
      setIfColumnExists(payload, keySet, 'phone', cleanText(form.phone))
      setIfColumnExists(payload, keySet, 'notes', cleanText(form.notes))
      setIfColumnExists(payload, keySet, 'contact_source', 'out_of_office')
      setIfColumnExists(payload, keySet, 'source', 'out_of_office')
      setIfColumnExists(payload, keySet, 'is_active', true)

      if (!('company_id' in payload)) payload.company_id = companyId
      if (!('first_name' in payload)) payload.first_name = form.firstName.trim()
      if (!('last_name' in payload)) payload.last_name = form.lastName.trim()
      if (!('email_address' in payload) && !('email' in payload)) {
        payload.email_address = form.email.trim()
      }

      const { error } = await supabase.from('contacts').insert(payload)

      if (!error) {
        return {
          success: true,
          error: '',
        }
      }

      return {
        success: false,
        error: error.message,
      }
    }

    const payloadVariants: DbRow[] = [
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email_address: form.email.trim(),
        role: cleanText(form.role),
        telephone: cleanText(form.phone),
        notes: cleanText(form.notes),
        contact_source: 'out_of_office',
        is_active: true,
      },
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        role: cleanText(form.role),
        phone: cleanText(form.phone),
        notes: cleanText(form.notes),
        source: 'out_of_office',
        is_active: true,
      },
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email_address: form.email.trim(),
        role: cleanText(form.role),
        notes: cleanText(form.notes),
      },
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
        role: cleanText(form.role),
        notes: cleanText(form.notes),
      },
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email_address: form.email.trim(),
      },
      {
        company_id: companyId,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        email: form.email.trim(),
      },
    ]

    let lastError = ''

    for (const payload of payloadVariants) {
      const cleanedPayload = removeNullValues(payload)

      const { error } = await supabase.from('contacts').insert(cleanedPayload)

      if (!error) {
        return {
          success: true,
          error: '',
        }
      }

      lastError = error.message
    }

    return {
      success: false,
      error: lastError,
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link
            href="/campaigns/history"
            className="text-sm font-bold text-red-600"
          >
            ← Back to campaign history
          </Link>

          <div className="mt-6 max-w-4xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Campaign record
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              {campaign ? getCampaignName(campaign) || 'Unnamed campaign' : 'Campaign'}
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Review selected companies, mark bounced emails and out-of-office
              replies, update outcomes, and add new contacts from OOO replies.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/campaigns/builder"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              Build new campaign
            </Link>

            <Link
              href="/campaigns/history"
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50"
            >
              View history
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {errorMessage ? (
          <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {warningMessage ? (
          <p className="mb-6 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warningMessage}
          </p>
        ) : null}

        {message ? (
          <p className="mb-6 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700">
            {message}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm font-semibold text-stone-500">
            Loading campaign...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-6">
              <SummaryCard label="Selected" value={stats.selected} />
              <SummaryCard label="Sent" value={stats.sent} />
              <SummaryCard
                label="Bounced"
                value={stats.bounced}
                urgent={stats.bounced > 0}
              />
              <SummaryCard
                label="Out of office"
                value={stats.outOfOffice}
                urgent={stats.outOfOffice > 0}
              />
              <SummaryCard
                label="Quoted"
                value={stats.quoted}
                urgent={stats.quoted > 0}
              />
              <SummaryCard
                label="Customers"
                value={stats.customers}
                urgent={stats.customers > 0}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-stone-950">
                Campaign success
              </h2>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <MetricBlock label="Success rate" value={stats.successRate} />
                <MetricBlock
                  label="Bounce rate"
                  value={stats.bounceRate}
                />
                <MetricBlock
                  label="Out of office rate"
                  value={stats.outOfOfficeRate}
                />
                <MetricBlock
                  label="Selected companies"
                  value={String(stats.selected)}
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-stone-950">
                    Campaign filters
                  </h2>

                  <p className="mt-1 text-sm text-stone-500">
                    Use these to work through bounces, out-of-office replies and
                    successful outcomes.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <FilterButton
                    active={filter === 'all'}
                    label={`All (${rows.length})`}
                    onClick={() => setFilter('all')}
                  />
                  <FilterButton
                    active={filter === 'selected'}
                    label={`Selected (${countEmailStatus(rows, 'selected')})`}
                    onClick={() => setFilter('selected')}
                  />
                  <FilterButton
                    active={filter === 'sent'}
                    label={`Sent (${countEmailStatus(rows, 'sent')})`}
                    onClick={() => setFilter('sent')}
                  />
                  <FilterButton
                    active={filter === 'bounced'}
                    label={`Bounced (${stats.bounced})`}
                    onClick={() => setFilter('bounced')}
                  />
                  <FilterButton
                    active={filter === 'out_of_office'}
                    label={`OOO (${stats.outOfOffice})`}
                    onClick={() => setFilter('out_of_office')}
                  />
                  <FilterButton
                    active={filter === 'quoted'}
                    label={`Quoted (${stats.quoted})`}
                    onClick={() => setFilter('quoted')}
                  />
                  <FilterButton
                    active={filter === 'customer'}
                    label={`Customers (${stats.customers})`}
                    onClick={() => setFilter('customer')}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 p-5">
                <h2 className="text-xl font-black text-stone-950">
                  Selected companies
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Showing {filteredRows.length} of {rows.length} campaign rows.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Contact</th>
                      <th className="px-4 py-3">Email used</th>
                      <th className="px-4 py-3">Email status</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-stone-500" colSpan={7}>
                          No companies match this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const companyId = getString(row.raw, ['company_id'])
                        const emailStatus = getEmailStatus(row)
                        const effectiveOutcome = getEffectiveOutcome(row)
                        const form = contactForms[row.id] || emptyContactForm

                        return (
                          <tr
                            key={row.id}
                            className="border-t border-stone-100 align-top"
                          >
                            <td className="px-4 py-4">
                              <div className="font-black text-stone-950">
                                {getCompanyName(row.company || {}) ||
                                  'Unnamed company'}
                              </div>

                              <div className="mt-1 text-xs text-stone-500">
                                {[
                                  getString(row.company || {}, ['industry']),
                                  getString(row.company || {}, [
                                    'location',
                                    'town',
                                    'postcode',
                                  ]),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'No company details'}
                              </div>

                              {companyId ? (
                                <Link
                                  href={`/companies/${companyId}`}
                                  className="mt-2 inline-flex text-xs font-bold text-red-600 hover:underline"
                                >
                                  Open company
                                </Link>
                              ) : null}
                            </td>

                            <td className="px-4 py-4">
                              <div className="font-bold text-stone-950">
                                {getContactName(row.contact || {}) ||
                                  'No contact selected'}
                              </div>

                              <div className="mt-1 text-xs text-stone-500">
                                {getContactRole(row.contact || {}) || '-'}
                              </div>
                            </td>

                            <td className="px-4 py-4">
                              {getString(row.raw, ['email_address_used']) ||
                                getContactEmail(row.contact || {}) ||
                                '-'}
                            </td>

                            <td className="px-4 py-4">
                              <StatusPill value={emailStatus} />
                            </td>

                            <td className="px-4 py-4">
                              <StatusPill value={effectiveOutcome} />
                            </td>

                            <td className="min-w-72 px-4 py-4">
                              <textarea
                                value={noteDrafts[row.id] || ''}
                                onChange={(event) =>
                                  setNoteDrafts((current) => ({
                                    ...current,
                                    [row.id]: event.target.value,
                                  }))
                                }
                                rows={3}
                                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                placeholder="Add notes..."
                              />

                              <button
                                type="button"
                                onClick={() => saveNotes(row.id)}
                                disabled={savingId === row.id}
                                className="mt-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                              >
                                Save notes
                              </button>
                            </td>

                            <td className="min-w-72 px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    markEmailStatus(row.id, 'sent')
                                  }
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                >
                                  Sent
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    markEmailStatus(row.id, 'bounced')
                                  }
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Bounced
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    markEmailStatus(row.id, 'out_of_office')
                                  }
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-bold text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                                >
                                  Out of office
                                </button>

                                <button
                                  type="button"
                                  onClick={() => markOutcome(row.id, 'quoted')}
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  Quoted
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    markOutcome(row.id, 'customer')
                                  }
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-bold text-green-700 hover:bg-green-100 disabled:opacity-50"
                                >
                                  Customer
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    markEmailStatus(row.id, 'no_response')
                                  }
                                  disabled={savingId === row.id}
                                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                                >
                                  No response
                                </button>

                                {emailStatus === 'out_of_office' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenContactFormId(
                                        openContactFormId === row.id
                                          ? null
                                          : row.id,
                                      )
                                    }
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                                  >
                                    Add OOO contact
                                  </button>
                                ) : null}
                              </div>

                              {openContactFormId === row.id ? (
                                <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                                  <p className="text-sm font-black text-stone-950">
                                    Add new contact
                                  </p>

                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <input
                                      value={form.firstName}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'firstName',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="First name"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />

                                    <input
                                      value={form.lastName}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'lastName',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Last name"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />

                                    <input
                                      value={form.email}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'email',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Email"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />

                                    <input
                                      value={form.role}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'role',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Role"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />

                                    <input
                                      value={form.phone}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'phone',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Phone"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />

                                    <input
                                      value={form.notes}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'notes',
                                          event.target.value,
                                        )
                                      }
                                      placeholder="Notes"
                                      className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      addContactFromOutOfOffice(row)
                                    }
                                    disabled={savingId === row.id}
                                    className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {savingId === row.id
                                      ? 'Saving...'
                                      : 'Save new contact'}
                                  </button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  )
}

function isRowWithId(value: DbRow): value is DbRow & { id: string } {
  return typeof value.id === 'string' && value.id.length > 0
}

function getString(row: DbRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number') {
      return String(value)
    }
  }

  return ''
}

function getCampaignName(campaign: DbRow) {
  return getString(campaign, ['name', 'campaign_name', 'title'])
}

function getCompanyName(company: DbRow) {
  return getString(company, ['company_name', 'business_name', 'name'])
}

function getContactName(contact: DbRow) {
  return [getString(contact, ['first_name']), getString(contact, ['last_name'])]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function getContactEmail(contact: DbRow) {
  return getString(contact, ['email_address', 'email'])
}

function getContactRole(contact: DbRow) {
  return getString(contact, ['role', 'job_title', 'position'])
}

function getContactOutcome(contact: DbRow) {
  return getString(contact, ['outcome', 'status'])
}

function getEmailStatus(row: CampaignCompanyView) {
  return getString(row.raw, ['email_status']) || 'selected'
}

function getCampaignOutcome(row: CampaignCompanyView) {
  return getString(row.raw, ['outcome']) || 'none'
}

function getEffectiveOutcome(row: CampaignCompanyView) {
  const campaignOutcome = cleanOutcome(getCampaignOutcome(row))
  const contactOutcome = cleanOutcome(getContactOutcome(row.contact || {}))

  if (campaignOutcome === 'customer' || campaignOutcome === 'won') {
    return 'customer'
  }

  if (
    campaignOutcome === 'quoted' ||
    campaignOutcome === 'quote sent' ||
    campaignOutcome === 'negotiating'
  ) {
    return 'quoted'
  }

  if (contactOutcome === 'customer' || contactOutcome === 'won') {
    return 'customer'
  }

  if (
    contactOutcome === 'quoted' ||
    contactOutcome === 'quote sent' ||
    contactOutcome === 'negotiating'
  ) {
    return 'quoted'
  }

  return getCampaignOutcome(row)
}

function countEmailStatus(rows: CampaignCompanyView[], status: string) {
  return rows.filter((row) => getEmailStatus(row) === status).length
}

function cleanOutcome(value: string) {
  return value.trim().toLowerCase().replaceAll('_', ' ')
}

function cleanText(value: string) {
  return value.trim() || null
}

function setIfColumnExists(
  payload: DbRow,
  keySet: Set<string>,
  key: string,
  value: unknown,
) {
  if (keySet.has(key)) {
    payload[key] = value
  }
}

function removeNullValues(payload: DbRow) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== null),
  )
}

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

function FilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-red-600 text-white'
          : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      {label}
    </button>
  )
}

function StatusPill({ value }: { value: string }) {
  const cleaned = cleanOutcome(value)

  const classes =
    cleaned === 'customer' || cleaned === 'won'
      ? 'bg-green-100 text-green-800'
      : cleaned === 'quoted' ||
          cleaned === 'quote sent' ||
          cleaned === 'negotiating'
        ? 'bg-amber-100 text-amber-800'
        : cleaned === 'bounced' || cleaned === 'negative'
          ? 'bg-red-100 text-red-800'
          : cleaned === 'out of office'
            ? 'bg-purple-100 text-purple-800'
            : cleaned === 'sent'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-stone-100 text-stone-700'

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${classes}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-stone-950">{value}</p>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  urgent = false,
}: {
  label: string
  value: number
  urgent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'
      }`}
    >
      <p className="text-sm font-bold text-stone-500">{label}</p>

      <p
        className={`mt-3 text-4xl font-black tracking-tight ${
          urgent ? 'text-red-600' : 'text-stone-950'
        }`}
      >
        {value}
      </p>
    </div>
  )
}