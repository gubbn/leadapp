'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  classifySizeBand,
  isValidEmail,
  splitSingleName,
} from '@/lib/marketingImportHelpers'
import LogoutButton from '@/app/components/LogoutButton'

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
  is_existing_duplicate?: boolean
  duplicate_reason?: string | null
}

type DuplicateImportRow = {
  import_row_id: string
  duplicate_reason: string | null
}

type FilterMode = 'all' | 'needs-cleanup' | 'ready' | 'duplicates'

export default function CleanupPage() {
  const [rows, setRows] = useState<CleanupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkApproving, setBulkApproving] = useState(false)
  const [removingDuplicates, setRemovingDuplicates] = useState(false)

  useEffect(() => {
    loadRows()
  }, [])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const hasIssues = rowHasIssues(row)

      if (filterMode === 'needs-cleanup') return hasIssues
      if (filterMode === 'ready') return !hasIssues && !row.is_existing_duplicate
      if (filterMode === 'duplicates') return row.is_existing_duplicate

      return true
    })
  }, [rows, filterMode])

  const duplicateRows = useMemo(
    () => rows.filter((row) => row.is_existing_duplicate),
    [rows]
  )

  const issueCount = useMemo(() => rows.filter(rowHasIssues).length, [rows])

  const readyCount = useMemo(() => {
    return rows.filter((row) => !rowHasIssues(row) && !row.is_existing_duplicate)
      .length
  }, [rows])

  async function loadRows() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')

    const [rowsResult, duplicatesResult] = await Promise.all([
      supabase
        .from('lead_import_rows')
        .select('*')
        .eq('approved_to_crm', false)
        .order('imported_at', { ascending: false }),

      supabase.from('import_rows_existing_crm_duplicates').select('*'),
    ])

    if (rowsResult.error) {
      setErrorMessage(rowsResult.error.message)
      setLoading(false)
      return
    }

    if (duplicatesResult.error) {
      setErrorMessage(duplicatesResult.error.message)
      setLoading(false)
      return
    }

    const duplicateMap = new Map<string, DuplicateImportRow>()

    ;((duplicatesResult.data ?? []) as DuplicateImportRow[]).forEach(
      (duplicate) => {
        duplicateMap.set(duplicate.import_row_id, duplicate)
      }
    )

    const cleanedRows = ((rowsResult.data ?? []) as CleanupRow[]).map((row) => {
      const duplicate = duplicateMap.get(row.id)

      return {
        ...row,
        is_existing_duplicate: Boolean(duplicate),
        duplicate_reason: duplicate?.duplicate_reason ?? null,
      }
    })

    setRows(cleanedRows)
    setLoading(false)
  }

  function updateLocalRow(
    id: string,
    field: keyof CleanupRow,
    value: string | boolean
  ) {
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

  function getCleanedRow(row: CleanupRow) {
    const sizeBand = classifySizeBand(row.business_size_raw ?? '')
    const needsNameCleanup = !row.first_name?.trim() || !row.last_name?.trim()
    const needsEmailCleanup = !isValidEmail(row.email_address ?? '')

    const notes: string[] = []

    if (needsNameCleanup) notes.push('Name needs checking')
    if (needsEmailCleanup) notes.push('Missing or invalid email')

    return {
      ...row,
      size_band: sizeBand,
      needs_contact_name_cleanup: needsNameCleanup,
      needs_email_cleanup: needsEmailCleanup,
      needs_size_cleanup: false,
      needs_dnc_review: false,
      import_notes: notes.join(', '),
    }
  }

  async function saveRow(row: CleanupRow, reloadAfterSave = true) {
    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const cleanedRow = getCleanedRow(row)

    const { error } = await supabase
      .from('lead_import_rows')
      .update({
        first_name: cleanedRow.first_name,
        last_name: cleanedRow.last_name,
        role: cleanedRow.role,
        email_address: cleanedRow.email_address,
        telephone: cleanedRow.telephone,
        industry: cleanedRow.industry,
        domain: cleanedRow.domain,
        location: cleanedRow.location,
        business_size_raw: cleanedRow.business_size_raw,
        size_band: cleanedRow.size_band,
        dnc: cleanedRow.dnc ?? false,
        outcome: cleanedRow.outcome,
        needs_contact_name_cleanup: cleanedRow.needs_contact_name_cleanup,
        needs_email_cleanup: cleanedRow.needs_email_cleanup,
        needs_size_cleanup: false,
        needs_dnc_review: false,
        import_notes: cleanedRow.import_notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return false
    }

    setMessage('Row saved.')
    setSavingId(null)

    if (reloadAfterSave) {
      await loadRows()
    }

    return true
  }

  async function approveRow(row: CleanupRow) {
    if (row.is_existing_duplicate) {
      setErrorMessage(
        'This row already exists in the CRM. Remove the duplicate import row instead.'
      )
      return false
    }

    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const { error } = await supabase.rpc('approve_import_row', {
      p_row_id: row.id,
    })

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return false
    }

    setMessage('Row approved into CRM.')
    setSavingId(null)
    await loadRows()

    return true
  }

  async function saveAndApprove(row: CleanupRow) {
    if (row.is_existing_duplicate) {
      setErrorMessage(
        'This row already exists in the CRM. Remove the duplicate import row instead.'
      )
      return
    }

    const cleanedRow = getCleanedRow(row)

    if (rowHasIssues(cleanedRow)) {
      setErrorMessage('This row still needs cleanup before approval.')
      return
    }

    const saved = await saveRow(cleanedRow, false)

    if (!saved) return

    await approveRow(cleanedRow)
  }

  async function approveAllReadyRows() {
    const readyRows = rows.filter(
      (row) => !rowHasIssues(row) && !row.is_existing_duplicate
    )

    if (readyRows.length === 0) {
      setErrorMessage('There are no ready non-duplicate rows to approve.')
      return
    }

    setBulkApproving(true)
    setMessage('')
    setErrorMessage('')

    let approvedCount = 0
    const errors: string[] = []

    for (const row of readyRows) {
      const { error } = await supabase.rpc('approve_import_row', {
        p_row_id: row.id,
      })

      if (error) {
        errors.push(`${row.lead_company_name || row.id}: ${error.message}`)
      } else {
        approvedCount += 1
      }
    }

    setBulkApproving(false)

    if (approvedCount > 0) {
      setMessage(
        `Approved ${approvedCount} ready record${
          approvedCount === 1 ? '' : 's'
        } into CRM.`
      )
    }

    if (errors.length > 0) {
      setErrorMessage(
        `Some rows could not be approved: ${errors.slice(0, 3).join(' | ')}`
      )
    }

    await loadRows()
  }

  async function removeDuplicateRow(row: CleanupRow) {
    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const { error } = await supabase
      .from('lead_import_rows')
      .delete()
      .eq('id', row.id)

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage('Duplicate import row removed.')
    setSavingId(null)
    await loadRows()
  }

  async function removeAllDuplicateRows() {
    if (duplicateRows.length === 0) {
      setErrorMessage('There are no duplicate import rows to remove.')
      return
    }

    const confirmed = window.confirm(
      `Remove ${duplicateRows.length} duplicate imported row${
        duplicateRows.length === 1 ? '' : 's'
      } from the cleanup queue? This will not delete CRM contacts or companies.`
    )

    if (!confirmed) return

    setRemovingDuplicates(true)
    setMessage('')
    setErrorMessage('')

    const duplicateIds = duplicateRows.map((row) => row.id)

    const { error } = await supabase
      .from('lead_import_rows')
      .delete()
      .in('id', duplicateIds)

    if (error) {
      setErrorMessage(error.message)
      setRemovingDuplicates(false)
      return
    }

    setMessage(
      `Removed ${duplicateRows.length} duplicate imported row${
        duplicateRows.length === 1 ? '' : 's'
      }.`
    )

    setRemovingDuplicates(false)
    await loadRows()
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
            <NavLink href="/companies">Companies</NavLink>
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
              Step 02
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review and clean imported leads.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Approve clean rows into the CRM, fix missing names and invalid
              emails, or remove imported rows that already exist in the CRM.
              Business size is optional and can be updated later.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Unapproved rows" value={rows.length} />
          <SummaryCard label="Ready to approve" value={readyCount} />
          <SummaryCard
            label="Need cleanup"
            value={issueCount}
            urgent={issueCount > 0}
          />
          <SummaryCard
            label="Duplicates"
            value={duplicateRows.length}
            urgent={duplicateRows.length > 0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Cleanup queue
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Duplicates are imported rows that already match an existing CRM
                company and contact.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={approveAllReadyRows}
                disabled={bulkApproving || readyCount === 0}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {bulkApproving
                  ? 'Approving ready rows...'
                  : `Approve all ready (${readyCount})`}
              </button>

              <button
                onClick={removeAllDuplicateRows}
                disabled={removingDuplicates || duplicateRows.length === 0}
                className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingDuplicates
                  ? 'Removing duplicates...'
                  : `Remove all duplicates (${duplicateRows.length})`}
              </button>

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

              <FilterButton
                active={filterMode === 'duplicates'}
                onClick={() => setFilterMode('duplicates')}
              >
                Duplicates
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
                    row.is_existing_duplicate
                      ? 'border-amber-300 ring-4 ring-amber-50'
                      : hasIssues
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

                        {row.is_existing_duplicate ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">
                            Duplicate
                          </span>
                        ) : hasIssues ? (
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

                      {row.is_existing_duplicate && (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                          This imported row already appears to exist in the CRM
                          for the same business and contact. Remove this import
                          row instead of approving it again.
                        </p>
                      )}

                      {row.import_notes && !row.is_existing_duplicate && (
                        <p className="mt-3 rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
                          {row.import_notes}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {row.is_existing_duplicate && <Flag label="Duplicate" />}
                      {row.needs_contact_name_cleanup && <Flag label="Name" />}
                      {row.needs_email_cleanup && <Flag label="Email" />}
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
                      onChange={(value) =>
                        updateLocalRow(row.id, 'role', value)
                      }
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
                      disabled={Boolean(row.is_existing_duplicate)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Try split name
                    </button>

                    <button
                      onClick={() => saveRow(row)}
                      disabled={isSaving || Boolean(row.is_existing_duplicate)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSaving ? 'Saving...' : 'Save changes'}
                    </button>

                    <button
                      onClick={() => approveRow(row)}
                      disabled={
                        isSaving || hasIssues || Boolean(row.is_existing_duplicate)
                      }
                      className="rounded-xl bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve into CRM
                    </button>

                    {hasIssues && !row.is_existing_duplicate && (
                      <button
                        onClick={() => saveAndApprove(row)}
                        disabled={isSaving}
                        className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                      >
                        Save and approve
                      </button>
                    )}

                    {row.is_existing_duplicate && (
                      <button
                        onClick={() => removeDuplicateRow(row)}
                        disabled={isSaving}
                        className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Removing...' : 'Remove duplicate'}
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
      row.needs_dnc_review
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

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
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