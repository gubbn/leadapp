import { useState, type FormEvent } from 'react'
import { formatShortDate } from '@/lib/crm'
import { validateWarrantyValues, WARRANTY_FIELDS, type WarrantyColumnMapping, type WarrantyImportRow, type WarrantyValues } from '@/lib/warrantyImportHelpers'
import { readWarrantyForm, WarrantyFields } from './WarrantyForm'

export default function ImportPanel({
  columns,
  duplicateCount,
  failedRows,
  fileName,
  importedRows,
  importing,
  importError,
  importMessage,
  mapping,
  previewRows,
  readingFile,
  rowErrors,
  readyCount,
  validCount,
  onCorrect,
  onFile,
  onImport,
  onMappingChange,
}: {
  columns: string[]
  duplicateCount: number
  failedRows: WarrantyImportRow[]
  fileName: string
  importedRows: Set<number>
  importing: boolean
  importError: string
  importMessage: string
  mapping: WarrantyColumnMapping
  previewRows: WarrantyImportRow[]
  readingFile: boolean
  rowErrors: Record<number, string>
  readyCount: number
  validCount: number
  onCorrect: (row: WarrantyImportRow, values: WarrantyValues) => void
  onFile: (file: File) => void
  onImport: () => void
  onMappingChange: (key: keyof WarrantyColumnMapping, column: string) => void
}) {
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const blocked = importing || readingFile || editingRow !== null
  const importLabel = validCount > readyCount
    ? `Retry import (${validCount})`
    : `Import ${validCount} ${validCount === 1 ? 'warranty' : 'warranties'}`

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm ring-4 ring-red-50">
      <div className="grid gap-0 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="border-b border-stone-200 p-6 lg:border-b-0 lg:border-r">
          <h2 className="text-xl font-black text-stone-950">Import SharePoint export</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Upload a CSV or Excel export from SharePoint.
          </p>
          <label className="mt-5 flex flex-col gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-5 py-5 text-sm font-black text-stone-800">
            {readingFile ? 'Reading file...' : 'Choose CSV or Excel file'}
            <input
              type="file"
              accept=".csv,.xlsx"
              disabled={blocked}
              className="w-full text-xs font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-stone-200 file:px-3 file:py-2 file:font-bold disabled:opacity-50"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) onFile(file)
                event.currentTarget.value = ''
              }}
            />
          </label>
          {fileName ? (
            <p className="mt-3 break-all text-xs font-bold text-stone-700">
              {fileName} · {previewRows.length} rows
            </p>
          ) : null}
          {previewRows.length ? (
            <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <ImportStat label="Ready" value={readyCount} />
              <ImportStat label="Needs review" value={failedRows.length} warn />
              <ImportStat label="Duplicates" value={duplicateCount} />
              <ImportStat label="Processed" value={importedRows.size} />
            </dl>
          ) : null}
        </div>

        <div className="min-w-0 p-6">
          <h3 className="text-xl font-black text-stone-950">Confirm column mapping</h3>
          {columns.length ? (
            <fieldset disabled={blocked} className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {WARRANTY_FIELDS.map((field) => (
                <label key={field.key}>
                  <span className="mb-1.5 block text-xs font-black text-stone-600">
                    {field.label}{field.required ? ' *' : ''}
                  </span>
                  <select value={mapping[field.key]} onChange={(event) => onMappingChange(field.key, event.target.value)} className="form-input">
                    <option value="">Not mapped</option>
                    {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="mt-4 text-sm text-stone-500">Upload an export to map its columns.</p>
          )}

          {previewRows.length ? (
            <div className="mt-5 overflow-x-auto rounded-xl border border-stone-200">
              <table className="min-w-full text-left text-xs">
                <caption className="sr-only">First five import rows</caption>
                <thead className="bg-stone-50 uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Expiry</th>
                    <th className="px-3 py-2">Check</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 5).map(({ rowNumber, data, issues }) => {
                    const processed = importedRows.has(rowNumber)
                    const needsReview = !processed && (issues.length > 0 || rowErrors[rowNumber])
                    return (
                      <tr key={rowNumber} className="border-t border-stone-100">
                        <td className="px-3 py-2">{rowNumber}</td>
                        <td className="px-3 py-2 font-bold text-stone-800">{data.customer_name || '—'}</td>
                        <td className="px-3 py-2">{data.product_name || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2">{data.expiry_date ? formatShortDate(data.expiry_date) : '—'}</td>
                        <td className={`whitespace-nowrap px-3 py-2 font-black ${needsReview ? 'text-red-600' : 'text-emerald-700'}`}>
                          {processed ? 'Processed' : needsReview ? 'Needs review' : 'Ready'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {importError ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{importError}</p> : null}
          {importMessage ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{importMessage}</p> : null}

          {previewRows.length ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              {failedRows.length ? <p className="text-xs text-stone-600">Review and correct the flagged rows below.</p> : null}
              <button
                type="button"
                onClick={onImport}
                disabled={blocked || !validCount}
                className="ml-auto rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-40"
              >
                {importing ? 'Importing...' : importLabel}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {failedRows.length ? (
        <div className="border-t border-stone-200 px-6 py-5">
          <h3 className="text-lg font-black text-stone-950">Rows that need review</h3>
          <ul className="mt-3 divide-y divide-stone-200">
            {failedRows.map((row) => (
              <li key={row.rowNumber} className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 break-words">
                    <p className="text-sm font-black text-stone-800">
                      Row {row.rowNumber}{row.data.customer_name ? ` · ${row.data.customer_name}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-red-700">{row.issues.join(' ') || rowErrors[row.rowNumber]}</p>
                  </div>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => setEditingRow(row.rowNumber)}
                    className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-100 disabled:opacity-50"
                  >
                    Edit row {row.rowNumber}
                  </button>
                </div>
                {editingRow === row.rowNumber ? (
                  <CorrectionForm
                    row={row}
                    onCancel={() => setEditingRow(null)}
                    onSave={(values) => {
                      onCorrect(row, values)
                      setEditingRow(null)
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function CorrectionForm({ row, onCancel, onSave }: { row: WarrantyImportRow; onCancel: () => void; onSave: (values: WarrantyValues) => void }) {
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = readWarrantyForm(event.currentTarget)
    const { issues } = validateWarrantyValues(values)
    if (issues.length) setError(issues.join(' '))
    else onSave(values)
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <h4 className="mb-4 text-sm font-black text-stone-900">Correct row {row.rowNumber}</h4>
      <WarrantyFields values={row.values} correcting />
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-100">Cancel</button>
        <button type="submit" className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700">Save correction</button>
      </div>
    </form>
  )
}

function ImportStat({ label, value, warn = false }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${warn && value ? 'bg-red-50' : 'bg-stone-100'}`}>
      <dt className="text-[10px] font-bold uppercase tracking-wide text-stone-600">{label}</dt>
      <dd className={`text-xl font-black ${warn && value ? 'text-red-600' : 'text-stone-900'}`}>{value}</dd>
    </div>
  )
}
