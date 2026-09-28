export type WarrantyImportValue = string | number | boolean | Date | null

export type WarrantySourceRow = Record<string, WarrantyImportValue>

export type WarrantyField =
  | 'customer_name'
  | 'product_name'
  | 'expiry_date'
  | 'serial_number'
  | 'warranty_type'
  | 'owner_name'
  | 'owner_email'
  | 'sharepoint_id'
  | 'notes'

export type WarrantyColumnMapping = Record<WarrantyField, string>

export type WarrantyImportRow = {
  source_key: string
  sharepoint_id: string | null
  customer_name: string
  product_name: string
  warranty_type: string | null
  serial_number: string | null
  expiry_date: string
  owner_name: string | null
  owner_email: string | null
  notes: string | null
  source_file: string
  valid: boolean
  issues: string[]
}

export type WarrantyWindow =
  | 'all'
  | 'overdue'
  | 'today'
  | 'week'
  | '30'
  | '60'
  | '90'

export const WARRANTY_FIELDS: Array<{
  key: WarrantyField
  label: string
  required: boolean
}> = [
  { key: 'customer_name', label: 'Customer / company', required: true },
  { key: 'product_name', label: 'Product / warranty', required: true },
  { key: 'expiry_date', label: 'Expiry date', required: true },
  { key: 'serial_number', label: 'Serial number', required: false },
  { key: 'warranty_type', label: 'Warranty type', required: false },
  { key: 'owner_name', label: 'Contact / owner', required: false },
  { key: 'owner_email', label: 'Contact email', required: false },
  { key: 'sharepoint_id', label: 'SharePoint ID', required: false },
  { key: 'notes', label: 'Notes', required: false },
]

const COLUMN_ALIASES: Record<WarrantyField, string[]> = {
  customer_name: [
    'customer',
    'customer name',
    'company',
    'company name',
    'client',
    'client name',
    'organisation',
    'organization',
    'business',
    'account',
  ],
  product_name: [
    'product',
    'product name',
    'warranty',
    'warranty name',
    'device',
    'equipment',
    'item',
    'asset',
    'description',
    'title',
  ],
  expiry_date: [
    'expiry date',
    'expiration date',
    'expires',
    'expiry',
    'warranty expiry',
    'warranty expiry date',
    'warranty expiration',
    'end date',
    'renewal date',
  ],
  serial_number: [
    'serial number',
    'serial no',
    'serial',
    'service tag',
    'asset number',
    'asset tag',
  ],
  warranty_type: [
    'warranty type',
    'type',
    'cover',
    'cover type',
    'service level',
    'manufacturer',
  ],
  owner_name: [
    'contact',
    'contact name',
    'owner',
    'account manager',
    'assigned to',
  ],
  owner_email: [
    'contact email',
    'owner email',
    'email',
    'email address',
  ],
  sharepoint_id: ['id', 'sharepoint id', 'item id', 'list item id'],
  notes: ['notes', 'comments', 'details', 'additional information'],
}

export function cleanHeader(value: WarrantyImportValue, index: number) {
  const text = valueToText(value).replace(/^\uFEFF/, '').trim()
  return text || `Column ${index + 1}`
}

export function makeUniqueHeaders(values: WarrantyImportValue[]) {
  const counts = new Map<string, number>()

  return values.map((value, index) => {
    const header = cleanHeader(value, index)
    const count = (counts.get(header) ?? 0) + 1
    counts.set(header, count)
    return count === 1 ? header : `${header} (${count})`
  })
}

export function detectWarrantyColumns(columns: string[]): WarrantyColumnMapping {
  const normalizedColumns = columns.map((column) => ({
    column,
    normalized: normalize(column),
  }))

  return Object.fromEntries(
    WARRANTY_FIELDS.map(({ key }) => {
      const aliases = COLUMN_ALIASES[key]
      const exact = normalizedColumns.find(({ normalized }) =>
        aliases.includes(normalized),
      )
      if (exact) return [key, exact.column]

      const partial = normalizedColumns.find(({ normalized }) =>
        aliases.some(
          (alias) =>
            normalized.length >= 5 &&
            (normalized.includes(alias) || alias.includes(normalized)),
        ),
      )
      return [key, partial?.column ?? '']
    }),
  ) as WarrantyColumnMapping
}

