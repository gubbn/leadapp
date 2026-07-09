'use client'

import type { ReactNode } from 'react'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type Contact = {
  id: string
  first_name: string | null
  last_name: string | null
  role: string | null
  email: string | null
  telephone: string | null
  dnc: boolean | null
  outcome: string | null
  last_contact_date: string | null
  next_contact_opportunity: string | null
  is_active: boolean | null
  company_name: string | null
  size_band: string | null
  industry: string | null
  location: string | null
}

type RawContact = {
  id: string
  first_name: string | null
  last_name: string | null
  role: string | null
  email: string | null
  telephone: string | null
  dnc: boolean | null
  outcome: string | null
  last_contact_date: string | null
  next_contact_opportunity: string | null
  is_active: boolean | null
  companies:
    | {
        company_name: string | null
        size_band: string | null
        industry: string | null
        location: string | null
      }
    | {
        company_name: string | null
        size_band: string | null
        industry: string | null
        location: string | null
      }[]
    | null
}

const outcomeOptions = [
  '',
  'Not contacted',
  'Contacted',
  'Interested',
  'Not interested',
  'Call booked',
  'Quote sent',
  'Customer',
  'No response',
]

export default function ContactsPage() {
  return (
    <Suspense fallback={<ContactsLoading />}>
      <ContactsContent />
    </Suspense>
  )
}

