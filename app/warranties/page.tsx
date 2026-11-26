'use client'

import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'
import { useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '@/app/components/AppHeader'
import { formatShortDate } from '@/lib/crm'
import { supabase } from '@/lib/supabaseClient'
import {
  buildWarrantyImportRows,
  checkWarrantyDuplicates,
  daysFromToday,
  detectWarrantyColumns,
  isInWarrantyWindow,
  makeUniqueHeaders,
  saveWarrantyImportRows,
  WARRANTY_FIELDS,
  WARRANTY_STATUS_LABELS,
  warrantyToday,
  type WarrantyColumnMapping,
  type WarrantyCorrections,
  type WarrantyImportRow,
  type WarrantyImportValue,
  type WarrantySourceRow,
  type WarrantyStatus,
  type WarrantyValues,
  type WarrantyWindow,
} from '@/lib/warrantyImportHelpers'
import ImportPanel from './ImportPanel'
import RenewWarrantyDialog from './RenewWarrantyDialog'
import { AddWarrantyForm } from './WarrantyForm'

type Warranty = {
  id: string
  customer_name: string
  product_name: string
  sharepoint_id: string | null
  warranty_type: string | null
  serial_number: string | null
  expiry_date: string
  owner_name: string | null
  owner_email: string | null
  notes: string | null
  action_status: WarrantyStatus
}

const EMPTY_MAPPING = Object.fromEntries(
  WARRANTY_FIELDS.map(({ key }) => [key, '']),
) as WarrantyColumnMapping

const WINDOW_OPTIONS: Array<{ value: WarrantyWindow; label: string }> = [
  { value: 'all', label: 'All dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: '30', label: 'Next 30 days' },
  { value: '60', label: 'Next 60 days' },
  { value: '90', label: 'Next 90 days' },
]

export default function WarrantiesPage() {
  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <Suspense fallback={<p className="p-8 text-center text-sm text-stone-500">Loading warranty dates...</p>}>
        <WarrantiesRoute />
      </Suspense>
    </main>
  )
}

function WarrantiesRoute() {
  const initialWindow = useSearchParams().get('window') === 'week' ? 'week' : '90'
  return <WarrantiesWorkspace key={initialWindow} initialWindow={initialWindow} />
}

function WarrantiesWorkspace({ initialWindow }: { initialWindow: WarrantyWindow }) {
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [panel, setPanel] = useState<'add' | 'import' | null>(null)
  const [warrantyMessage, setWarrantyMessage] = useState('')
  const [renewingWarranty, setRenewingWarranty] = useState<Warranty | null>(null)
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [sourceRows, setSourceRows] = useState<WarrantySourceRow[]>([])
  const [mapping, setMapping] = useState<WarrantyColumnMapping>(EMPTY_MAPPING)
  const [corrections, setCorrections] = useState<WarrantyCorrections>({})
  const [importedRows, setImportedRows] = useState<Set<number>>(() => new Set())
  const [skippedRows, setSkippedRows] = useState<Set<number>>(() => new Set())
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [readingFile, setReadingFile] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [windowFilter, setWindowFilter] = useState<WarrantyWindow>(initialWindow)
  const [statusFilter, setStatusFilter] = useState<'all' | WarrantyStatus>('all')
  const [search, setSearch] = useState('')
  const [savingStatusId, setSavingStatusId] = useState('')

  const loadWarranties = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setSetupRequired(false)

    const rows: Warranty[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('warranties')
        .select('id,customer_name,product_name,sharepoint_id,warranty_type,serial_number,expiry_date,owner_name,owner_email,notes,action_status')
        .order('expiry_date')
        .order('id')
        .range(offset, offset + pageSize - 1)

      if (error) {
        setLoadError(error.message)
        setSetupRequired(isMissingWarrantiesTable(error.code))
        setLoading(false)
        return { rows: null, error }
      }

      rows.push(...(data as Warranty[]))
      if (data.length < pageSize) break
    }

    setWarranties(rows)
    setLoading(false)
    return { rows, error: null }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadWarranties())
  }, [loadWarranties])

  const previewRows = useMemo(
    () => buildWarrantyImportRows(sourceRows, mapping, fileName, corrections),
    [corrections, fileName, mapping, sourceRows],
  )
  const pendingRows = useMemo(
    () => previewRows.filter(({ rowNumber }) => !importedRows.has(rowNumber) && !skippedRows.has(rowNumber)),
    [importedRows, previewRows, skippedRows],
  )
  const { readyRows, duplicateRows } = useMemo(
    () => checkWarrantyDuplicates(pendingRows, warranties),
    [pendingRows, warranties],
  )
  const failedRows = pendingRows.filter((row) =>
    !duplicateRows.has(row.rowNumber) && (row.issues.length || rowErrors[row.rowNumber]),
  )

  const today = warrantyToday()
  const counts = useMemo(() => {
    const count = (window: WarrantyWindow) =>
      warranties.filter((warranty) => isInWarrantyWindow(warranty.expiry_date, window, today)).length
    return {
      today: count('today'),
      week: count('week'),
      30: count('30'),
      60: count('60'),
      90: count('90'),
    }
  }, [today, warranties])

  const visibleWarranties = useMemo(() => {
    const query = search.trim().toLowerCase()
    return warranties.filter((warranty) => {
      if (!isInWarrantyWindow(warranty.expiry_date, windowFilter, today)) return false
      if (statusFilter !== 'all' && warranty.action_status !== statusFilter) {
        return false
      }
      if (!query) return true
      return [
        warranty.customer_name,
        warranty.product_name,
        warranty.serial_number,
        warranty.warranty_type,
        warranty.owner_name,
        warranty.owner_email,
      ].some((value) => value?.toLowerCase().includes(query))
    })
  }, [search, statusFilter, today, warranties, windowFilter])

  async function handleFile(file: File) {
    setReadingFile(true)
    setFileName(file.name)
    setSourceRows([])
    setColumns([])
    setMapping(EMPTY_MAPPING)
    setCorrections({})
    setImportedRows(new Set())
    setSkippedRows(new Set())
    setRowErrors({})
    setImportMessage('')
    setImportError('')

    try {
      const extension = file.name.split('.').pop()?.toLowerCase()
      const matrix =
        extension === 'csv'
          ? await parseCsv(file)
          : extension === 'xlsx'
            ? ((await readSheet(file)) as WarrantyImportValue[][])
            : null

      if (!matrix) {
        throw new Error('Choose a SharePoint CSV or .xlsx export.')
      }

      const parsed = matrixToRows(matrix)
      if (!parsed.columns.length || !parsed.rows.length) {
        throw new Error('No data rows were found in that file.')
      }
      const detectedMapping = detectWarrantyColumns(parsed.columns)
      if (!detectedMapping.expiry_date) {
        throw new Error('This export needs a Warranty End column for the expiry date.')
      }

      setColumns(parsed.columns)
      setSourceRows(parsed.rows)
      setMapping(detectedMapping)
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'The file could not be read.',
      )
    } finally {
      setReadingFile(false)
    }
  }

  function correctRow(row: WarrantyImportRow, values: WarrantyValues) {
    const changed = WARRANTY_FIELDS.filter(({ key }) => values[key] !== row.values[key])
    if (!changed.length) return
    setCorrections((current) => ({
      ...current,
      [row.rowNumber]: {
        ...current[row.rowNumber],
        ...Object.fromEntries(changed.map(({ key }) => [key, values[key]])),
      },
    }))
    setRowErrors((current) => ({ ...current, [row.rowNumber]: '' }))
  }

  async function importRows() {
    if (importing || !readyRows.length) return

    setImporting(true)
    setImportError('')
    setImportMessage('')
    const importedAt = new Date().toISOString()

    try {
      const latest = await loadWarranties()
      if (latest.error) {
        setImportError(latest.error.message)
        return
      }

      const { readyRows: candidates, duplicateRows: duplicates } = checkWarrantyDuplicates(pendingRows, latest.rows)
      const result = await saveWarrantyImportRows(candidates, async (rows) => {
        const { data, error } = await supabase.from('warranties')
          .upsert(
            rows.map((row) => ({ ...row, last_imported_at: importedAt, updated_at: importedAt })),
            { onConflict: 'source_key', ignoreDuplicates: true },
          )
          .select('source_key')
        return { insertedKeys: data?.map((row) => row.source_key) ?? [], error }
      })
      setImportedRows((current) => new Set([...current, ...result.importedRows]))
      setSkippedRows((current) => new Set([...current, ...result.duplicateRows]))
      setRowErrors((current) => ({ ...current, ...result.rowErrors }))

      if (result.error) {
        setImportError(result.error.message)
        setSetupRequired(isMissingWarrantiesTable(result.error.code))
      }

      const insertedCount = result.importedRows.size
      const skippedCount = duplicates.size + result.duplicateRows.size
      const messages = []
      if (insertedCount) messages.push(`Imported ${insertedCount} ${insertedCount === 1 ? 'warranty' : 'warranties'}.`)
      if (skippedCount) messages.push(`Skipped ${skippedCount} duplicate ${skippedCount === 1 ? 'row' : 'rows'}.`)
      setImportMessage(messages.join(' '))

      if (insertedCount || result.duplicateRows.size) {
        await loadWarranties()
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The import could not be completed.')
    } finally {
      setImporting(false)
    }
  }

  async function updateStatus(warranty: Warranty, actionStatus: WarrantyStatus) {
    if (actionStatus === 'renewed') {
      setWarrantyMessage('')
      setRenewingWarranty(warranty)
      return
    }

    setSavingStatusId(warranty.id)
    setLoadError('')
    const updatedAt = new Date().toISOString()
    const { error } = await supabase
      .from('warranties')
      .update({ action_status: actionStatus, updated_at: updatedAt })
      .eq('id', warranty.id)

    if (error) {
      setLoadError(error.message)
    } else {
      setWarranties((current) =>
        current.map((item) =>
          item.id === warranty.id
            ? { ...item, action_status: actionStatus }
            : item,
        ),
      )
    }
    setSavingStatusId('')
  }

  function completeRenewal(warranty: Warranty, expiryDate: string) {
    setWarranties((current) => current
      .map((item): Warranty => item.id === warranty.id
        ? { ...item, expiry_date: expiryDate, action_status: 'not_started' }
        : item)
      .sort((a, b) => a.expiry_date.localeCompare(b.expiry_date) || a.id.localeCompare(b.id)))
    setRenewingWarranty(null)
    setWarrantyMessage(`Warranty renewed. New expiry ${formatShortDate(expiryDate)}.`)
  }

  return (
    <>
      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-9 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
              Marketing timing
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Warranty expiry
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-stone-600">
              See who needs attention now and plan outreach up to 90 days ahead.
              Imports skip matching warranties and use Warranty End as the expiry date.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              aria-expanded={panel === 'add'}
              onClick={() => {
                setWarrantyMessage('')
                setPanel('add')
              }}
              disabled={importing || panel === 'add'}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
            >
              Add warranty
            </button>
            <button
              type="button"
              aria-expanded={panel === 'import'}
              onClick={() => setPanel(panel === 'import' ? null : 'import')}
              disabled={importing || panel === 'add'}
              className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-black text-stone-800 shadow-sm hover:bg-stone-100 disabled:opacity-60"
            >
              {panel === 'import' ? 'Close import' : 'Import SharePoint export'}
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {setupRequired ? <SetupNotice /> : null}

        {panel === 'add' ? (
          <AddWarrantyForm
            onCancel={() => setPanel(null)}
            onSaved={() => {
              setWarrantyMessage('Warranty added.')
              setPanel(null)
              void loadWarranties()
            }}
          />
        ) : null}
        {renewingWarranty ? (
          <RenewWarrantyDialog key={renewingWarranty.id} warranty={renewingWarranty}
            onCancel={() => setRenewingWarranty(null)}
            onSaved={(expiryDate) => completeRenewal(renewingWarranty, expiryDate)} />
        ) : null}
        {warrantyMessage ? (
          <p role="status" className="mb-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {warrantyMessage}
          </p>
        ) : null}

        {panel === 'import' ? (
          <ImportPanel
            columns={columns}
            duplicateRows={new Set([...duplicateRows, ...skippedRows])}
            failedRows={failedRows}
            fileName={fileName}
            importedRows={importedRows}
            importing={importing}
            importError={importError}
            importMessage={importMessage}
            mapping={mapping}
            previewRows={previewRows}
            readingFile={readingFile}
            rowErrors={rowErrors}
            readyCount={readyRows.filter(({ rowNumber }) => !rowErrors[rowNumber]).length}
            validCount={readyRows.length}
            onCorrect={correctRow}
            onFile={(file) => void handleFile(file)}
            onImport={() => void importRows()}
            onMappingChange={(key, column) => {
              if (key !== 'expiry_date') setMapping((current) => ({ ...current, [key]: column }))
            }}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <ExpiryCard
            label="Today"
            value={counts.today}
            active={windowFilter === 'today'}
            urgent={counts.today > 0}
            onClick={() => setWindowFilter('today')}
          />
          <ExpiryCard
            label="This week"
            value={counts.week}
            active={windowFilter === 'week'}
            onClick={() => setWindowFilter('week')}
          />
          <ExpiryCard
            label="Next 30 days"
            value={counts[30]}
            active={windowFilter === '30'}
            onClick={() => setWindowFilter('30')}
          />
          <ExpiryCard
            label="Next 60 days"
            value={counts[60]}
            active={windowFilter === '60'}
            onClick={() => setWindowFilter('60')}
          />
          <ExpiryCard
            label="Next 90 days"
            value={counts[90]}
            active={windowFilter === '90'}
            onClick={() => setWindowFilter('90')}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-200 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {WINDOW_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setWindowFilter(option.value)}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${
                    windowFilter === option.value
                      ? 'bg-stone-950 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, product or serial"
                className="form-input sm:w-72"
              />
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as 'all' | WarrantyStatus)
                }
                className="form-input sm:w-44"
              >
                <option value="all">All actions</option>
                {Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loadError && !setupRequired ? (
            <p className="m-4 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              {loadError}
            </p>
          ) : null}

          {loading ? (
            <div className="p-10 text-center text-sm font-semibold text-stone-500">
              Loading warranty dates...
            </div>
          ) : visibleWarranties.length === 0 ? (
            <EmptyState hasWarranties={warranties.length > 0} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-5 py-3">Expiry</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Warranty / product</th>
                    <th className="px-5 py-3">Contact</th>
                    <th className="px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleWarranties.map((warranty) => (
                    <WarrantyTableRow
                      key={warranty.id}
                      warranty={warranty}
                      saving={savingStatusId === warranty.id}
                      onStatusChange={(status) =>
                        void updateStatus(warranty, status)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && visibleWarranties.length ? (
            <p className="border-t border-stone-200 px-5 py-3 text-xs font-semibold text-stone-500">
              Showing {visibleWarranties.length} of {warranties.length} warranties
            </p>
          ) : null}
        </div>
      </section>
    </>
  )
}

function WarrantyTableRow({
  warranty,
  saving,
  onStatusChange,
}: {
  warranty: Warranty
  saving: boolean
  onStatusChange: (status: WarrantyStatus) => void
}) {
  const days = daysFromToday(warranty.expiry_date)
  const timing = expiryTiming(days)

  return (
    <tr className="border-t border-stone-100 align-top hover:bg-stone-50/70">
      <td className="whitespace-nowrap px-5 py-4">
        <p className="font-black text-stone-900">{formatShortDate(warranty.expiry_date)}</p>
        <span className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-black ${timing.style}`}>
          {timing.label}
        </span>
      </td>
      <td className="px-5 py-4">
        <p className="font-black text-stone-900">{warranty.customer_name}</p>
        {warranty.owner_name ? (
          <p className="mt-1 text-xs text-stone-500">Owner: {warranty.owner_name}</p>
        ) : null}
      </td>
      <td className="px-5 py-4">
        <p className="font-bold text-stone-800">{warranty.product_name}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          {warranty.warranty_type ? <span>{warranty.warranty_type}</span> : null}
          {warranty.serial_number ? <span>Serial: {warranty.serial_number}</span> : null}
        </div>
        {warranty.notes ? (
          <p className="mt-2 max-w-md text-xs leading-5 text-stone-500">{warranty.notes}</p>
        ) : null}
      </td>
      <td className="px-5 py-4">
        {warranty.owner_email ? (
          <a
            href={`mailto:${warranty.owner_email}`}
            className="font-bold text-red-600 hover:text-red-700"
          >
            {warranty.owner_email}
          </a>
        ) : (
          <span className="text-stone-400">No email</span>
        )}
      </td>
      <td className="px-5 py-4">
        <select
          value={warranty.action_status}
          disabled={saving}
          onChange={(event) => onStatusChange(event.target.value as WarrantyStatus)}
          aria-label={`Action status for ${warranty.customer_name}`}
          className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700 outline-none focus:border-red-400 disabled:opacity-50"
        >
          {Object.entries(WARRANTY_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {warranty.action_status === 'renewed' ? (
          <button type="button" onClick={() => onStatusChange('renewed')} disabled={saving}
            className="mt-2 block text-xs font-bold text-red-600 hover:underline disabled:opacity-50">Set new expiry</button>
        ) : null}
      </td>
    </tr>
  )
}

function ExpiryCard({
  label,
  value,
  active,
  urgent = false,
  onClick,
}: {
  label: string
  value: number
  active: boolean
  urgent?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        active
          ? 'border-red-300 ring-4 ring-red-50'
          : 'border-stone-200'
      }`}
    >
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p className={`mt-3 text-4xl font-black tracking-tight ${urgent ? 'text-red-600' : 'text-stone-950'}`}>
        {value}
      </p>
    </button>
  )
}

function SetupNotice() {
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <p className="font-black">One database setup step is required</p>
      <p className="mt-1 text-sm leading-6 text-amber-800">
        Run <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs font-bold">docs/warranties.sql</code>{' '}
        in the Supabase SQL editor, then refresh this page.
      </p>
    </div>
  )
}

function EmptyState({ hasWarranties }: { hasWarranties: boolean }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-xl font-black text-stone-900">
        {hasWarranties ? 'No warranties match these filters.' : 'No warranties yet.'}
      </p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
        {hasWarranties
          ? 'Try a wider date range, another action status, or clear the search.'
          : 'Add a warranty or import a SharePoint export to start tracking expiry dates.'}
      </p>
    </div>
  )
}

