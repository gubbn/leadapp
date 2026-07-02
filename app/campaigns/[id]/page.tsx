'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type Campaign = {
  id: string
  name: string
  description: string | null
  created_at: string
}

type CampaignCompany = {
  id: string
  campaign_id: string
  company_id: string
  contact_id: string | null
  email_address_used: string | null
  email_status: string | null
  outcome: string | null
  notes: string | null
  created_at: string
  companies?: {
    id: string
    business_name: string | null
    location?: string | null
    industry?: string | null
  } | null
  contacts?: {
    id: string
    first_name: string | null
    last_name: string | null
    email_address: string | null
    role: string | null
    telephone: string | null
    outcome?: string | null
  } | null
}

type NewContactForm = {
  first_name: string
  last_name: string
  email_address: string
  role: string
  telephone: string
  notes: string
}

const emptyContactForm: NewContactForm = {
  first_name: '',
  last_name: '',
  email_address: '',
  role: '',
  telephone: '',
  notes: '',
}

const emailStatusLabels: Record<string, string> = {
  selected: 'Selected',
  sent: 'Sent',
  bounced: 'Bounced',
  out_of_office: 'Out of office',
  replied: 'Replied',
  no_response: 'No response',
}

const outcomeLabels: Record<string, string> = {
  none: 'None',
  quoted: 'Quoted',
  customer: 'Customer',
  negative: 'Negative',
  dnc: 'DNC',
  no_answer: 'No answer',
}

function formatName(contact?: CampaignCompany['contacts']) {
  if (!contact) return 'No contact selected'

  const name = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return name || contact.email_address || 'Unnamed contact'
}

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

