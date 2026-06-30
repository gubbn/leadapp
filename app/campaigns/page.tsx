'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { isRoleAddress, isValidEmail } from '@/lib/marketingImportHelpers'
import LogoutButton from '@/app/components/LogoutButton'

type ExportRow = {
  contact_id: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  email: string | null
  role: string | null
  industry: string | null
  location: string | null
  size_band: string | null
  last_contact_date: string | null
  days_since_last_contact: number | null
  next_contact_opportunity: string | null
  outcome: string | null
}

type CampaignEmailStatus =
  | 'deliverable'
  | 'risky'
  | 'missing'
  | 'invalid_format'

type CampaignRelationshipStatus = 'prospect' | 'customer' | 'quoted'

type CampaignRow = ExportRow & {
  campaign_email_status: CampaignEmailStatus
  campaign_email_note: string
  campaign_relationship_status: CampaignRelationshipStatus
  campaign_relationship_note: string
}

type MultiSelectOption = {
  value: string
  label: string
}

const sizeBandOptions: MultiSelectOption[] = [
  { value: 'micro', label: 'Micro: 1–10' },
  { value: 'small', label: 'Small: 11–50' },
  { value: 'medium', label: 'Medium: 51–250' },
  { value: 'large', label: 'Large: 251–1000' },
  { value: 'enterprise', label: 'Enterprise: 1000+' },
  { value: 'unknown', label: 'Unknown' },
  { value: '1-10', label: '1–10' },
  { value: '11-50', label: '11–50' },
  { value: '51-250', label: '51–250' },
  { value: '250+', label: '250+' },
]

