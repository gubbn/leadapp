'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { csvEscape } from '@/lib/marketingImportHelpers'

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

const sizeBands = [
  { value: '', label: 'All sizes' },
  { value: 'micro', label: 'Micro: 1–10' },
  { value: 'small', label: 'Small: 11–50' },
  { value: 'medium', label: 'Medium: 51–250' },
  { value: 'large', label: 'Large: 251–1000' },
  { value: 'enterprise', label: 'Enterprise: 1000+' },
  { value: 'unknown', label: 'Unknown' },
]

export default function CampaignsPage() {
  const [rows, setRows] = useState<ExportRow[]>([])
  const [sizeBand, setSizeBand] = useState('')
  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [due90Only, setDue90Only] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setDue90Only(params.get('due90') === 'true')
    loadRows()
  }, [])

  const industries = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.industry)
          .filter((value): value is string => Boolean(value))
      )
    ).sort()
  }, [rows])

  const locations = useMemo(() => {
    return Array.from(
      new Set(
        rows
          .map((row) => row.location)
          .filter((value): value is string => Boolean(value))
      )
    ).sort()
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSize = !sizeBand || row.size_band === sizeBand
      const matchesIndustry = !industry || row.industry === industry
      const matchesLocation = !location || row.location === location
      const matchesDue90 =
        !due90Only || Number(row.days_since_last_contact ?? 0) >= 90

      return matchesSize && matchesIndustry && matchesLocation && matchesDue90
    })
  }, [rows, sizeBand, industry, location, due90Only])

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
      setRows(data ?? [])
    }

    setLoading(false)
  }

  function resetFilters() {
    setSizeBand('')
    setIndustry('')
    setLocation('')
    setDue90Only(false)
  }

  function downloadCsv() {
    if (filteredRows.length === 0) {
      setErrorMessage('There are no contacts to export.')
      return
    }

    const headers = [
      'First Name',
      'Last Name',
      'Company Name',
      'Email Address',
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
        row.first_name,
        row.last_name,
        row.company_name,
        row.email,
        row.role,
        row.industry,
        row.location,
        row.size_band,
        row.days_since_last_contact,
        row.next_contact_opportunity,
        row.outcome,
      ]
        .map(csvEscape)
        .join(',')
    )

    const csv = [headers.join(','), ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.download = `mail-merge-export-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`
    link.click()

    URL.revokeObjectURL(url)

    setMessage(`Exported ${filteredRows.length} contacts.`)
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
              Step 03
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Build and export campaign lists.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Filter contacts by business size, industry, location and 90-day
              follow-up status, then export a clean CSV for mail merge.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Clean export contacts" value={rows.length} />
          <SummaryCard
            label="90+ days since contact"
            value={due90Count}
            urgent={due90Count > 0}
          />
          <SummaryCard label="Current export list" value={filteredRows.length} />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Campaign filters
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                DNC contacts and incomplete names/emails are automatically
                excluded from this export.
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
                disabled={filteredRows.length === 0}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download CSV
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Company size
              </span>

              <select
                value={sizeBand}
                onChange={(event) => setSizeBand(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                {sizeBands.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Industry
              </span>

              <select
                value={industry}
                onChange={(event) => setIndustry(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="">All industries</option>
                {industries.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Location
              </span>

              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="">All locations</option>
                {locations.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-end gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={due90Only}
                onChange={(event) => setDue90Only(event.target.checked)}
              />
              90+ days only
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

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-xl font-black text-stone-950">
              Export preview
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Showing the first 100 matching contacts. CSV export includes all
              matching contacts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Days since contact</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={6}>
                      Loading contacts...
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={6}>
                      No contacts match this campaign.
                    </td>
                  </tr>
                ) : (
                  filteredRows.slice(0, 100).map((row) => (
                    <tr key={row.contact_id} className="border-t border-stone-100">
                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {row.first_name} {row.last_name}
                      </td>

                      <td className="px-4 py-3">{row.company_name}</td>

                      <td className="px-4 py-3">{row.email}</td>

                      <td className="px-4 py-3">
                        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                          {row.size_band || 'unknown'}
                        </span>
                      </td>

                      <td className="px-4 py-3">{row.industry || '-'}</td>

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
              Showing first 100 rows only. The CSV export includes all{' '}
              {filteredRows.length} matching contacts.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
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