'use client'

import Papa from 'papaparse'
import { readSheet } from 'read-excel-file/browser'
import { useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'
import {
  buildWarrantyImportRows,
  daysFromToday,
  dedupeWarrantyRows,
  detectWarrantyColumns,
  isInWarrantyWindow,
  makeUniqueHeaders,
  WARRANTY_FIELDS,
  type WarrantyColumnMapping,
  type WarrantyImportValue,
  type WarrantySourceRow,
  type WarrantyWindow,
} from '@/lib/warrantyImportHelpers'

type WarrantyStatus = 'not_started' | 'contacted' | 'renewed' | 'not_renewing'

type Warranty = {
  id: string
  customer_name: string
  product_name: string
  warranty_type: string | null
  serial_number: string | null
  expiry_date: string
  owner_name: string | null
  owner_email: string | null
  notes: string | null
  action_status: WarrantyStatus
  source_file: string | null
  last_imported_at: string
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

const STATUS_LABELS: Record<WarrantyStatus, string> = {
  not_started: 'Not started',
  contacted: 'Contacted',
  renewed: 'Renewed',
  not_renewing: 'Not renewing',
}

export default function WarrantiesPage() {
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [fileName, setFileName] = useState('')
  const [columns, setColumns] = useState<string[]>([])
  const [sourceRows, setSourceRows] = useState<WarrantySourceRow[]>([])
  const [mapping, setMapping] = useState<WarrantyColumnMapping>(EMPTY_MAPPING)
  const [readingFile, setReadingFile] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState('')
  const [importError, setImportError] = useState('')
  const [windowFilter, setWindowFilter] = useState<WarrantyWindow>('90')
  const [statusFilter, setStatusFilter] = useState<'all' | WarrantyStatus>('all')
  const [search, setSearch] = useState('')
  const [savingStatusId, setSavingStatusId] = useState('')

  const loadWarranties = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    setSetupRequired(false)

    const { data, error } = await supabase
      .from('warranties')
      .select(
        'id,customer_name,product_name,warranty_type,serial_number,expiry_date,owner_name,owner_email,notes,action_status,source_file,last_imported_at',
      )
      .order('expiry_date', { ascending: true })

    if (error) {
      setLoadError(error.message)
      setSetupRequired(
        error.code === '42P01' ||
          error.message.toLowerCase().includes('warranties'),
      )
    } else {
      setWarranties((data ?? []) as Warranty[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void loadWarranties())
  }, [loadWarranties])

  const previewRows = useMemo(
    () => buildWarrantyImportRows(sourceRows, mapping, fileName),
    [fileName, mapping, sourceRows],
  )
  const validRows = useMemo(
    () => dedupeWarrantyRows(previewRows.filter((row) => row.valid)),
    [previewRows],
  )
  const invalidCount = previewRows.filter((row) => !row.valid).length
  const duplicateCount =
    previewRows.filter((row) => row.valid).length - validRows.length
  const requiredMappingComplete = WARRANTY_FIELDS.filter(
    (field) => field.required,
  ).every((field) => mapping[field.key])

  const counts = useMemo(() => {
    const count = (window: WarrantyWindow) =>
      warranties.filter((warranty) =>
        isInWarrantyWindow(warranty.expiry_date, window),
      ).length
    return {
      today: count('today'),
      week: count('week'),
      30: count('30'),
      60: count('60'),
      90: count('90'),
    }
  }, [warranties])

  const visibleWarranties = useMemo(() => {
    const query = search.trim().toLowerCase()
    return warranties.filter((warranty) => {
      if (!isInWarrantyWindow(warranty.expiry_date, windowFilter)) return false
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
  }, [search, statusFilter, warranties, windowFilter])

  async function handleFile(file: File) {
    setReadingFile(true)
    setFileName(file.name)
    setSourceRows([])
    setColumns([])
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

      setColumns(parsed.columns)
      setSourceRows(parsed.rows)
      setMapping(detectWarrantyColumns(parsed.columns))
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'The file could not be read.',
      )
    } finally {
      setReadingFile(false)
    }
  }

  async function importRows() {
    if (!requiredMappingComplete) {
      setImportError('Map the three required columns before importing.')
      return
    }
    if (!validRows.length) {
      setImportError('There are no valid rows to import.')
      return
    }

    setImporting(true)
    setImportError('')
    setImportMessage('')
    const importedAt = new Date().toISOString()

    for (let index = 0; index < validRows.length; index += 500) {
      const chunk = validRows.slice(index, index + 500).map((row) => ({
        source_key: row.source_key,
        sharepoint_id: row.sharepoint_id,
        customer_name: row.customer_name,
        product_name: row.product_name,
        warranty_type: row.warranty_type,
        serial_number: row.serial_number,
        expiry_date: row.expiry_date,
        owner_name: row.owner_name,
        owner_email: row.owner_email,
        notes: row.notes,
        source_file: row.source_file,
        last_imported_at: importedAt,
        updated_at: importedAt,
      }))

      const { error } = await supabase
        .from('warranties')
        .upsert(chunk, { onConflict: 'source_key' })

      if (error) {
        setImportError(error.message)
        setSetupRequired(
          error.code === '42P01' ||
            error.message.toLowerCase().includes('warranties'),
        )
        setImporting(false)
        return
      }
    }

    const skipped = invalidCount
      ? ` ${invalidCount} invalid ${invalidCount === 1 ? 'row was' : 'rows were'} skipped.`
      : ''
    const duplicates = duplicateCount
      ? ` ${duplicateCount} duplicate ${duplicateCount === 1 ? 'row was' : 'rows were'} merged.`
      : ''
    setImportMessage(
      `Imported or updated ${validRows.length} warranties.${skipped}${duplicates}`,
    )
    setImporting(false)
    await loadWarranties()
  }

  async function updateStatus(warranty: Warranty, actionStatus: WarrantyStatus) {
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

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

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
              Repeat imports update matching SharePoint items.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setImportOpen((open) => !open)}
            className="shrink-0 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-red-700"
          >
            {importOpen ? 'Close import' : 'Import SharePoint export'}
          </button>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {setupRequired ? <SetupNotice /> : null}

        {importOpen ? (
          <ImportPanel
            columns={columns}
            duplicateCount={duplicateCount}
            fileName={fileName}
            importing={importing}
            importError={importError}
            importMessage={importMessage}
            invalidCount={invalidCount}
            mapping={mapping}
            previewRows={previewRows}
            readingFile={readingFile}
            requiredMappingComplete={requiredMappingComplete}
            sourceRowCount={sourceRows.length}
            validCount={validRows.length}
            onFile={(file) => void handleFile(file)}
            onImport={() => void importRows()}
            onMappingChange={(key, column) =>
              setMapping((current) => ({ ...current, [key]: column }))
            }
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
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
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
            <EmptyState
              hasWarranties={warranties.length > 0}
              onImport={() => setImportOpen(true)}
            />
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
    </main>
  )
}

function ImportPanel({
  columns,
  duplicateCount,
  fileName,
  importing,
  importError,
  importMessage,
  invalidCount,
  mapping,
  previewRows,
  readingFile,
  requiredMappingComplete,
  sourceRowCount,
  validCount,
  onFile,
  onImport,
  onMappingChange,
}: {
  columns: string[]
  duplicateCount: number
  fileName: string
  importing: boolean
  importError: string
  importMessage: string
  invalidCount: number
  mapping: WarrantyColumnMapping
  previewRows: ReturnType<typeof buildWarrantyImportRows>
  readingFile: boolean
  requiredMappingComplete: boolean
  sourceRowCount: number
  validCount: number
  onFile: (file: File) => void
  onImport: () => void
  onMappingChange: (key: keyof WarrantyColumnMapping, column: string) => void
}) {
  return (
    <div className="mb-8 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm ring-4 ring-red-50">
      <div className="grid gap-0 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="border-b border-stone-200 p-6 lg:border-b-0 lg:border-r">
          <p className="text-xs font-black uppercase tracking-wide text-red-600">
            Step 1
          </p>
          <h2 className="mt-2 text-xl font-black text-stone-950">
            Choose your export
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            In SharePoint, use Export to CSV or Export to Excel, then upload the
            downloaded file here.
          </p>
          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center transition hover:border-red-300 hover:bg-red-50">
            <span className="text-sm font-black text-stone-800">
              {readingFile ? 'Reading file...' : 'Choose CSV or Excel file'}
            </span>
            <span className="mt-1 text-xs text-stone-500">.csv or .xlsx</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={readingFile}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onFile(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
          {fileName ? (
            <p className="mt-3 break-all rounded-xl bg-stone-100 p-3 text-xs font-bold text-stone-700">
              {fileName} · {sourceRowCount} rows
            </p>
          ) : null}
          {sourceRowCount ? (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <ImportStat label="Ready" value={validCount} />
              <ImportStat label="Invalid" value={invalidCount} warn />
              <ImportStat label="Duplicates" value={duplicateCount} />
            </div>
          ) : null}
        </div>

        <div className="p-6">
          <p className="text-xs font-black uppercase tracking-wide text-red-600">
            Step 2
          </p>
          <h2 className="mt-2 text-xl font-black text-stone-950">
            Confirm column mapping
          </h2>
          <p className="mt-2 text-sm text-stone-600">
            Required fields are marked with an asterisk. We detect common
            SharePoint headings automatically.
          </p>

          {columns.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WARRANTY_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-1.5 block text-xs font-black text-stone-600">
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                  </span>
                  <select
                    value={mapping[field.key]}
                    onChange={(event) =>
                      onMappingChange(field.key, event.target.value)
                    }
                    className="form-input"
                  >
                    <option value="">Not mapped</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-500">
              Upload an export to map its columns.
            </div>
          )}

          {previewRows.length ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-stone-50 uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 5).map((row, index) => (
                    <tr key={`${row.source_key}-${index}`} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-bold text-stone-800">
                        {row.customer_name || '—'}
                      </td>
                      <td className="px-3 py-2">{row.product_name || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {row.expiry_date ? formatDate(row.expiry_date) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.valid ? (
                          <span className="font-black text-emerald-700">Ready</span>
                        ) : (
                          <span className="font-black text-red-600">
                            {row.issues.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {importError ? (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {importError}
            </p>
          ) : null}
          {importMessage ? (
            <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              {importMessage}
            </p>
          ) : null}

          {columns.length ? (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-stone-500">
                Invalid rows are skipped. Repeat imports update existing matches.
              </p>
              <button
                type="button"
                onClick={onImport}
                disabled={importing || !requiredMappingComplete || !validCount}
                className="shrink-0 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {importing ? 'Importing...' : `Import ${validCount} warranties`}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
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
        <p className="font-black text-stone-900">{formatDate(warranty.expiry_date)}</p>
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
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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

function ImportStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${warn && value ? 'bg-red-50' : 'bg-stone-100'}`}>
      <p className={`text-xl font-black ${warn && value ? 'text-red-600' : 'text-stone-900'}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
        {label}
      </p>
    </div>
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

function EmptyState({ hasWarranties, onImport }: { hasWarranties: boolean; onImport: () => void }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-xl font-black text-stone-900">
        {hasWarranties ? 'No warranties match these filters.' : 'No warranties imported yet.'}
      </p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
        {hasWarranties
          ? 'Try a wider date range, another action status, or clear the search.'
          : 'Export the SharePoint list as CSV or Excel to create the first expiry schedule.'}
      </p>
      {!hasWarranties ? (
        <button
          type="button"
          onClick={onImport}
          className="mt-5 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700"
        >
          Import SharePoint export
        </button>
      ) : null}
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
    .filter((row) => row.some((value) => value !== null && String(value).trim()))
    .map((row) =>
      Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
    ) as WarrantySourceRow[]

  return { columns, rows }
}

function parseCsv(file: File) {
  return new Promise<WarrantyImportValue[][]>((resolve, reject) => {
    Papa.parse<WarrantyImportValue[]>(file, {
      skipEmptyLines: 'greedy',
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