export default function CampaignsPage() {
  const [rows, setRows] = useState<CampaignRow[]>([])
  const [campaignName, setCampaignName] = useState('')
  const [selectedSizeBands, setSelectedSizeBands] = useState<string[]>([])
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [due90Only, setDue90Only] = useState(false)
  const [includeRiskyEmails, setIncludeRiskyEmails] = useState(true)
  const [includeInvalidEmails, setIncludeInvalidEmails] = useState(false)
  const [excludeCustomers, setExcludeCustomers] = useState(true)
  const [excludeQuotedCompanies, setExcludeQuotedCompanies] = useState(true)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDue90Only(params.get('due90') === 'true')
    loadRows()
  }, [])

  const industryOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.industry)
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .sort()
      .map((value) => ({ value, label: value }))
  }, [rows])

  const locationOptions = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.location)
          .filter((value): value is string => Boolean(value)),
      ),
    )
      .sort()
      .map((value) => ({ value, label: value }))
  }, [rows])

  const emailCounts = useMemo(() => {
    return rows.reduce(
      (counts, row) => {
        counts[row.campaign_email_status] += 1
        return counts
      },
      {
        deliverable: 0,
        risky: 0,
        missing: 0,
        invalid_format: 0,
      } as Record<CampaignEmailStatus, number>,
    )
  }, [rows])

  const customerCount = useMemo(() => {
    return rows.filter(
      (row) => row.campaign_relationship_status === 'customer',
    ).length
  }, [rows])

  const quotedCount = useMemo(() => {
    return rows.filter((row) => row.campaign_relationship_status === 'quoted')
      .length
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const rowSizeBand = row.size_band || 'unknown'
      const rowIndustry = row.industry || ''
      const rowLocation = row.location || ''

      const matchesSize =
        selectedSizeBands.length === 0 ||
        selectedSizeBands.includes(rowSizeBand)

      const matchesIndustry =
        selectedIndustries.length === 0 ||
        selectedIndustries.includes(rowIndustry)

      const matchesLocation =
        selectedLocations.length === 0 ||
        selectedLocations.includes(rowLocation)

      const matchesDue90 =
        !due90Only || Number(row.days_since_last_contact ?? 0) >= 90

      const isRisky = row.campaign_email_status === 'risky'

      const isInvalid =
        row.campaign_email_status === 'missing' ||
        row.campaign_email_status === 'invalid_format'

      const matchesEmailRules =
        (!isRisky || includeRiskyEmails) &&
        (!isInvalid || includeInvalidEmails)

      const isCustomer = row.campaign_relationship_status === 'customer'
      const isQuoted = row.campaign_relationship_status === 'quoted'

      const matchesCustomerRules = !excludeCustomers || !isCustomer

      const matchesQuotedRules = !excludeQuotedCompanies || !isQuoted

      return (
        matchesSize &&
        matchesIndustry &&
        matchesLocation &&
        matchesDue90 &&
        matchesEmailRules &&
        matchesCustomerRules &&
        matchesQuotedRules
      )
    })
  }, [
    rows,
    selectedSizeBands,
    selectedIndustries,
    selectedLocations,
    due90Only,
    includeRiskyEmails,
    includeInvalidEmails,
    excludeCustomers,
    excludeQuotedCompanies,
  ])

  const excludedCount = useMemo(() => {
    return rows.length - filteredRows.length
  }, [rows.length, filteredRows.length])

  const due90Count = useMemo(() => {
    return rows.filter((row) => Number(row.days_since_last_contact ?? 0) >= 90)
      .length
  }, [rows])

  async function loadRows() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const { data, error } = await supabase
      .from('mail_merge_export')
      .select('*')
      .order('company_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
    } else {
      setRows(((data ?? []) as ExportRow[]).map(addCampaignStatuses))
    }

    setLoading(false)
  }

  function resetFilters() {
    setSelectedSizeBands([])
    setSelectedIndustries([])
    setSelectedLocations([])
    setDue90Only(false)
    setIncludeRiskyEmails(true)
    setIncludeInvalidEmails(false)
    setExcludeCustomers(true)
    setExcludeQuotedCompanies(true)
    setMessage('')
    setErrorMessage('')
  }

  function downloadCsv() {
    const cleanedCampaignName = campaignName.trim()

    if (!cleanedCampaignName) {
      setErrorMessage('Give this campaign a name before downloading.')
      return
    }

    if (filteredRows.length === 0) {
      setErrorMessage('There are no contacts to export.')
      return
    }

    setMessage('')
    setErrorMessage('')

    const headers = [
      'Campaign Name',
      'First Name',
      'Last Name',
      'Company Name',
      'Email Address',
      'Email Status',
      'Email Note',
      'Relationship Status',
      'Relationship Note',
      'Role',
      'Industry',
      'Location',
      'Size Band',
      'Days Since Last Contact',
      'Next Contact Opportunity',
      'Outcome',
    ]

    const lines = filteredRows.map((row) =>
      [
        cleanedCampaignName,
        row.first_name,
        row.last_name,
        row.company_name,
        row.email,
        row.campaign_email_status,
        row.campaign_email_note,
        row.campaign_relationship_status,
        row.campaign_relationship_note,
        row.role,
        row.industry,
        row.location,
        row.size_band,
        row.days_since_last_contact,
        row.next_contact_opportunity,
        row.outcome,
      ]
        .map(csvEscape)
        .join(','),
    )

    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `${slugifyCampaignName(cleanedCampaignName)}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
    link.click()

    URL.revokeObjectURL(url)

    setMessage(
      `Downloaded "${cleanedCampaignName}" with ${filteredRows.length} contact${
        filteredRows.length === 1 ? '' : 's'
      }.`,
    )
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
            <NavLink href="/companies">Companies</NavLink>
            <NavLink href="/contacts">Contacts</NavLink>
            <NavLink href="/reports">Reports</NavLink>
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
              Step 04
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Build and export campaign lists.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Name your campaign, select one or more business sizes, industries
              and locations, then download a cleaner CSV for mail merge. Existing
              customers and quoted companies are excluded by default.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Total contacts" value={rows.length} />

          <SummaryCard label="Campaign contacts" value={filteredRows.length} />

          <SummaryCard
            label="Customers"
            value={customerCount}
            urgent={customerCount > 0}
          />

          <SummaryCard
            label="Quoted / negotiating"
            value={quotedCount}
            urgent={quotedCount > 0}
          />

          <SummaryCard
            label="Invalid/missing"
            value={emailCounts.invalid_format + emailCounts.missing}
            urgent={emailCounts.invalid_format + emailCounts.missing > 0}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="90+ days since contact"
            value={due90Count}
            urgent={due90Count > 0}
          />

          <SummaryCard
            label="Risky emails"
            value={emailCounts.risky}
            urgent={emailCounts.risky > 0}
          />

          <SummaryCard
            label="Excluded by filters"
            value={excludedCount}
            urgent={excludedCount > 0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Campaign setup
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Leave a dropdown empty to include everything in that category,
                or tick multiple options to narrow the campaign.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={resetFilters}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
              >
                Reset filters
              </button>

              <button
                onClick={downloadCsv}
                disabled={filteredRows.length === 0 || !campaignName.trim()}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download campaign
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Campaign name
              </span>

              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Example: Small business cyber review July"
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              />
            </label>

            <MultiSelectDropdown
              label="Company size"
              emptyLabel="All sizes"
              options={sizeBandOptions}
              selectedValues={selectedSizeBands}
              onChange={setSelectedSizeBands}
            />

            <MultiSelectDropdown
              label="Industry"
              emptyLabel="All industries"
              options={industryOptions}
              selectedValues={selectedIndustries}
              onChange={setSelectedIndustries}
            />

            <MultiSelectDropdown
              label="Location"
              emptyLabel="All locations"
              options={locationOptions}
              selectedValues={selectedLocations}
              onChange={setSelectedLocations}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <CheckboxCard
              checked={due90Only}
              onChange={setDue90Only}
              label="90+ days only"
            />

            <CheckboxCard
              checked={includeRiskyEmails}
              onChange={setIncludeRiskyEmails}
              label="Include risky emails"
            />

            <CheckboxCard
              checked={includeInvalidEmails}
              onChange={setIncludeInvalidEmails}
              label="Include invalid or missing emails"
            />

            <CheckboxCard
              checked={excludeCustomers}
              onChange={setExcludeCustomers}
              label="Exclude existing customers"
            />

            <CheckboxCard
              checked={excludeQuotedCompanies}
              onChange={setExcludeQuotedCompanies}
              label="Exclude quoted / negotiating companies"
            />
          </div>

          <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-stone-500">
              Campaign safety
            </p>

            <div className="mt-3 grid gap-2 text-sm md:grid-cols-5">
              <CountPill
                label="Looks usable"
                value={emailCounts.deliverable}
                tone="good"
              />

              <CountPill
                label="Risky / role"
                value={emailCounts.risky}
                tone="warning"
              />

              <CountPill
                label="Invalid"
                value={emailCounts.invalid_format}
                tone="bad"
              />

              <CountPill
                label="Missing"
                value={emailCounts.missing}
                tone="bad"
              />

              <CountPill
                label="Customers/quoted"
                value={customerCount + quotedCount}
                tone="warning"
              />
            </div>

            <p className="mt-3 text-sm text-stone-600">
              {excludedCount} contact
              {excludedCount === 1 ? ' is' : 's are'} currently excluded by
              your filters, email rules, customer rules, or quoted-company
              rules.
            </p>
          </div>

          {campaignName.trim() && (
            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                Current campaign
              </p>

              <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <p className="text-lg font-black text-stone-950">
                  {campaignName.trim()}
                </p>

                <p className="text-sm font-semibold text-stone-600">
                  {filteredRows.length} contact
                  {filteredRows.length === 1 ? '' : 's'} ready to download
                </p>
              </div>
            </div>
          )}

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
              Campaign preview
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Showing the first 100 matching contacts. The CSV download includes
              all matching contacts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Email status</th>
                  <th className="px-4 py-3">Relationship</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Days since contact</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={9}>
                      Loading contacts...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={9}>
                      No contacts match this campaign.
                    </td>
                  </tr>
                ) : (
                  filteredRows.slice(0, 100).map((row) => (
                    <tr
                      key={row.contact_id}
                      className="border-t border-stone-100"
                    >
                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {[row.first_name, row.last_name]
                          .filter(Boolean)
                          .join(' ') || '-'}
                      </td>

                      <td className="px-4 py-3">{row.company_name || '-'}</td>

                      <td className="px-4 py-3">{row.email || '-'}</td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <EmailStatusBadge
                            status={row.campaign_email_status}
                          />

                          <span className="text-xs text-stone-500">
                            {row.campaign_email_note}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <RelationshipBadge
                            status={row.campaign_relationship_status}
                          />

                          <span className="text-xs text-stone-500">
                            {row.campaign_relationship_note}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                          {row.size_band || 'unknown'}
                        </span>
                      </td>

                      <td className="px-4 py-3">{row.industry || '-'}</td>

                      <td className="px-4 py-3">{row.location || '-'}</td>

                      <td
                        className={`px-4 py-3 ${
                          Number(row.days_since_last_contact ?? 0) >= 90
                            ? 'font-black text-red-600'
                            : 'text-stone-600'
                        }`}
                      >
                        {row.days_since_last_contact ?? '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > 100 && (
            <div className="border-t border-stone-200 p-4 text-sm text-stone-500">
              Showing first 100 rows only. The CSV download includes all{' '}
              {filteredRows.length} matching contacts.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function addCampaignStatuses(row: ExportRow): CampaignRow {
  const emailStatus = getCampaignEmailStatus(row)
  const relationshipStatus = getCampaignRelationshipStatus(row.outcome)

  return {
    ...row,
    ...emailStatus,
    ...relationshipStatus,
  }
}

function getCampaignEmailStatus(row: ExportRow): {
  campaign_email_status: CampaignEmailStatus
  campaign_email_note: string
} {
  const email = row.email?.trim().toLowerCase() || null

  if (!email) {
    return {
      campaign_email_status: 'missing',
      campaign_email_note: 'Email address is missing.',
    }
  }

  if (!isValidEmail(email)) {
    return {
      campaign_email_status: 'invalid_format',
      campaign_email_note: 'Email address format is invalid.',
    }
  }

  if (isRoleAddress(email)) {
    return {
      campaign_email_status: 'risky',
      campaign_email_note: 'Shared address such as info@, sales@ or admin@.',
    }
  }

  return {
    campaign_email_status: 'deliverable',
    campaign_email_note: 'Email format looks usable.',
  }
}

function getCampaignRelationshipStatus(outcome: string | null): {
  campaign_relationship_status: CampaignRelationshipStatus
  campaign_relationship_note: string
} {
  const cleaned = outcome?.trim().toLowerCase() || ''

  if (cleaned === 'customer' || cleaned === 'won') {
    return {
      campaign_relationship_status: 'customer',
      campaign_relationship_note: outcome || 'Existing customer.',
    }
  }

  if (cleaned === 'quote sent' || cleaned === 'negotiating') {
    return {
      campaign_relationship_status: 'quoted',
      campaign_relationship_note: outcome || 'Quoted or active sales lead.',
    }
  }

  return {
    campaign_relationship_status: 'prospect',
    campaign_relationship_note: outcome || 'No customer/quote outcome.',
  }
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
  options: MultiSelectOption[]
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

function CheckboxCard({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}

function EmailStatusBadge({ status }: { status: CampaignEmailStatus }) {
  const classes =
    status === 'deliverable'
      ? 'bg-green-100 text-green-800'
      : status === 'risky'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-red-100 text-red-800'

  return (
    <span className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${classes}`}>
      {status.replaceAll('_', ' ')}
    </span>
  )
}

function RelationshipBadge({
  status,
}: {
  status: CampaignRelationshipStatus
}) {
  const classes =
    status === 'prospect'
      ? 'bg-green-100 text-green-800'
      : status === 'quoted'
        ? 'bg-amber-100 text-amber-800'
        : 'bg-blue-100 text-blue-800'

  return (
    <span className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${classes}`}>
      {status}
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
  tone: 'good' | 'warning' | 'bad'
}) {
  const classes =
    tone === 'good'
      ? 'bg-green-50 text-green-800 ring-green-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : 'bg-red-50 text-red-800 ring-red-100'

  return (
    <div className={`rounded-xl px-3 py-2 font-bold ring-1 ${classes}`}>
      {label}: {value}
    </div>
  )
}

function slugifyCampaignName(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'campaign'
  )
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return ''

  const stringValue = String(value)

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
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