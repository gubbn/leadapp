'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { isRoleAddress, isValidEmail } from '@/lib/marketingImportHelpers'
import LogoutButton from '@/app/components/LogoutButton'

type CompanyRow = {
  id: string
  company_name: string | null
  industry: string | null
  location: string | null
  size_band: string | null
  dnc: boolean | null
  outcome: string | null
  last_contact_date: string | null
  created_at: string | null
}

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

type ImportRow = {
  id: string
  approved_to_crm: boolean | null
  needs_contact_name_cleanup: boolean | null
  needs_email_cleanup: boolean | null
  needs_dnc_review: boolean | null
  email_status: string | null
  imported_at: string | null
}

type RelationshipStatus =
  | 'prospect'
  | 'customer'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

type ChartRow = {
  label: string
  value: number
}

export default function ReportsPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [exportRows, setExportRows] = useState<ExportRow[]>([])
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadReports()
  }, [])

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

  const dncCompanyCount = useMemo(() => {
    return companies.filter((company) => Boolean(company.dnc)).length
  }, [companies])

  const companyConversionCount = useMemo(() => {
    return relationshipCounts.customer
  }, [relationshipCounts.customer])

  const companyConversionRate = useMemo(() => {
    if (companies.length === 0) return 0

    return Math.round((companyConversionCount / companies.length) * 100)
  }, [companyConversionCount, companies.length])

  const campaignReadyRows = useMemo(() => {
    return exportRows.filter((row) => {
      const email = row.email?.trim().toLowerCase() || ''

      if (!email) return false
      if (!isValidEmail(email)) return false

      const outcome = row.outcome?.trim().toLowerCase() || ''

      const isCustomer = outcome === 'customer' || outcome === 'won'
      const isQuoted = outcome === 'quote sent' || outcome === 'negotiating'
      const isBounced = outcome === 'bounced'
      const isNegative = outcome === 'negative'

      return !isCustomer && !isQuoted && !isBounced && !isNegative
    })
  }, [exportRows])

  const riskyEmailCount = useMemo(() => {
    return exportRows.filter((row) => {
      const email = row.email?.trim().toLowerCase() || ''
      return email && isValidEmail(email) && isRoleAddress(email)
    }).length
  }, [exportRows])

  const invalidEmailCount = useMemo(() => {
    return exportRows.filter((row) => {
      const email = row.email?.trim().toLowerCase() || ''
      return !email || !isValidEmail(email)
    }).length
  }, [exportRows])

  const due90Count = useMemo(() => {
    return exportRows.filter(
      (row) => Number(row.days_since_last_contact ?? 0) >= 90,
    ).length
  }, [exportRows])

  const cleanupRows = useMemo(() => {
    return importRows.filter((row) => row.approved_to_crm !== true)
  }, [importRows])

  const cleanupIssueCount = useMemo(() => {
    return cleanupRows.filter(
      (row) =>
        row.needs_contact_name_cleanup ||
        row.needs_email_cleanup ||
        row.needs_dnc_review ||
        row.email_status === 'missing' ||
        row.email_status === 'invalid_format' ||
        row.email_status === 'duplicate' ||
        row.email_status === 'undeliverable' ||
        row.email_status === 'risky',
    ).length
  }, [cleanupRows])

  const importApprovedCount = useMemo(() => {
    return importRows.filter((row) => row.approved_to_crm === true).length
  }, [importRows])

  const topIndustries = useMemo(() => {
    return getTopCounts(
      companies.map((company) => company.industry || 'Unknown'),
      8,
    )
  }, [companies])

  const topLocations = useMemo(() => {
    return getTopCounts(
      companies.map((company) => company.location || 'Unknown'),
      8,
    )
  }, [companies])

  const sizeBands = useMemo(() => {
    return getTopCounts(
      companies.map((company) => company.size_band || 'unknown'),
      8,
    )
  }, [companies])

  const outcomeRows = useMemo(() => {
    return [
      { label: 'Prospects', value: relationshipCounts.prospect },
      { label: 'Customers / Won', value: relationshipCounts.customer },
      { label: 'Quoted / Negotiating', value: relationshipCounts.quoted },
      { label: 'Bounced', value: relationshipCounts.bounced },
      { label: 'Negative', value: relationshipCounts.negative },
      { label: 'No answer', value: relationshipCounts['no-answer'] },
      { label: 'Other', value: relationshipCounts.other },
    ]
  }, [relationshipCounts])

  const newestCompanies = useMemo(() => {
    return [...companies]
      .sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
        return bTime - aTime
      })
      .slice(0, 8)
  }, [companies])

  const highOpportunityRows = useMemo(() => {
    return campaignReadyRows
      .filter((row) => Number(row.days_since_last_contact ?? 0) >= 90)
      .slice(0, 8)
  }, [campaignReadyRows])

  async function loadReports() {
    setLoading(true)
    setErrorMessage('')

    const [companiesResult, exportResult, importResult] = await Promise.all([
      supabase
        .from('companies')
        .select(
          `
          id,
          company_name,
          industry,
          location,
          size_band,
          dnc,
          outcome,
          last_contact_date,
          created_at
        `,
        )
        .order('company_name', { ascending: true }),

      supabase
        .from('mail_merge_export')
        .select('*')
        .order('company_name', { ascending: true }),

      supabase
        .from('lead_import_rows')
        .select(
          `
          id,
          approved_to_crm,
          needs_contact_name_cleanup,
          needs_email_cleanup,
          needs_dnc_review,
          email_status,
          imported_at
        `,
        )
        .order('imported_at', { ascending: false }),
    ])

    if (companiesResult.error) {
      setErrorMessage(companiesResult.error.message)
      setLoading(false)
      return
    }

    if (exportResult.error) {
      setErrorMessage(exportResult.error.message)
      setLoading(false)
      return
    }

    if (importResult.error) {
      setErrorMessage(importResult.error.message)
      setLoading(false)
      return
    }

    setCompanies((companiesResult.data ?? []) as CompanyRow[])
    setExportRows((exportResult.data ?? []) as ExportRow[])
    setImportRows((importResult.data ?? []) as ImportRow[])
    setLoading(false)
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
            <NavLink href="/campaigns">Campaigns</NavLink>
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
              Reports
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Marketing reports and lead stats.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              A dashboard view of company relationships, campaign readiness,
              cleanup health, DNC records, industries and high-opportunity
              contacts.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {errorMessage && (
          <p className="mb-6 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            Loading reports...
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard label="Total companies" value={companies.length} />

              <SummaryCard
                label="Campaign-ready contacts"
                value={campaignReadyRows.length}
              />

              <SummaryCard
                label="Customers / won"
                value={relationshipCounts.customer}
                urgent={relationshipCounts.customer > 0}
              />

              <SummaryCard
                label="Conversion rate"
                value={`${companyConversionRate}%`}
                urgent={companyConversionRate > 0}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <SummaryCard
                label="Quoted / negotiating"
                value={relationshipCounts.quoted}
                urgent={relationshipCounts.quoted > 0}
              />

              <SummaryCard
                label="DNC companies"
                value={dncCompanyCount}
                urgent={dncCompanyCount > 0}
              />

              <SummaryCard
                label="90+ days opportunity"
                value={due90Count}
                urgent={due90Count > 0}
              />

              <SummaryCard
                label="Cleanup issues"
                value={cleanupIssueCount}
                urgent={cleanupIssueCount > 0}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ReportPanel
                title="Relationship breakdown"
                subtitle="Based on company outcome."
              >
                <BarList rows={outcomeRows} />
              </ReportPanel>

              <ReportPanel
                title="Campaign email health"
                subtitle="Based on mail merge export contacts."
              >
                <BarList
                  rows={[
                    {
                      label: 'Campaign-ready',
                      value: campaignReadyRows.length,
                    },
                    {
                      label: 'Risky / role email',
                      value: riskyEmailCount,
                    },
                    {
                      label: 'Invalid or missing email',
                      value: invalidEmailCount,
                    },
                    {
                      label: '90+ days since contact',
                      value: due90Count,
                    },
                  ]}
                />
              </ReportPanel>

              <ReportPanel
                title="Top industries"
                subtitle="Most common company industries."
              >
                <BarList rows={topIndustries} />
              </ReportPanel>

              <ReportPanel
                title="Top locations"
                subtitle="Most common company locations."
              >
                <BarList rows={topLocations} />
              </ReportPanel>

              <ReportPanel
                title="Company size bands"
                subtitle="Split by size band."
              >
                <BarList rows={sizeBands} />
              </ReportPanel>

              <ReportPanel
                title="Import and cleanup health"
                subtitle="Rows imported, approved and still needing work."
              >
                <BarList
                  rows={[
                    { label: 'Imported rows', value: importRows.length },
                    { label: 'Approved to CRM', value: importApprovedCount },
                    { label: 'Still in cleanup', value: cleanupRows.length },
                    { label: 'Cleanup issues', value: cleanupIssueCount },
                  ]}
                />
              </ReportPanel>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <ReportPanel
                title="High-opportunity contacts"
                subtitle="Campaign-ready contacts with 90+ days since last contact."
              >
                <SimpleTable
                  headers={['Company', 'Contact', 'Industry', 'Days']}
                  rows={highOpportunityRows.map((row) => [
                    row.company_name || '-',
                    [row.first_name, row.last_name].filter(Boolean).join(' ') ||
                      row.email ||
                      '-',
                    row.industry || '-',
                    String(row.days_since_last_contact ?? '-'),
                  ])}
                  emptyMessage="No high-opportunity contacts found."
                />
              </ReportPanel>

              <ReportPanel
                title="Newest companies"
                subtitle="Most recently created company records."
              >
                <SimpleTable
                  headers={['Company', 'Industry', 'Outcome', 'Created']}
                  rows={newestCompanies.map((company) => [
                    company.company_name || '-',
                    company.industry || '-',
                    company.outcome || 'No outcome',
                    company.created_at
                      ? new Date(company.created_at).toLocaleDateString('en-GB')
                      : '-',
                  ])}
                  emptyMessage="No companies found."
                />
              </ReportPanel>
            </div>
          </>
        )}
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

function getTopCounts(values: string[], limit: number): ChartRow[] {
  const map = new Map<string, number>()

  values.forEach((value) => {
    const cleaned = value.trim() || 'Unknown'
    map.set(cleaned, (map.get(cleaned) ?? 0) + 1)
  })

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, limit)
}

function ReportPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="border-b border-stone-100 pb-4">
        <h2 className="text-xl font-black text-stone-950">{title}</h2>

        <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  )
}

function BarList({ rows }: { rows: ChartRow[] }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1)

  if (rows.length === 0) {
    return <p className="text-sm text-stone-500">No data available.</p>
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const percent = Math.max(4, Math.round((row.value / maxValue) * 100))

        return (
          <div key={row.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-stone-700">{row.label}</span>
              <span className="font-black text-stone-950">{row.value}</span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-stone-100">
              <div
                className="h-full rounded-full bg-red-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SimpleTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[]
  rows: string[][]
  emptyMessage: string
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-3">
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                className="px-3 py-4 text-sm text-stone-500"
                colSpan={headers.length}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-stone-100">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
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
  value: number | string
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