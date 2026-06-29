'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  classifySizeBand,
  isValidEmail,
  splitSingleName,
} from '@/lib/marketingImportHelpers'

type CleanupRow = {
  id: string
  lead_company_name: string | null
  contact_name_raw: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  industry: string | null
  email_address: string | null
  telephone: string | null
  domain: string | null
  location: string | null
  business_size_raw: string | null
  size_band: string | null
  dnc_raw: string | null
  dnc: boolean | null
  outcome: string | null
  import_notes: string | null
  needs_contact_name_cleanup: boolean | null
  needs_email_cleanup: boolean | null
  needs_size_cleanup: boolean | null
  needs_dnc_review: boolean | null
  approved_to_crm: boolean | null
  imported_at: string | null
}

type FilterMode = 'all' | 'needs-cleanup' | 'ready'

export default function CleanupPage() {
  const [rows, setRows] = useState<CleanupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    loadRows()
  }, [])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const hasIssues = rowHasIssues(row)

      if (filterMode === 'needs-cleanup') return hasIssues
      if (filterMode === 'ready') return !hasIssues

      return true
    })
  }, [rows, filterMode])

  const issueCount = useMemo(() => rows.filter(rowHasIssues).length, [rows])
  const readyCount = rows.length - issueCount

  async function loadRows() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const { data, error } = await supabase
      .from('lead_import_rows')
      .select('*')
      .eq('approved_to_crm', false)
      .order('imported_at', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
    } else {
      setRows(data ?? [])
    }

    setLoading(false)
  }

  function updateLocalRow(id: string, field: keyof CleanupRow, value: string | boolean) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row

        return {
          ...row,
          [field]: value,
        }
      })
    )
  }

  function splitName(row: CleanupRow) {
    const split = splitSingleName(row.contact_name_raw ?? '')

    setRows((current) =>
      current.map((item) => {
        if (item.id !== row.id) return item

        return {
          ...item,
          first_name: split.firstName,
          last_name: split.lastName,
        }
      })
    )
  }

  async function saveRow(row: CleanupRow) {
    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const sizeBand = classifySizeBand(row.business_size_raw ?? '')

    const needsNameCleanup = !row.first_name?.trim() || !row.last_name?.trim()
    const needsEmailCleanup = !isValidEmail(row.email_address ?? '')
    const needsSizeCleanup = sizeBand === 'unknown'

    const notes: string[] = []

    if (needsNameCleanup) notes.push('Name needs checking')
    if (needsEmailCleanup) notes.push('Missing or invalid email')
    if (needsSizeCleanup) notes.push('Unknown business size')

    const { error } = await supabase
      .from('lead_import_rows')
      .update({
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        email_address: row.email_address,
        telephone: row.telephone,
        industry: row.industry,
        domain: row.domain,
        location: row.location,
        business_size_raw: row.business_size_raw,
        size_band: sizeBand,
        dnc: row.dnc ?? false,
        outcome: row.outcome,
        needs_contact_name_cleanup: needsNameCleanup,
        needs_email_cleanup: needsEmailCleanup,
        needs_size_cleanup: needsSizeCleanup,
        needs_dnc_review: false,
        import_notes: notes.join(', '),
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage('Row saved.')
    setSavingId(null)
    await loadRows()
  }

  async function approveRow(row: CleanupRow) {
    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const { error } = await supabase.rpc('approve_import_row', {
      p_row_id: row.id,
    })

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage('Row approved into CRM.')
    setSavingId(null)
    await loadRows()
  }

  async function saveAndApprove(row: CleanupRow) {
    await saveRow(row)

    const sizeBand = classifySizeBand(row.business_size_raw ?? '')
    const cleanedRow = {
      ...row,
      size_band: sizeBand,
      needs_contact_name_cleanup: !row.first_name?.trim() || !row.last_name?.trim(),
      needs_email_cleanup: !isValidEmail(row.email_address ?? ''),
      needs_size_cleanup: sizeBand === 'unknown',
      needs_dnc_review: false,
    }

    if (rowHasIssues(cleanedRow)) {
      setErrorMessage('This row still needs cleanup before approval.')
      return
    }

    await approveRow(cleanedRow)
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
              Step 02
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review and clean imported leads.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Approve clean rows into the CRM, or fix missing names, invalid
              emails and unknown company sizes first.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard label="Unapproved rows" value={rows.length} />
          <SummaryCard label="Ready to approve" value={readyCount} />
          <SummaryCard label="Need cleanup" value={issueCount} urgent={issueCount > 0} />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Cleanup queue
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Showing rows that have not yet been approved into the CRM.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <FilterButton
                active={filterMode === 'all'}
                onClick={() => setFilterMode('all')}
              >
                All
              </FilterButton>

              <FilterButton
                active={filterMode === 'ready'}
                onClick={() => setFilterMode('ready')}
              >
                Ready
              </FilterButton>

              <FilterButton
                active={filterMode === 'needs-cleanup'}
                onClick={() => setFilterMode('needs-cleanup')}
              >
                Needs cleanup
              </FilterButton>
            </div>
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
            Loading rows...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-500 shadow-sm">
            No rows match this filter.
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredRows.map((row) => {
              const hasIssues = rowHasIssues(row)
              const isSaving = savingId === row.id

              return (
                <section
                  key={row.id}
                  className={`rounded-2xl border bg-white p-5 shadow-sm ${
                    hasIssues
                      ? 'border-red-200 ring-4 ring-red-50'
                      : 'border-green-200 ring-4 ring-green-50'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-black text-stone-950">
                          {row.lead_company_name || 'Missing company'}
                        </h3>

                        {hasIssues ? (
                          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                            Needs cleanup
                          </span>
                        ) : (
                          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                            Ready
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-sm text-stone-500">
                        Raw contact: {row.contact_name_raw || 'Missing'}
                      </p>

                      {row.import_notes && (
                        <p className="mt-3 rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
                          {row.import_notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {row.needs_contact_name_cleanup && <Flag label="Name" />}
                      {row.needs_email_cleanup && <Flag label="Email" />}
                      {row.needs_size_cleanup && <Flag label="Size" />}
                      {row.needs_dnc_review && <Flag label="DNC" />}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Input
                      label="First name"
                      value={row.first_name ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'first_name', value)
                      }
                    />

                    <Input
                      label="Last name"
                      value={row.last_name ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'last_name', value)
                      }
                    />

                    <Input
                      label="Email"
                      value={row.email_address ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'email_address', value)
                      }
                    />

                    <Input
                      label="Telephone"
                      value={row.telephone ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'telephone', value)
                      }
                    />

                    <Input
                      label="Role"
                      value={row.role ?? ''}
                      onChange={(value) => updateLocalRow(row.id, 'role', value)}
                    />

                    <Input
                      label="Industry"
                      value={row.industry ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'industry', value)
                      }
                    />

                    <Input
                      label="Location"
                      value={row.location ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'location', value)
                      }
                    />

                    <Input
                      label="Business size"
                      value={row.business_size_raw ?? ''}
                      onChange={(value) =>
                        updateLocalRow(row.id, 'business_size_raw', value)
                      }
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold">
                      <input
                        type="checkbox"
                        checked={row.dnc ?? false}
                        onChange={(event) =>
                          updateLocalRow(row.id, 'dnc', event.target.checked)
                        }
                      />
                      Do not contact
                    </label>

                    <button
                      onClick={() => splitName(row)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
                    >
                      Try split name
                    </button>

                    <button
                      onClick={() => saveRow(row)}
                      disabled={isSaving}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </button>

                    <button
                      onClick={() => approveRow(row)}
                      disabled={isSaving || hasIssues}
                      className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve into CRM
                    </button>

                    {hasIssues && (
                      <button
                        onClick={() => saveAndApprove(row)}
                        disabled={isSaving}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        Save and approve
                      </button>
                    )}
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

function rowHasIssues(row: CleanupRow) {
  return Boolean(
    row.needs_contact_name_cleanup ||
      row.needs_email_cleanup ||
      row.needs_size_cleanup ||
      row.needs_dnc_review
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

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? 'bg-red-600 text-white'
          : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
      }`}
    >
      {children}
    </button>
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

function Flag({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
      {label}
    </span>
  )
}