function matrixToRows(matrix: WarrantyImportValue[][]) {
  const firstRowIndex = matrix.findIndex((row) =>
    row.some((value) => value !== null && String(value).trim()),
  )
  if (firstRowIndex < 0) return { columns: [], rows: [] }

  const columns = makeUniqueHeaders(matrix[firstRowIndex])
  const rows = matrix
    .slice(firstRowIndex + 1)
    .map((row, index) => ({ row, rowNumber: firstRowIndex + index + 2 }))
    .filter(({ row }) => row.some((value) => value !== null && String(value).trim()))
    .map(({ row, rowNumber }) => ({
      rowNumber,
      cells: Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
    }))

  return { columns, rows }
}

function parseCsv(file: File) {
  return new Promise<WarrantyImportValue[][]>((resolve, reject) => {
    Papa.parse<WarrantyImportValue[]>(file, {
      complete: (result) => resolve(result.data),
      error: (error) => reject(error),
    })
  })
}

function expiryTiming(days: number) {
  if (days < 0) {
    const overdue = Math.abs(days)
    return {
      label: `${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`,
      style: 'bg-stone-200 text-stone-700',
    }
  }
  if (days === 0) return { label: 'Today', style: 'bg-red-100 text-red-700' }
  if (days <= 7) return { label: `In ${days} days`, style: 'bg-amber-100 text-amber-800' }
  if (days <= 30) return { label: `In ${days} days`, style: 'bg-sky-100 text-sky-800' }
  return { label: `In ${days} days`, style: 'bg-stone-100 text-stone-600' }
}

function isMissingWarrantiesTable(code: string) {
  return code === '42P01' || code === 'PGRST205'
}