export default function CampaignDetailPage() {
  const params = useParams()
  const campaignId = String(params.id)

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [rows, setRows] = useState<CampaignCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)
  const [openContactFormId, setOpenContactFormId] = useState<string | null>(null)
  const [contactForms, setContactForms] = useState<Record<string, NewContactForm>>({})

  async function loadCampaign() {
    setLoading(true)
    setError(null)

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campaignError) {
      setError(campaignError.message)
      setLoading(false)
      return
    }

    const { data: campaignRows, error: rowsError } = await supabase
      .from('campaign_companies')
      .select(
        `
        *,
        companies (*),
        contacts (*)
      `
      )
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })

    if (rowsError) {
      setError(rowsError.message)
      setLoading(false)
      return
    }

    setCampaign(campaignData)
    setRows((campaignRows || []) as CampaignCompany[])
    setLoading(false)
  }

  useEffect(() => {
    loadCampaign()
  }, [campaignId])

  const stats = useMemo(() => {
    const total = rows.length

    const bounced = rows.filter((row) => row.email_status === 'bounced').length
    const outOfOffice = rows.filter(
      (row) => row.email_status === 'out_of_office'
    ).length

    const quoted = rows.filter((row) => {
      const campaignOutcome = row.outcome === 'quoted'
      const contactOutcome = row.contacts?.outcome === 'Quote sent'
      return campaignOutcome || contactOutcome
    }).length

    const customer = rows.filter((row) => {
      const campaignOutcome = row.outcome === 'customer'
      const contactOutcome =
        row.contacts?.outcome === 'Customer' || row.contacts?.outcome === 'Won'
      return campaignOutcome || contactOutcome
    }).length

    return {
      total,
      bounced,
      outOfOffice,
      quoted,
      customer,
      success: quoted + customer,
    }
  }, [rows])

  const filteredRows = useMemo(() => {
    if (filter === 'all') return rows

    if (filter === 'quoted') {
      return rows.filter(
        (row) =>
          row.outcome === 'quoted' || row.contacts?.outcome === 'Quote sent'
      )
    }

    if (filter === 'customer') {
      return rows.filter(
        (row) =>
          row.outcome === 'customer' ||
          row.contacts?.outcome === 'Customer' ||
          row.contacts?.outcome === 'Won'
      )
    }

    return rows.filter((row) => row.email_status === filter)
  }, [rows, filter])

  async function updateEmailStatus(rowId: string, status: string) {
    setSavingId(rowId)

    const { error: updateError } = await supabase
      .from('campaign_companies')
      .update({
        email_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId)

    if (updateError) {
      setError(updateError.message)
    } else {
      setRows((current) =>
        current.map((row) =>
          row.id === rowId ? { ...row, email_status: status } : row
        )
      )
    }

    setSavingId(null)
  }

  async function updateOutcome(rowId: string, outcome: string) {
    setSavingId(rowId)

    const { error: updateError } = await supabase
      .from('campaign_companies')
      .update({
        outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('id', rowId)

    if (updateError) {
      setError(updateError.message)
    } else {
      setRows((current) =>
        current.map((row) => (row.id === rowId ? { ...row, outcome } : row))
      )
    }

    setSavingId(null)
  }

  function updateContactForm(rowId: string, field: keyof NewContactForm, value: string) {
    setContactForms((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] || emptyContactForm),
        [field]: value,
      },
    }))
  }

  async function addContactFromOutOfOffice(row: CampaignCompany) {
    const form = contactForms[row.id] || emptyContactForm

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email_address.trim()) {
      setError('First name, last name and email address are required.')
      return
    }

    setSavingId(row.id)
    setError(null)

    const { data: newContact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        company_id: row.company_id,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email_address: form.email_address.trim(),
        role: form.role.trim() || null,
        telephone: form.telephone.trim() || null,
        notes:
          form.notes.trim() ||
          `Added from out-of-office reply in campaign ${campaign?.name || ''}`,
        contact_source: 'out_of_office',
        is_active: true,
      })
      .select('*')
      .single()

    if (insertError) {
      setError(insertError.message)
      setSavingId(null)
      return
    }

    await supabase
      .from('campaign_companies')
      .update({
        notes: row.notes
          ? `${row.notes}\nNew contact added from out-of-office reply: ${form.first_name} ${form.last_name}`
          : `New contact added from out-of-office reply: ${form.first_name} ${form.last_name}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    setRows((current) =>
      current.map((currentRow) =>
        currentRow.id === row.id
          ? {
              ...currentRow,
              notes: currentRow.notes
                ? `${currentRow.notes}\nNew contact added from out-of-office reply: ${form.first_name} ${form.last_name}`
                : `New contact added from out-of-office reply: ${form.first_name} ${form.last_name}`,
            }
          : currentRow
      )
    )

    setContactForms((current) => ({
      ...current,
      [row.id]: emptyContactForm,
    }))

    setOpenContactFormId(null)
    setSavingId(null)
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/campaigns"
              className="text-sm font-semibold text-blue-700 hover:text-blue-900"
            >
              ← Back to campaigns
            </Link>

            <h1 className="mt-2 text-3xl font-bold">
              {campaign?.name || 'Campaign'}
            </h1>

            {campaign?.description ? (
              <p className="mt-1 max-w-3xl text-sm text-slate-600">
                {campaign.description}
              </p>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
            Loading campaign...
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Selected
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.total}</p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bounced
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.bounced}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.bounced, stats.total)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Out of office
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.outOfOffice}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.outOfOffice, stats.total)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quoted
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.quoted}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.quoted, stats.total)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Customers
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.customer}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.customer, stats.total)}
                </p>
              </div>
            </section>

            <section className="mb-6 rounded-xl border bg-white p-4">
              <div className="flex flex-wrap gap-2">
                {[
                  ['all', 'All companies'],
                  ['bounced', 'Bounced'],
                  ['out_of_office', 'Out of office'],
                  ['quoted', 'Quoted'],
                  ['customer', 'Customer'],
                  ['sent', 'Sent'],
                  ['no_response', 'No response'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                      filter === value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Company
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Email used
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Email status
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Outcome
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Actions
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          No companies found for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const form = contactForms[row.id] || emptyContactForm

                        return (
                          <tr key={row.id} className="align-top">
                            <td className="px-4 py-4">
                              <div className="font-semibold">
                                {row.companies?.business_name || 'Unnamed company'}
                              </div>

                              <div className="mt-1 text-xs text-slate-500">
                                {row.companies?.location || row.companies?.industry || ''}
                              </div>

                              <Link
                                href={`/companies/${row.company_id}`}
                                className="mt-2 inline-block text-xs font-semibold text-blue-700 hover:text-blue-900"
                              >
                                Open company
                              </Link>
                            </td>

                            <td className="px-4 py-4">
                              <div className="font-medium">
                                {formatName(row.contacts)}
                              </div>

                              {row.contacts?.role ? (
                                <div className="text-xs text-slate-500">
                                  {row.contacts.role}
                                </div>
                              ) : null}
                            </td>

                            <td className="px-4 py-4">
                              {row.email_address_used ||
                                row.contacts?.email_address ||
                                '—'}
                            </td>

                            <td className="px-4 py-4">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                {
                                  emailStatusLabels[
                                    row.email_status || 'selected'
                                  ]
                                }
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                {outcomeLabels[row.outcome || 'none'] || row.outcome}
                              </span>
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={savingId === row.id}
                                  onClick={() =>
                                    updateEmailStatus(row.id, 'bounced')
                                  }
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  Mark bounced
                                </button>

                                <button
                                  type="button"
                                  disabled={savingId === row.id}
                                  onClick={() =>
                                    updateEmailStatus(row.id, 'out_of_office')
                                  }
                                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                                >
                                  Mark OOO
                                </button>

                                <button
                                  type="button"
                                  disabled={savingId === row.id}
                                  onClick={() => updateOutcome(row.id, 'quoted')}
                                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                >
                                  Quoted
                                </button>

                                <button
                                  type="button"
                                  disabled={savingId === row.id}
                                  onClick={() =>
                                    updateOutcome(row.id, 'customer')
                                  }
                                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50"
                                >
                                  Customer
                                </button>

                                {row.email_status === 'out_of_office' ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenContactFormId(
                                        openContactFormId === row.id
                                          ? null
                                          : row.id
                                      )
                                    }
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                  >
                                    Add contact
                                  </button>
                                ) : null}
                              </div>

                              {openContactFormId === row.id ? (
                                <div className="mt-4 rounded-xl border bg-slate-50 p-4">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <input
                                      value={form.first_name}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'first_name',
                                          event.target.value
                                        )
                                      }
                                      placeholder="First name"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={form.last_name}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'last_name',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Last name"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={form.email_address}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'email_address',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Email address"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={form.role}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'role',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Role"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={form.telephone}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'telephone',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Telephone"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />

                                    <input
                                      value={form.notes}
                                      onChange={(event) =>
                                        updateContactForm(
                                          row.id,
                                          'notes',
                                          event.target.value
                                        )
                                      }
                                      placeholder="Notes"
                                      className="rounded-lg border px-3 py-2 text-sm"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    disabled={savingId === row.id}
                                    onClick={() =>
                                      addContactFromOutOfOffice(row)
                                    }
                                    className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                                  >
                                    Save new contact
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
            </section>
          </>
        )}
      </div>
    </main>
  )
}