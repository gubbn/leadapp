'use client'

import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  classifySizeBand,
  normaliseEmail,
  splitSingleName,
  validateEmailForLead,
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
  email_status: string | null
  email_deliverability: string | null
  email_validation_notes: string | null
  email_checked_at: string | null
  is_existing_duplicate?: boolean
  duplicate_reason?: string | null
}

type DuplicateImportRow = {
  import_row_id: string
  duplicate_reason: string | null
}

type SplitContact = {
  full_name: string
  first_name: string
  last_name: string
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

  const duplicateRows = useMemo(
    () => rows.filter((row) => row.is_existing_duplicate),
    [rows],
  )

  const issueCount = useMemo(() => rows.filter(rowHasIssues).length, [rows])

  const readyCount = useMemo(() => {
    return rows.filter((row) => !rowHasIssues(row) && !row.is_existing_duplicate)
      .length
  }, [rows])

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const hasIssues = rowHasIssues(row)

      if (filterMode === 'needs-cleanup') return hasIssues
      if (filterMode === 'ready') return !hasIssues && !row.is_existing_duplicate
      if (filterMode === 'duplicates') return row.is_existing_duplicate

      return true
    })
  }, [rows, filterMode])

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
      },
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
    value: string | boolean,
  ) {
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row

        return {
          ...row,
          [field]: value,
        }
      }),
    )
  }

  function getSplitFirstName(split: any) {
    return split.firstName ?? split.first_name ?? null
  }

  function getSplitLastName(split: any) {
    return split.lastName ?? split.last_name ?? null
  }

  function splitName(row: CleanupRow) {
    const split = splitSingleName(row.contact_name_raw ?? '')

    setRows((current) =>
      current.map((item) => {
        if (item.id !== row.id) return item

        return {
          ...item,
          first_name: getSplitFirstName(split),
          last_name: getSplitLastName(split),
        }
      }),
    )
  }

  function getContactPartsFromRawName(rawName: string): SplitContact[] {
    return rawName
      .split(/\s+(?:and|&)\s+|\/|\\|;|\n/gi)
      .map((name) => name.trim())
      .filter(Boolean)
      .map((fullName) => {
        const split = splitSingleName(fullName)

        return {
          full_name: fullName,
          first_name: getSplitFirstName(split) ?? '',
          last_name: getSplitLastName(split) ?? '',
        }
      })
  }

  async function splitContactRow(row: CleanupRow) {
    const contacts = getContactPartsFromRawName(row.contact_name_raw ?? '')

    if (contacts.length <= 1) {
      splitName(row)
      return
    }

    const confirmed = window.confirm(
      `Split this row into ${contacts.length} separate contact rows?`,
    )

    if (!confirmed) return

    setSavingId(row.id)
    setMessage('')
    setErrorMessage('')

    const { data, error } = await supabase.rpc('split_import_row_contacts', {
      p_row_id: row.id,
      p_contacts: contacts,
    })

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    setMessage(
      `Split into ${data} separate contact row${Number(data) === 1 ? '' : 's'}.`,
    )

    setSavingId(null)
    await loadRows()
  }

  async function validateLeadEmail(row: CleanupRow) {
    const cleanedEmail = normaliseEmail(row.email_address)

    let duplicateEmail = false

    if (cleanedEmail) {
      const { data: existingImportRow } = await supabase
        .from('lead_import_rows')
        .select('id')
        .eq('email_address', cleanedEmail)
        .neq('id', row.id)
        .maybeSingle()

      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('email_address', cleanedEmail)
        .maybeSingle()

      duplicateEmail = Boolean(existingImportRow || existingContact)
    }

    const localValidation = validateEmailForLead(cleanedEmail, {
      isDuplicate: duplicateEmail,
    })

    if (
      !cleanedEmail ||
      localValidation.email_status === 'missing' ||
      localValidation.email_status === 'invalid_format' ||
      localValidation.email_status === 'duplicate'
    ) {
      return {
        cleanedEmail,
        ...localValidation,
      }
    }

    try {
      const response = await fetch('/api/validate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: cleanedEmail }),
      })

      const result = await response.json()

      return {
        cleanedEmail,
        email_status: result.email_status || localValidation.email_status,
        email_deliverability:
          result.email_deliverability || localValidation.email_deliverability,
        email_validation_notes:
          result.email_validation_notes || localValidation.email_validation_notes,
      }
    } catch {
      return {
        cleanedEmail,
        ...localValidation,
      }
    }
  }

  async function getCleanedRow(row: CleanupRow) {
    const emailValidation = await validateLeadEmail(row)

    const sizeBand = classifySizeBand(row.business_size_raw ?? '')

    const firstName = row.first_name?.trim() || null
    const lastName = row.last_name?.trim() || null

    const needsNameCleanup = !firstName || !lastName

    const needsEmailCleanup =
      emailValidation.email_status === 'missing' ||
      emailValidation.email_status === 'invalid_format' ||
      emailValidation.email_status === 'duplicate' ||
      emailValidation.email_status === 'undeliverable' ||
      emailValidation.email_status === 'risky'

    const notes: string[] = []

    if (needsNameCleanup) {
      notes.push('Name needs checking')
    }

    if (needsEmailCleanup && emailValidation.email_validation_notes) {
      notes.push(emailValidation.email_validation_notes)
    }

    return {
      ...row,
      first_name: firstName,
      last_name: lastName,
      email_address: emailValidation.cleanedEmail,
      email_status: emailValidation.email_status,
      email_deliverability: emailValidation.email_deliverability,
      email_validation_notes: emailValidation.email_validation_notes,
      email_checked_at: new Date().toISOString(),
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

    try {
      const cleanedRow = await getCleanedRow(row)

      const updatePayload = {
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
        needs_size_cleanup: cleanedRow.needs_size_cleanup,
        needs_dnc_review: cleanedRow.needs_dnc_review,
        import_notes: cleanedRow.import_notes,
        email_status: cleanedRow.email_status,
        email_deliverability: cleanedRow.email_deliverability,
        email_validation_notes: cleanedRow.email_validation_notes,
        email_checked_at: cleanedRow.email_checked_at,
      }

      const { data, error } = await supabase
        .from('lead_import_rows')
        .update(updatePayload)
        .eq('id', row.id)
        .select('*')
        .single()

      if (error) {
        setErrorMessage(error.message)
        setSavingId(null)
        return false
      }

      if (data) {
        setRows((currentRows) =>
          currentRows.map((currentRow) =>
            currentRow.id === row.id
              ? {
                  ...currentRow,
                  ...(data as CleanupRow),
                  is_existing_duplicate: currentRow.is_existing_duplicate,
                  duplicate_reason: currentRow.duplicate_reason,
                }
              : currentRow,
          ),
        )
      }

      setMessage('Row saved and email validation updated.')
      setSavingId(null)

      if (reloadAfterSave) {
        await loadRows()
      }

      return true
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save this row.',
      )
      setSavingId(null)
      return false
    }
  }

  async function approveRow(row: CleanupRow) {
    if (row.is_existing_duplicate) {
      setErrorMessage(
        'This row already exists in the CRM. Remove the duplicate import row instead.',
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
        'This row already exists in the CRM. Remove the duplicate import row instead.',
      )
      return
    }

    const cleanedRow = await getCleanedRow(row)

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
      (row) => !rowHasIssues(row) && !row.is_existing_duplicate,
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
        } into CRM.`,
      )
    }

    if (errors.length > 0) {
      setErrorMessage(
        `Some rows could not be approved: ${errors.slice(0, 3).join(' | ')}`,
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
      } from the cleanup queue? This will not delete CRM contacts or companies.`,
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
      }.`,
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
              Step 02
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review and clean imported leads.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Approve clean rows into the CRM, split multi-contact rows, fix
              missing names and invalid emails, or remove imported rows that
              already exist in the CRM.
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
                Save and validate updates the row fields and refreshes the email
                deliverability status.
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
                    <div className="min-w-0 flex-1">
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

                        <EmailStatusBadge status={row.email_status} />
                      </div>

                      <p className="mt-1 text-sm text-stone-500">
                        Raw contact: {row.contact_name_raw || 'Missing'}
                      </p>

                      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
                        <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                          Email validation
                        </p>

                        <p className="mt-1 break-all text-sm font-semibold text-stone-800">
                          {row.email_address || 'No email address'}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <EmailStatusBadge status={row.email_status} />

                          {row.email_deliverability ? (
                            <span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-stone-600 ring-1 ring-stone-200">
                              {row.email_deliverability.replaceAll('_', ' ')}
                            </span>
                          ) : null}
                        </div>

                        {row.email_validation_notes ? (
                          <p className="mt-2 text-sm text-stone-600">
                            {row.email_validation_notes}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-stone-500">
                            No validation note yet. Save this row to run the
                            latest email check.
                          </p>
                        )}

                        {row.email_checked_at ? (
                          <p className="mt-2 text-xs text-stone-400">
                            Checked:{' '}
                            {new Date(row.email_checked_at).toLocaleString(
                              'en-GB',
                            )}
                          </p>
                        ) : null}
                      </div>

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
                      onClick={() => splitContactRow(row)}
                      disabled={isSaving || Boolean(row.is_existing_duplicate)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Split contact name
                    </button>

                    <button
                      onClick={() => saveRow(row)}
                      disabled={isSaving || Boolean(row.is_existing_duplicate)}
                      className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSaving ? 'Saving...' : 'Save and validate'}
                    </button>

                    <button
                      onClick={() => approveRow(row)}
                      disabled={
                        isSaving ||
                        hasIssues ||
                        Boolean(row.is_existing_duplicate)
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
  const hasBadEmail =
    row.email_status === 'missing' ||
    row.email_status === 'invalid_format' ||
    row.email_status === 'duplicate' ||
    row.email_status === 'undeliverable' ||
    row.email_status === 'risky'

  return Boolean(
    row.needs_contact_name_cleanup ||
      row.needs_email_cleanup ||
      row.needs_dnc_review ||
      hasBadEmail,
  )
}

function getEmailStatusBadgeClass(status: string | null) {
  if (status === 'deliverable') {
    return 'bg-green-100 text-green-800'
  }

  if (status === 'valid_format') {
    return 'bg-blue-100 text-blue-800'
  }

  if (
    status === 'risky' ||
    status === 'duplicate' ||
    status === 'unchecked'
  ) {
    return 'bg-amber-100 text-amber-800'
  }

  if (
    status === 'missing' ||
    status === 'invalid_format' ||
    status === 'undeliverable'
  ) {
    return 'bg-red-100 text-red-800'
  }

  return 'bg-stone-100 text-stone-700'
}

function EmailStatusBadge({ status }: { status: string | null }) {
  const label = status || 'unchecked'

  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-bold ${getEmailStatusBadgeClass(
        label,
      )}`}
    >
      {label.replaceAll('_', ' ')}
    </span>
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