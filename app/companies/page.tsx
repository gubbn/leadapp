'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/app/components/LogoutButton'

type CompanyRow = {
  id: string
  company_name: string | null
  industry: string | null
  location: string | null
  size_band: string | null
  domain: string | null
  dnc: boolean | null
  outcome: string | null
  last_contact_date: string | null
  created_at: string | null
}

type RelationshipFilter =
  | 'all'
  | 'prospects'
  | 'customers'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

type DncFilter = 'all' | 'dnc' | 'not-dnc'

type RelationshipStatus =
  | 'prospect'
  | 'customer'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

const outcomeOptions = [
  '',
  'No answer',
  'Bounced',
  'Negative',
  'Negotiating',
  'Quote sent',
  'Customer',
  'Won',
]

const sizeBandOptions = [
  '',
  'micro',
  'small',
  'medium',
  'large',
  'enterprise',
  'unknown',
]

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [relationshipFilter, setRelationshipFilter] =
    useState<RelationshipFilter>('all')
  const [dncFilter, setDncFilter] = useState<DncFilter>('all')
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CompanyRow | null>(null)

  useEffect(() => {
    loadCompanies()
  }, [])

  const industryOptions = useMemo(() => {
    return Array.from(
      new Set(
        companies
          .map((company) => company.industry)
          .filter((value): value is string => Boolean(value?.trim())),
      ),
    ).sort()
  }, [companies])

  const relationshipCounts = useMemo(() => {
    return companies.reduce(
      (counts, company) => {
        const status = getRelationshipStatus(company.outcome)
        counts[status] += 1
        return counts
      },
      {
        prospect: 0,
        customer: 0,
        quoted: 0,
        bounced: 0,
        negative: 0,
        'no-answer': 0,
        other: 0,
      } as Record<RelationshipStatus, number>,
    )
  }, [companies])

  const dncCount = useMemo(() => {
    return companies.filter((company) => Boolean(company.dnc)).length
  }, [companies])

  const filteredCompanies = useMemo(() => {
    const cleanedSearch = searchTerm.trim().toLowerCase()

    return companies.filter((company) => {
      const relationshipStatus = getRelationshipStatus(company.outcome)

      const matchesSearch =
        !cleanedSearch ||
        [
          company.company_name,
          company.industry,
          company.location,
          company.domain,
          company.outcome,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(cleanedSearch)

      const matchesRelationship =
        relationshipFilter === 'all' ||
        (relationshipFilter === 'prospects' &&
          relationshipStatus === 'prospect') ||
        (relationshipFilter === 'customers' &&
          relationshipStatus === 'customer') ||
        (relationshipFilter === 'quoted' && relationshipStatus === 'quoted') ||
        (relationshipFilter === 'bounced' && relationshipStatus === 'bounced') ||
        (relationshipFilter === 'negative' &&
          relationshipStatus === 'negative') ||
        (relationshipFilter === 'no-answer' &&
          relationshipStatus === 'no-answer') ||
        (relationshipFilter === 'other' && relationshipStatus === 'other')

      const matchesDnc =
        dncFilter === 'all' ||
        (dncFilter === 'dnc' && Boolean(company.dnc)) ||
        (dncFilter === 'not-dnc' && !company.dnc)

      const matchesIndustry =
        selectedIndustries.length === 0 ||
        selectedIndustries.includes(company.industry || '')

      return (
        matchesSearch && matchesRelationship && matchesDnc && matchesIndustry
      )
    })
  }, [
    companies,
    searchTerm,
    relationshipFilter,
    dncFilter,
    selectedIndustries,
  ])

  async function loadCompanies() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const { data, error } = await supabase
      .from('companies')
      .select(
        `
        id,
        company_name,
        industry,
        location,
        size_band,
        domain,
        dnc,
        outcome,
        last_contact_date,
        created_at
      `,
      )
      .order('company_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
    } else {
      setCompanies((data ?? []) as CompanyRow[])
    }

    setLoading(false)
  }

  function resetFilters() {
    setSearchTerm('')
    setRelationshipFilter('all')
    setDncFilter('all')
    setSelectedIndustries([])
    setMessage('')
    setErrorMessage('')
  }

  function startEdit(company: CompanyRow) {
    setEditingId(company.id)
    setEditDraft({ ...company })
    setMessage('')
    setErrorMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
    setSavingId(null)
    setMessage('')
    setErrorMessage('')
  }

  function updateDraft(field: keyof CompanyRow, value: string | boolean) {
    setEditDraft((current) => {
      if (!current) return current

      return {
        ...current,
        [field]: value,
      }
    })
  }

  async function saveCompany() {
    if (!editDraft) return

    setSavingId(editDraft.id)
    setMessage('')
    setErrorMessage('')

    const payload = {
      company_name: cleanText(editDraft.company_name),
      industry: cleanText(editDraft.industry),
      location: cleanText(editDraft.location),
      size_band: cleanText(editDraft.size_band),
      domain: cleanText(editDraft.domain),
      dnc: Boolean(editDraft.dnc),
      outcome: cleanText(editDraft.outcome),
      last_contact_date: cleanText(editDraft.last_contact_date),
    }

    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', editDraft.id)
      .select(
        `
        id,
        company_name,
        industry,
        location,
        size_band,
        domain,
        dnc,
        outcome,
        last_contact_date,
        created_at
      `,
      )

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    if (!data || data.length === 0) {
      setErrorMessage(
        'No company row was updated. This is usually caused by Supabase RLS blocking updates.',
      )
      setSavingId(null)
      return
    }

    const updatedCompany = data[0] as CompanyRow

    setCompanies((current) =>
      current.map((company) =>
        company.id === updatedCompany.id ? updatedCompany : company,
      ),
    )

    setMessage('Company updated.')
    setSavingId(null)
    setEditingId(null)
    setEditDraft(null)
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
            <LogoutButton />
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
              Companies
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review, filter and edit companies.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Filter companies by relationship, do-not-contact status and
              industry. Use Edit to update company details directly from the
              table.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Total companies" value={companies.length} />

          <SummaryCard
            label="Visible companies"
            value={filteredCompanies.length}
          />

          <SummaryCard
            label="Customers"
            value={relationshipCounts.customer}
            urgent={relationshipCounts.customer > 0}
          />

          <SummaryCard
            label="Quoted / negotiating"
            value={relationshipCounts.quoted}
            urgent={relationshipCounts.quoted > 0}
          />

          <SummaryCard
            label="DNC companies"
            value={dncCount}
            urgent={dncCount > 0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Company filters
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Use these filters to quickly find prospects, customers, quoted
                companies, DNC records or industry segments.
              </p>
            </div>

            <button
              onClick={resetFilters}
              className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
            >
              Reset filters
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.8fr_1fr]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Search
              </span>

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search company, industry, location, domain..."
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Relationship
              </span>

              <select
                value={relationshipFilter}
                onChange={(event) =>
                  setRelationshipFilter(
                    event.target.value as RelationshipFilter,
                  )
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="all">All relationships</option>
                <option value="prospects">Prospects</option>
                <option value="customers">Customers / won</option>
                <option value="quoted">Quoted / negotiating</option>
                <option value="bounced">Bounced</option>
                <option value="negative">Negative</option>
                <option value="no-answer">No answer</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                DNC
              </span>

              <select
                value={dncFilter}
                onChange={(event) =>
                  setDncFilter(event.target.value as DncFilter)
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="all">All companies</option>
                <option value="dnc">DNC only</option>
                <option value="not-dnc">Not DNC</option>
              </select>
            </label>

            <MultiSelectDropdown
              label="Industry"
              emptyLabel="All industries"
              options={industryOptions.map((industry) => ({
                value: industry,
                label: industry,
              }))}
              selectedValues={selectedIndustries}
              onChange={setSelectedIndustries}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <CountPill
              label="Prospects"
              value={relationshipCounts.prospect}
              tone="good"
            />

            <CountPill
              label="Customers"
              value={relationshipCounts.customer}
              tone="info"
            />

            <CountPill
              label="Quoted"
              value={relationshipCounts.quoted}
              tone="warning"
            />

            <CountPill
              label="Bounced"
              value={relationshipCounts.bounced}
              tone="bad"
            />

            <CountPill
              label="Negative"
              value={relationshipCounts.negative}
              tone="bad"
            />

            <CountPill
              label="No answer"
              value={relationshipCounts['no-answer']}
              tone="neutral"
            />
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

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-xl font-black text-stone-950">
              Companies table
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Showing {filteredCompanies.length} of {companies.length}{' '}
              companies.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Relationship</th>
                  <th className="px-4 py-3">DNC</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Last contact</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={9}>
                      Loading companies...
                    </td>
                  </tr>
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={9}>
                      No companies match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((company) => {
                    const isEditing = editingId === company.id
                    const draft = isEditing ? editDraft : company
                    const relationshipStatus = getRelationshipStatus(
                      draft?.outcome ?? null,
                    )

                    return (
                      <tr
                        key={company.id}
                        className="border-t border-stone-100 align-top"
                      >
                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <TableInput
                              value={draft.company_name ?? ''}
                              onChange={(value) =>
                                updateDraft('company_name', value)
                              }
                              placeholder="Company name"
                            />
                          ) : (
                            <div className="font-black text-stone-950">
                              {company.company_name || 'Unnamed company'}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <select
                              value={draft.outcome ?? ''}
                              onChange={(event) =>
                                updateDraft('outcome', event.target.value)
                              }
                              className="w-44 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                            >
                              {outcomeOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option || 'No outcome'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <RelationshipBadge status={relationshipStatus} />

                              <span className="text-xs text-stone-500">
                                {company.outcome || 'No outcome'}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <label className="flex items-center gap-2 font-bold">
                              <input
                                type="checkbox"
                                checked={Boolean(draft.dnc)}
                                onChange={(event) =>
                                  updateDraft('dnc', event.target.checked)
                                }
                              />
                              DNC
                            </label>
                          ) : company.dnc ? (
                            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                              DNC
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                              OK
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <TableInput
                              value={draft.industry ?? ''}
                              onChange={(value) =>
                                updateDraft('industry', value)
                              }
                              placeholder="Industry"
                            />
                          ) : (
                            company.industry || '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <TableInput
                              value={draft.location ?? ''}
                              onChange={(value) =>
                                updateDraft('location', value)
                              }
                              placeholder="Location"
                            />
                          ) : (
                            company.location || '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <select
                              value={draft.size_band ?? ''}
                              onChange={(event) =>
                                updateDraft('size_band', event.target.value)
                              }
                              className="w-36 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                            >
                              {sizeBandOptions.map((option) => (
                                <option key={option} value={option}>
                                  {option || 'Unknown'}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                              {company.size_band || 'unknown'}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <TableInput
                              value={draft.domain ?? ''}
                              onChange={(value) =>
                                updateDraft('domain', value)
                              }
                              placeholder="Domain"
                            />
                          ) : company.domain ? (
                            <a
                              href={normaliseWebsiteUrl(company.domain)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-red-600 hover:underline"
                            >
                              {company.domain}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && draft ? (
                            <input
                              type="date"
                              value={draft.last_contact_date ?? ''}
                              onChange={(event) =>
                                updateDraft(
                                  'last_contact_date',
                                  event.target.value,
                                )
                              }
                              className="w-40 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                            />
                          ) : company.last_contact_date ? (
                            new Date(
                              company.last_contact_date,
                            ).toLocaleDateString('en-GB')
                          ) : (
                            '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={saveCompany}
                                disabled={savingId === company.id}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                              >
                                {savingId === company.id ? 'Saving...' : 'Save'}
                              </button>

                              <button
                                onClick={cancelEdit}
                                disabled={savingId === company.id}
                                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEdit(company)}
                              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

function getRelationshipStatus(outcome: string | null): RelationshipStatus {
  const cleaned = outcome?.trim().toLowerCase() || ''

  if (cleaned === 'customer' || cleaned === 'won') return 'customer'

  if (cleaned === 'quote sent' || cleaned === 'negotiating') return 'quoted'

  if (cleaned === 'bounced') return 'bounced'

  if (cleaned === 'negative') return 'negative'

  if (cleaned === 'no answer') return 'no-answer'

  if (!cleaned || cleaned === 'null') return 'prospect'

  return 'other'
}

function cleanText(value: string | null | undefined) {
  const cleaned = value?.trim() || null
  return cleaned
}

function normaliseWebsiteUrl(value: string) {
  const cleaned = value.trim()

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned
  }

  return `https://${cleaned}`
}

function TableInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
    />
  )
}

function MultiSelectDropdown({
  label,
  emptyLabel,
  options,
  selectedValues,
  onChange,
}: {
  label: string
  emptyLabel: string
  options: { value: string; label: string }[]
  selectedValues: string[]
  onChange: (values: string[]) => void
}) {
  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }

    onChange([...selectedValues, value])
  }

  function clearValues() {
    onChange([])
  }

  const selectedLabel =
    selectedValues.length === 0
      ? emptyLabel
      : selectedValues.length === 1
        ? options.find((option) => option.value === selectedValues[0])?.label ||
          selectedValues[0]
        : `${selectedValues.length} selected`

  return (
    <div className="relative block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <details className="group mt-1">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 outline-none transition hover:bg-stone-50 group-open:border-red-500 group-open:ring-4 group-open:ring-red-50">
          <span className="truncate">{selectedLabel}</span>
          <span className="ml-2 text-xs text-stone-400">▼</span>
        </summary>

        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-xl">
          {selectedValues.length > 0 && (
            <button
              type="button"
              onClick={clearValues}
              className="mb-2 w-full rounded-lg bg-stone-100 px-3 py-2 text-left text-xs font-bold text-stone-600 transition hover:bg-stone-200"
            >
              Clear selection
            </button>
          )}

          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              No options available.
            </p>
          ) : (
            <div className="space-y-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option.value)}
                    onChange={() => toggleValue(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

function RelationshipBadge({ status }: { status: RelationshipStatus }) {
  const classes =
    status === 'prospect'
      ? 'bg-green-100 text-green-800'
      : status === 'customer'
        ? 'bg-blue-100 text-blue-800'
        : status === 'quoted'
          ? 'bg-amber-100 text-amber-800'
          : status === 'bounced' || status === 'negative'
            ? 'bg-red-100 text-red-800'
            : 'bg-stone-100 text-stone-700'

  const label =
    status === 'no-answer' ? 'no answer' : status.replaceAll('-', ' ')

  return (
    <span
      className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${classes}`}
    >
      {label}
    </span>
  )
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'warning' | 'bad' | 'neutral' | 'info'
}) {
  const classes =
    tone === 'good'
      ? 'bg-green-50 text-green-800 ring-green-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : tone === 'bad'
          ? 'bg-red-50 text-red-800 ring-red-100'
          : tone === 'info'
            ? 'bg-blue-50 text-blue-800 ring-blue-100'
            : 'bg-stone-50 text-stone-700 ring-stone-100'

  return (
    <div className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${classes}`}>
      {label}: {value}
    </div>
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