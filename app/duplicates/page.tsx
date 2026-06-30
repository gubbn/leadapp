'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import LogoutButton from '@/app/components/LogoutButton'

type DuplicateCompany = {
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
  duplicate_type: 'name' | 'domain'
  match_key: string
  duplicate_count: number
}

export default function DuplicatesPage() {
  const [rows, setRows] = useState<DuplicateCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadDuplicates()
  }, [])

  const groupedDuplicates = useMemo(() => {
    const groups: Record<string, DuplicateCompany[]> = {}

    rows.forEach((row) => {
      const key = `${row.duplicate_type}:${row.match_key}`

      if (!groups[key]) {
        groups[key] = []
      }

      groups[key].push(row)
    })

    return Object.entries(groups)
      .map(([key, companies]) => ({
        key,
        duplicateType: companies[0]?.duplicate_type ?? 'name',
        matchKey: companies[0]?.match_key ?? '',
        companies,
      }))
      .sort((a, b) => a.matchKey.localeCompare(b.matchKey))
  }, [rows])

  async function loadDuplicates() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
      .from('company_possible_duplicates')
      .select('*')
      .order('duplicate_type', { ascending: true })
      .order('match_key', { ascending: true })
      .order('company_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
    } else {
      setRows((data ?? []) as DuplicateCompany[])
    }

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
              Data quality
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Possible duplicate businesses.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              These companies may be duplicates because they share a similar
              company name or the same domain. Review them before exporting
              campaign lists.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Duplicate groups" value={groupedDuplicates.length} />
          <SummaryCard label="Flagged company records" value={rows.length} />
          <SummaryCard
            label="Needs review"
            value={rows.length}
            urgent={rows.length > 0}
          />
        </div>

        {errorMessage && (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        {loading ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            Checking for duplicates...
          </div>
        ) : groupedDuplicates.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-green-200 bg-white p-6 shadow-sm ring-4 ring-green-50">
            <h2 className="text-xl font-black text-stone-950">
              No duplicate businesses found.
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              The dashboard did not find any matching company names or shared
              domains.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {groupedDuplicates.map((group) => (
              <section
                key={group.key}
                className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm ring-4 ring-red-50"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black text-stone-950">
                        {group.duplicateType === 'domain'
                          ? 'Matching domain'
                          : 'Similar company name'}
                      </h2>

                      <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                        {group.companies.length} records
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-stone-500">
                      Match key: {group.matchKey}
                    </p>
                  </div>

                  <Link
                    href="/companies"
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
                  >
                    Open companies
                  </Link>
                </div>

                <div className="mt-5 overflow-hidden rounded-2xl border border-stone-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                        <tr>
                          <th className="px-4 py-3">Company</th>
                          <th className="px-4 py-3">Domain</th>
                          <th className="px-4 py-3">Industry</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Size</th>
                          <th className="px-4 py-3">Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {group.companies.map((company) => (
                          <tr
                            key={`${group.key}:${company.id}`}
                            className="border-t border-stone-100"
                          >
                            <td className="px-4 py-3 font-bold text-stone-900">
                              {company.company_name}
                            </td>

                            <td className="px-4 py-3">
                              {company.domain || '-'}
                            </td>

                            <td className="px-4 py-3">
                              {company.industry || '-'}
                            </td>

                            <td className="px-4 py-3">
                              {company.location || '-'}
                            </td>

                            <td className="px-4 py-3">
                              <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                                {company.size_band || 'unknown'}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              {company.dnc ? (
                                <span className="rounded-full bg-stone-200 px-2 py-1 text-xs font-bold text-stone-700">
                                  DNC
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                                  Active
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            ))}
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