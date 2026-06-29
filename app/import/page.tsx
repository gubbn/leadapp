'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'
import {
  classifySizeBand,
  estimatedLastContactDate,
  getField,
  hasMultipleContacts,
  isValidEmail,
  needsDncReview,
  parseDate,
  parseDnc,
  splitSingleName,
} from '@/lib/marketingImportHelpers'
import LogoutButton from '@/app/components/LogoutButton'

type ImportPreviewRow = {
  lead_company_name: string
  contact_name_raw: string
  first_name: string
  last_name: string
  role: string
  industry: string
  email_address: string
  telephone: string
  domain: string
  location: string
  business_size_raw: string
  size_band: string
  days_since_last_contact: number | null
  estimated_last_contact_date: string | null
  dnc_raw: string
  dnc: boolean
  outcome: string
  next_contact_opportunity: string | null
  needs_contact_name_cleanup: boolean
  needs_email_cleanup: boolean
  needs_size_cleanup: boolean
  needs_dnc_review: boolean
  import_notes: string
}

export default function ImportPage() {
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportPreviewRow[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const issueCount = useMemo(() => {
    return rows.filter(
      (row) =>
        row.needs_contact_name_cleanup ||
        row.needs_email_cleanup ||
        row.needs_size_cleanup ||
        row.needs_dnc_review
    ).length
  }, [rows])

  const readyCount = rows.length - issueCount

  function handleFile(file: File) {
    setFileName(file.name)
    setMessage('')
    setErrorMessage('')

    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const mappedRows = result.data.map(mapSpreadsheetRow)
        setRows(mappedRows)
      },
      error: (error) => {
        setErrorMessage(error.message)
      },
    })
  }

  async function importRows() {
    if (rows.length === 0) {
      setErrorMessage('Choose a CSV file first.')
      return
    }

    setIsImporting(true)
    setMessage('')
    setErrorMessage('')

    const batchResult = await supabase
      .from('lead_import_batches')
      .insert({
        file_name: fileName,
      })
      .select('id')
      .single()

    if (batchResult.error) {
      setIsImporting(false)
      setErrorMessage(batchResult.error.message)
      return
    }

    const batchId = batchResult.data.id

    const rowsToInsert = rows.map((row) => ({
      ...row,
      batch_id: batchId,
    }))

    const chunkSize = 500

    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
      const chunk = rowsToInsert.slice(i, i + chunkSize)

      const result = await supabase.from('lead_import_rows').insert(chunk)

      if (result.error) {
        setIsImporting(false)
        setErrorMessage(result.error.message)
        return
      }
    }

    setIsImporting(false)
    setMessage(`Imported ${rows.length} rows. ${issueCount} need cleanup.`)
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
            <NavLink href="/cleanup">Cleanup</NavLink>
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
              Step 01
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Import your lead spreadsheet.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Upload your CSV file and the dashboard will flag rows with
              multiple contact names, missing emails, unknown business sizes or
              DNC values that need checking.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-stone-950">
              Upload CSV file
            </h2>

            <p className="mt-2 text-sm leading-6 text-stone-600">
              Export your spreadsheet as CSV first, then select it here.
            </p>

            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center transition hover:border-red-300 hover:bg-red-50">
              <span className="text-sm font-bold text-stone-800">
                Choose spreadsheet CSV
              </span>

              <span className="mt-2 text-xs text-stone-500">
                Expected format: .csv
              </span>

              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleFile(file)
                }}
              />
            </label>

            {fileName && (
              <p className="mt-4 rounded-xl bg-stone-100 p-3 text-sm font-semibold text-stone-700">
                Selected: {fileName}
              </p>
            )}

            {rows.length > 0 && (
              <div className="mt-6 grid gap-3">
                <StatLine label="Rows found" value={rows.length} />
                <StatLine label="Ready rows" value={readyCount} />
                <StatLine label="Rows needing cleanup" value={issueCount} urgent />
              </div>
            )}

            {rows.length > 0 && (
              <button
                onClick={importRows}
                disabled={isImporting}
                className="mt-6 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import rows'}
              </button>
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

          <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-200 p-5">
              <h2 className="text-xl font-black text-stone-950">
                Import preview
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Check the first 25 rows before importing.
              </p>
            </div>

            {rows.length === 0 ? (
              <div className="p-8 text-sm leading-6 text-stone-500">
                No file selected yet. Once you upload your CSV, the preview will
                appear here.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                      <tr>
                        <th className="px-4 py-3">Company</th>
                        <th className="px-4 py-3">Contact</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Flags</th>
                      </tr>
                    </thead>

                    <tbody>
                      {rows.slice(0, 25).map((row, index) => (
                        <tr key={index} className="border-t border-stone-100">
                          <td className="px-4 py-3 font-semibold text-stone-800">
                            {row.lead_company_name || (
                              <span className="text-red-600">Missing</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {row.contact_name_raw || (
                              <span className="text-red-600">Missing</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {row.email_address || (
                              <span className="text-red-600">Missing</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-medium">
                              {row.business_size_raw || 'Unknown'}
                            </span>

                            <span className="ml-2 rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-500">
                              {row.size_band}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <FlagList row={row} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {rows.length > 25 && (
                  <div className="border-t border-stone-200 p-4 text-sm text-stone-500">
                    Showing first 25 rows only. All rows will be imported.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

function mapSpreadsheetRow(row: Record<string, unknown>): ImportPreviewRow {
  const companyName = getField(row, ['Lead Company Name'])
  const contactName = getField(row, ['Contact Name'])
  const role = getField(row, ['Role'])
  const industry = getField(row, ['Industry'])
  const email = getField(row, ['Email Address', 'Email'])
  const telephone = getField(row, ['Telephone', 'Phone'])
  const domain = getField(row, ['Domain'])
  const location = getField(row, ['Location'])
  const businessSize = getField(row, ['Business Size'])
  const daysSinceLastContact = getField(row, [
    'How many days since last contact',
    'Days since last contact',
  ])
  const dncRaw = getField(row, ['DNC', 'DNC yes/no'])
  const outcome = getField(row, ['Outcome'])
  const nextContactOpportunity = getField(row, ['Next contact opportunity'])

  const multipleContacts = hasMultipleContacts(contactName)

  const splitName = multipleContacts
    ? { firstName: '', lastName: '' }
    : splitSingleName(contactName)

  const sizeBand = classifySizeBand(businessSize)
  const parsedDays = Number(daysSinceLastContact)

  const notes: string[] = []

  if (multipleContacts) notes.push('Multiple contacts may be in one cell')
  if (!splitName.firstName || !splitName.lastName) notes.push('Name needs checking')
  if (!isValidEmail(email)) notes.push('Missing or invalid email')
  if (sizeBand === 'unknown') notes.push('Unknown business size')
  if (needsDncReview(dncRaw)) notes.push('DNC value needs review')

  return {
    lead_company_name: companyName,
    contact_name_raw: contactName,
    first_name: splitName.firstName,
    last_name: splitName.lastName,
    role,
    industry,
    email_address: email,
    telephone,
    domain,
    location,
    business_size_raw: businessSize,
    size_band: sizeBand,
    days_since_last_contact: Number.isFinite(parsedDays) ? parsedDays : null,
    estimated_last_contact_date: estimatedLastContactDate(daysSinceLastContact),
    dnc_raw: dncRaw,
    dnc: parseDnc(dncRaw),
    outcome,
    next_contact_opportunity: parseDate(nextContactOpportunity),
    needs_contact_name_cleanup:
      multipleContacts || !splitName.firstName || !splitName.lastName,
    needs_email_cleanup: !isValidEmail(email),
    needs_size_cleanup: sizeBand === 'unknown',
    needs_dnc_review: needsDncReview(dncRaw),
    import_notes: notes.join(', '),
  }
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

function StatLine({
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
      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
        urgent && value > 0
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-stone-200 bg-stone-50 text-stone-700'
      }`}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className="text-lg font-black">{value}</span>
    </div>
  )
}

function FlagList({ row }: { row: ImportPreviewRow }) {
  const flags = []

  if (row.needs_contact_name_cleanup) flags.push('Name')
  if (row.needs_email_cleanup) flags.push('Email')
  if (row.needs_size_cleanup) flags.push('Size')
  if (row.needs_dnc_review) flags.push('DNC')

  if (flags.length === 0) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
        Ready
      </span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700"
        >
          {flag}
        </span>
      ))}
    </div>
  )
}