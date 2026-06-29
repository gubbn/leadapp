'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { classifySizeBand } from '@/lib/marketingImportHelpers'

type Company = {
  id: string
  company_name: string
  industry: string | null
  domain: string | null
  location: string | null
  business_size_raw: string | null
  size_band: string | null
  dnc: boolean | null
  created_at: string | null
  updated_at: string | null
}

type ContactCount = {
  company_id: string | null
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [search, setSearch] = useState('')
  const [sizeBand, setSizeBand] = useState('')
  const [showDnc, setShowDnc] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    loadCompanies()
  }, [])

  const filteredCompanies = useMemo(() => {
    const searchValue = search.toLowerCase().trim()

    return companies.filter((company) => {
      const searchable = [
        company.company_name,
        company.industry,
        company.domain,
        company.location,
        company.business_size_raw,
        company.size_band,
      ]
        .join(' ')
        .toLowerCase()

      const matchesSearch = !searchValue || searchable.includes(searchValue)
      const matchesSize = !sizeBand || company.size_band === sizeBand
      const matchesDnc = showDnc || !company.dnc

      return matchesSearch && matchesSize && matchesDnc
    })
  }, [companies, search, sizeBand, showDnc])

  const dncCount = useMemo(
    () => companies.filter((company) => company.dnc).length,
    [companies]
  )

  const unknownSizeCount = useMemo(
    () => companies.filter((company) => company.size_band === 'unknown').length,
    [companies]
  )

  async function loadCompanies() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const [companiesResult, contactsResult] = await Promise.all([
      supabase
        .from('companies')
        .select('*')
        .order('company_name', { ascending: true }),
      supabase.from('contacts').select('company_id'),
    ])

    if (companiesResult.error) {
      setErrorMessage(companiesResult.error.message)
      setLoading(false)
      return
    }

    if (contactsResult.error) {
      setErrorMessage(contactsResult.error.message)
      setLoading(false)
      return
    }

    const counts: Record<string, number> = {}

    ;((contactsResult.data ?? []) as ContactCount[]).forEach((contact) => {
      if (!contact.company_id) return

      counts[contact.company_id] = (counts[contact.company_id] ?? 0) + 1
    })

    setCompanies((companiesResult.data ?? []) as Company[])
    setContactCounts(counts)
    setLoading(false)
  }

  function updateLocalCompany(
    id: string,
    field: keyof Company,
    value: string | boolean
  ) {
    setCompanies((current) =>
      current.map((company) => {
        if (company.id !== id) return company

        return {
          ...company,
          [field]: value,
        }
      })
    )
  }

  async function saveCompany(company: Company) {
    setSavingId(company.id)
    setMessage('')
    setErrorMessage('')

    const calculatedSizeBand = classifySizeBand(company.business_size_raw ?? '')

    const { error } = await supabase
      .from('companies')
      .update({
        company_name: company.company_name,
        industry: company.industry,
        domain: company.domain,
        location: company.location,
        business_size_raw: company.business_size_raw,
        size_band: calculatedSizeBand,
        dnc: company.dnc ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', company.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage('Company saved.')
    setSavingId(null)
    await loadCompanies()
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="group">
            <p className="text-xl font-black tracking-tight text-red-600">
              Fixing IT
            </p>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              Marketing Dashboard
            </p>
          </Link>

          <nav className="hidden items-center gap-2 text-sm font-semibold text-stone-600 md:flex">
            <NavLink href="/">Dashboard</NavLink>
            <NavLink href="/import">Import</NavLink>
            <NavLink href="/cleanup">Cleanup</NavLink>
            <NavLink href="/contacts">Contacts</NavLink>
            <NavLink href="/campaigns">Campaigns</NavLink>
          </nav>
        </div>
      </header>

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/" className="text-sm font-bold text-red-600">
            ← Back to dashboard
          </Link>

          <div className="mt-6 max-w-3xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              CRM companies
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Approved companies.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Review company records, update industries, check company size
              bands and mark full companies as do-not-contact where needed.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total companies" value={companies.length} />
          <SummaryCard
            label="Filtered companies"
            value={filteredCompanies.length}
          />
          <SummaryCard
            label="Unknown size"
            value={unknownSizeCount}
            urgent={unknownSizeCount > 0}
          />
          <SummaryCard label="DNC companies" value={dncCount} urgent={dncCount > 0} />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Company filters
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Search by company name, domain, industry, location or size band.
              </p>
            </div>

            <Link
              href="/campaigns"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
            >
              Build campaign
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
                placeholder="Search companies..."
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
            Loading companies...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            No companies match this filter.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {filteredCompanies.map((company) => {
              const isSaving = savingId === company.id
              const contactsForCompany = contactCounts[company.id] ?? 0

              return (
                <section
                  key={company.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    company.dnc
                      ? 'border-stone-300 opacity-75'
                      : company.size_band === 'unknown'
                        ? 'border-red-200 ring-4 ring-red-50'
                        : 'border-stone-200'
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black text-stone-950">
                          {company.company_name}
                        </h3>

                        {company.dnc && (
                          <span className="rounded-full bg-stone-200 px-2 py-1 text-xs font-bold text-stone-700">
                            DNC
                          </span>
                        )}

                        {company.size_band === 'unknown' && (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                            Unknown size
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-stone-500">
                        {company.domain || 'No domain'} ·{' '}
                        {contactsForCompany} contact
                        {contactsForCompany === 1 ? '' : 's'}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <InfoPill>{company.size_band || 'unknown'}</InfoPill>
                        {company.industry && <InfoPill>{company.industry}</InfoPill>}
                        {company.location && <InfoPill>{company.location}</InfoPill>}
                      </div>
                    </div>

                    <Link
                      href={`/contacts?company=${encodeURIComponent(
                        company.company_name
                      )}`}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
                    >
                      View contacts
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <Input
                      label="Company name"
                      value={company.company_name ?? ''}
                      onChange={(value) =>
                        updateLocalCompany(company.id, 'company_name', value)
                      }
                    />

                    <Input
                      label="Domain"
                      value={company.domain ?? ''}
                      onChange={(value) =>
                        updateLocalCompany(company.id, 'domain', value)
                      }
                    />

                    <Input
                      label="Industry"
                      value={company.industry ?? ''}
                      onChange={(value) =>
                        updateLocalCompany(company.id, 'industry', value)
                      }
                    />

                    <Input
                      label="Location"
                      value={company.location ?? ''}
                      onChange={(value) =>
                        updateLocalCompany(company.id, 'location', value)
                      }
                    />

                    <Input
                      label="Business size"
                      value={company.business_size_raw ?? ''}
                      onChange={(value) =>
                        updateLocalCompany(company.id, 'business_size_raw', value)
                      }
                    />

                    <label className="block">
                      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                        Current size band
                      </span>

                      <div className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-bold text-stone-700">
                        {company.size_band || 'unknown'}
                      </div>
                    </label>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={company.dnc ?? false}
                        onChange={(event) =>
                          updateLocalCompany(
                            company.id,
                            'dnc',
                            event.target.checked
                          )
                        }
                      />
                      Do not contact company
                    </label>

                    <button
                      onClick={() => saveCompany(company)}
                      disabled={isSaving}
                      className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save company'}
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

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 transition hover:bg-stone-100 hover:text-red-600"
    >
      {children}
    </Link>
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

function Input({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <input
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