export function buildWarrantyImportRows(
  rows: WarrantySourceRow[],
  mapping: WarrantyColumnMapping,
  sourceFile: string,
) {
  return rows.map((row) => {
    const customerName = mappedText(row, mapping.customer_name)
    const productName = mappedText(row, mapping.product_name)
    const expiryDate = parseWarrantyDate(
      mapping.expiry_date ? row[mapping.expiry_date] : null,
    )
    const serialNumber = mappedText(row, mapping.serial_number)
    const warrantyType = mappedText(row, mapping.warranty_type)
    const ownerName = mappedText(row, mapping.owner_name)
    const ownerEmail = mappedText(row, mapping.owner_email)
    const sharepointId = mappedText(row, mapping.sharepoint_id)
    const notes = mappedText(row, mapping.notes)
    const issues: string[] = []

    if (!customerName) issues.push('Missing customer')
    if (!productName) issues.push('Missing product')
    if (!expiryDate) issues.push('Invalid or missing expiry date')

    const fallbackKey = [
      normalize(customerName),
      normalize(productName),
      normalize(serialNumber),
      expiryDate,
    ].join('|')

    return {
      source_key: sharepointId ? `sharepoint:${sharepointId}` : `warranty:${fallbackKey}`,
      sharepoint_id: sharepointId || null,
      customer_name: customerName,
      product_name: productName,
      warranty_type: warrantyType || null,
      serial_number: serialNumber || null,
      expiry_date: expiryDate,
      owner_name: ownerName || null,
      owner_email: ownerEmail || null,
      notes: notes || null,
      source_file: sourceFile,
      valid: issues.length === 0,
      issues,
    } satisfies WarrantyImportRow
  })
}

export function dedupeWarrantyRows(rows: WarrantyImportRow[]) {
  const deduped = new Map<string, WarrantyImportRow>()
  rows.forEach((row) => deduped.set(row.source_key, row))
  return Array.from(deduped.values())
}

export function parseWarrantyDate(value: WarrantyImportValue | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return ymd(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 date system, including its historic leap-year offset.
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
    return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  const text = valueToText(value).trim()
  if (!text) return ''

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (iso) return validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const uk = text.match(
    /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})(?:\D|$)/,
  )
  if (uk) {
    const shortYear = Number(uk[3])
    const year = shortYear < 100 ? 2000 + shortYear : shortYear
    return validYmd(year, Number(uk[2]), Number(uk[1]))
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return ''
  return ymd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

export function localToday() {
  const now = new Date()
  return ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

export function daysFromToday(date: string, today = localToday()) {
  return Math.round((ymdToUtc(date) - ymdToUtc(today)) / 86_400_000)
}

export function isInWarrantyWindow(
  expiryDate: string,
  window: WarrantyWindow,
  today = localToday(),
) {
  const days = daysFromToday(expiryDate, today)
  if (window === 'all') return true
  if (window === 'overdue') return days < 0
  if (window === 'today') return days === 0
  if (window === 'week') return days >= 0 && days <= daysLeftThisWeek(today)
  const limit = Number(window)
  return days >= 0 && days <= limit
}

function daysLeftThisWeek(today: string) {
  const day = new Date(ymdToUtc(today)).getUTCDay()
  return day === 0 ? 0 : 7 - day
}

function mappedText(row: WarrantySourceRow, column: string) {
  return column ? valueToText(row[column]).trim() : ''
}

function valueToText(value: WarrantyImportValue | undefined) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function validYmd(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return ''
  }
  return ymd(year, month, day)
}

function ymd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function ymdToUtc(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}