function ContactsContent() {
  const searchParams = useSearchParams()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState(searchParams.get('company') ?? '')
  const [sizeBand, setSizeBand] = useState('')
  const [showDnc, setShowDnc] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    loadContacts()
  }, [])

  const filteredContacts = useMemo(() => {
    const searchValue = search.toLowerCase().trim()

    return contacts.filter((contact) => {
      const fullName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`

      const searchable = [
        fullName,
        contact.company_name,
        contact.email,
        contact.role,
        contact.industry,
        contact.location,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !searchValue || searchable.includes(searchValue)
      const matchesSize = !sizeBand || contact.size_band === sizeBand
      const matchesDnc = showDnc || !contact.dnc

      return matchesSearch && matchesSize && matchesDnc
    })
  }, [contacts, search, sizeBand, showDnc])

  const dncCount = useMemo(() => {
    return contacts.filter((contact) => contact.dnc).length
  }, [contacts])

  const due90Count = useMemo(() => {
    return contacts.filter((contact) => {
      const daysSinceContact = getDaysSinceContact(contact.last_contact_date)
      return daysSinceContact !== null && daysSinceContact >= 90
    }).length
  }, [contacts])

  async function loadContacts() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const { data, error } = await supabase
      .from('contacts')
      .select(
        `
        id,
        first_name,
        last_name,
        role,
        email,
        telephone,
        dnc,
        outcome,
        last_contact_date,
        next_contact_opportunity,
        is_active,
        companies (
          company_name,
          size_band,
          industry,
          location
        )
      `,
      )
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setLoading(false)
      return
    }

    const normalisedContacts = ((data ?? []) as RawContact[]).map((contact) => {
      const company = Array.isArray(contact.companies)
        ? contact.companies[0]
        : contact.companies

      return {
        id: contact.id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        role: contact.role,
        email: contact.email,
        telephone: contact.telephone,
        dnc: contact.dnc,
        outcome: contact.outcome,
        last_contact_date: contact.last_contact_date,
        next_contact_opportunity: contact.next_contact_opportunity,
        is_active: contact.is_active,
        company_name: company?.company_name ?? null,
        size_band: company?.size_band ?? null,
        industry: company?.industry ?? null,
        location: company?.location ?? null,
      }
    })

    setContacts(normalisedContacts)
    setLoading(false)
  }

  function updateLocalContact(
    id: string,
    field: keyof Contact,
    value: string | boolean | null,
  ) {
    setContacts((current) =>
      current.map((contact) => {
        if (contact.id !== id) return contact

        return {
          ...contact,
          [field]: value,
        }
      }),
    )
  }

  async function saveContact(contact: Contact) {
    setSavingId(contact.id)
    setMessage('')
    setErrorMessage('')

    const { error } = await supabase
      .from('contacts')
      .update({
        first_name: contact.first_name,
        last_name: contact.last_name,
        role: contact.role,
        email: contact.email,
        telephone: contact.telephone,
        dnc: contact.dnc ?? false,
        outcome: contact.outcome || null,
        last_contact_date: contact.last_contact_date || null,
        next_contact_opportunity: contact.next_contact_opportunity || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage('Contact saved.')
    setSavingId(null)
    await loadContacts()
  }

  async function markContactedToday(contact: Contact) {
    const today = new Date().toISOString().slice(0, 10)

    const updatedContact = {
      ...contact,
      last_contact_date: today,
      outcome: contact.outcome || 'Contacted',
    }

    updateLocalContact(contact.id, 'last_contact_date', today)
    updateLocalContact(contact.id, 'outcome', updatedContact.outcome)

    await saveContact(updatedContact)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/" className="text-sm font-bold text-red-600">
            ← Back to dashboard
          </Link>

          <div className="mt-6 max-w-3xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              CRM contacts
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Approved marketing contacts.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              View contacts that have been approved into the CRM, update
              outcomes, mark contacts as DNC, and refresh last-contact dates.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total contacts" value={contacts.length} />

          <SummaryCard
            label="Filtered contacts"
            value={filteredContacts.length}
          />

          <SummaryCard
            label="90+ days due"
            value={due90Count}
            urgent={due90Count > 0}
          />

          <SummaryCard
            label="DNC contacts"
            value={dncCount}
            urgent={dncCount > 0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Contact filters
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Search by name, company, email, industry, role or location.
              </p>
            </div>

            <Link
              href="/campaigns"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
            >
              Export campaign list
            </Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-[1.5fr_0.8fr_0.7fr]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Search
              </span>

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search contacts..."
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Size band
              </span>

              <select
                value={sizeBand}
                onChange={(event) => setSizeBand(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="">All sizes</option>
                <option value="micro">Micro</option>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="enterprise">Enterprise</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>

            <label className="flex items-end gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={showDnc}
                onChange={(event) => setShowDnc(event.target.checked)}
              />
              Show DNC
            </label>
          </div>

          {message && (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
              {message}
            </p>
          )}

          {errorMessage && (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorMessage}
            </p>
          )}
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            Loading contacts...
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            No contacts match this filter.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredContacts.map((contact) => {
              const isSaving = savingId === contact.id
              const daysSinceContact = getDaysSinceContact(
                contact.last_contact_date,
              )

              return (
                <section
                  key={contact.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    contact.dnc
                      ? 'border-stone-300 opacity-75'
                      : daysSinceContact !== null && daysSinceContact >= 90
                        ? 'border-red-200 ring-4 ring-red-50'
                        : 'border-stone-200'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black text-stone-950">
                          {contact.first_name} {contact.last_name}
                        </h3>

                        {contact.dnc && (
                          <span className="rounded-full bg-stone-200 px-2 py-1 text-xs font-bold text-stone-700">
                            DNC
                          </span>
                        )}

                        {daysSinceContact !== null &&
                          daysSinceContact >= 90 &&
                          !contact.dnc && (
                            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                              90+ days
                            </span>
                          )}
                      </div>

                      <p className="mt-1 text-sm font-semibold text-stone-700">
                        {contact.company_name || 'No company'}
                      </p>

                      <p className="mt-1 text-sm text-stone-500">
                        {contact.email || 'No email'}
                        {contact.telephone ? ` · ${contact.telephone}` : ''}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <InfoPill>{contact.size_band || 'unknown'}</InfoPill>

                        {contact.industry && (
                          <InfoPill>{contact.industry}</InfoPill>
                        )}

                        {contact.location && (
                          <InfoPill>{contact.location}</InfoPill>
                        )}

                        {contact.role && <InfoPill>{contact.role}</InfoPill>}
                      </div>
                    </div>

                    <div className="rounded-2xl bg-stone-50 p-4 text-sm">
                      <p className="font-bold text-stone-500">
                        Days since contact
                      </p>

                      <p
                        className={`mt-1 text-3xl font-black ${
                          daysSinceContact !== null && daysSinceContact >= 90
                            ? 'text-red-600'
                            : 'text-stone-950'
                        }`}
                      >
                        {daysSinceContact ?? '-'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Input
                      label="First name"
                      value={contact.first_name ?? ''}
                      onChange={(value) =>
                        updateLocalContact(contact.id, 'first_name', value)
                      }
                    />

                    <Input
                      label="Last name"
                      value={contact.last_name ?? ''}
                      onChange={(value) =>
                        updateLocalContact(contact.id, 'last_name', value)
                      }
                    />

                    <Input
                      label="Email"
                      value={contact.email ?? ''}
                      onChange={(value) =>
                        updateLocalContact(contact.id, 'email', value)
                      }
                    />

                    <Input
                      label="Telephone"
                      value={contact.telephone ?? ''}
                      onChange={(value) =>
                        updateLocalContact(contact.id, 'telephone', value)
                      }
                    />

                    <Input
                      label="Role"
                      value={contact.role ?? ''}
                      onChange={(value) =>
                        updateLocalContact(contact.id, 'role', value)
                      }
                    />

                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                        Outcome
                      </span>

                      <select
                        value={contact.outcome ?? ''}
                        onChange={(event) =>
                          updateLocalContact(
                            contact.id,
                            'outcome',
                            event.target.value,
                          )
                        }
                        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
                      >
                        {outcomeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option || 'No outcome'}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Input
                      label="Last contact date"
                      type="date"
                      value={contact.last_contact_date ?? ''}
                      onChange={(value) =>
                        updateLocalContact(
                          contact.id,
                          'last_contact_date',
                          value,
                        )
                      }
                    />

                    <Input
                      label="Next opportunity"
                      type="date"
                      value={contact.next_contact_opportunity ?? ''}
                      onChange={(value) =>
                        updateLocalContact(
                          contact.id,
                          'next_contact_opportunity',
                          value,
                        )
                      }
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={contact.dnc ?? false}
                        onChange={(event) =>
                          updateLocalContact(
                            contact.id,
                            'dnc',
                            event.target.checked,
                          )
                        }
                      />
                      Do not contact
                    </label>

                    <button
                      onClick={() => markContactedToday(contact)}
                      disabled={isSaving}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:opacity-50"
                    >
                      Mark contacted today
                    </button>

                    <button
                      onClick={() => saveContact(contact)}
                      disabled={isSaving}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save contact'}
                    </button>
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

function getDaysSinceContact(lastContactDate: string | null) {
  if (!lastContactDate) return null

  const lastContact = new Date(lastContactDate)
  const today = new Date()

  if (Number.isNaN(lastContact.getTime())) return null

  const diffMs = today.getTime() - lastContact.getTime()

  return Math.floor(diffMs / 1000 / 60 / 60 / 24)
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

function Input({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
      />
    </label>
  )
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
      {children}
    </span>
  )
}

function ContactsLoading() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-stone-500">
            Loading contacts...
          </p>
        </div>
      </section>
    </main>
  )
}