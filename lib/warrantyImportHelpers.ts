export type WarrantyImportValue = string | number | boolean | Date | null

export type WarrantySourceRow = {
  rowNumber: number
  cells: Record<string, WarrantyImportValue>
}

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
export type WarrantyValues = Record<WarrantyField, string>
export type WarrantyCorrections = Partial<Record<number, Partial<WarrantyValues>>>

export type WarrantyImportRow = {
  rowNumber: number
  values: WarrantyValues
  data: ReturnType<typeof validateWarrantyValues>['data'] & {
    source_key: string
    source_file: string
  }
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
  maxLength?: number
}> = [
  { key: 'customer_name', label: 'Customer / company', required: true, maxLength: 200 },
  { key: 'product_name', label: 'Product / warranty', required: true, maxLength: 240 },
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
  corrections: WarrantyCorrections,
): WarrantyImportRow[] {
  return rows.map(({ rowNumber, cells }) => {
    const mapped = Object.fromEntries(WARRANTY_FIELDS.map(({ key }) => {
      const cell = mapping[key] ? cells[mapping[key]] : null
      const text = valueToText(cell).trim()
      return [key, key === 'expiry_date' ? parseWarrantyDate(cell) || text : text]
    })) as WarrantyValues
    const values = { ...mapped, ...corrections[rowNumber] }
    const { data, issues } = validateWarrantyValues(values)

    const fallbackKey = [
      normalize(data.customer_name),
      normalize(data.product_name),
      normalize(data.serial_number ?? ''),
      data.expiry_date,
    ].join('|')

    return {
      rowNumber,
      values,
      data: {
        ...data,
        source_key: data.sharepoint_id ? `sharepoint:${data.sharepoint_id}` : `warranty:${fallbackKey}`,
        source_file: sourceFile,
      },
      issues,
    }
  })
}

export function validateWarrantyValues(values: WarrantyValues) {
  const data = {
    customer_name: values.customer_name.trim(),
    product_name: values.product_name.trim(),
    expiry_date: parseWarrantyDate(values.expiry_date),
    serial_number: values.serial_number.trim() || null,
    warranty_type: values.warranty_type.trim() || null,
    owner_name: values.owner_name.trim() || null,
    owner_email: values.owner_email.trim() || null,
    sharepoint_id: values.sharepoint_id.trim() || null,
    notes: values.notes.trim() || null,
  }
  const issues: string[] = []
  for (const { key, label, required, maxLength } of WARRANTY_FIELDS) {
    if (required && !data[key]) {
      issues.push(key === 'expiry_date' ? 'Enter a valid expiry date.' : `${label} is required.`)
    }
    if (maxLength && Array.from(data[key] ?? '').length > maxLength) {
      issues.push(`${label} must be ${maxLength} characters or fewer.`)
    }
    if (data[key]?.includes('\0')) issues.push(`${label} contains an invalid character.`)
  }
  return { data, issues }
}

export function dedupeWarrantyRows(rows: WarrantyImportRow[]) {
  const deduped = new Map<string, WarrantyImportRow>()
  rows.forEach((row) => deduped.set(row.data.source_key, row))
  return Array.from(deduped.values())
}

type ImportError = { code: string; message: string }

export async function saveWarrantyImportRows(
  rows: WarrantyImportRow[],
  upsert: (rows: WarrantyImportRow['data'][]) => Promise<ImportError | null>,
) {
  const savedKeys = new Set<string>()
  const rowErrors: Record<number, string> = {}

  async function saveBatch(batch: WarrantyImportRow[]): Promise<ImportError | null> {
    let error: ImportError | null
    try {
      error = await upsert(batch.map(({ data }) => data))
    } catch (cause) {
      return { code: '', message: cause instanceof Error ? cause.message : 'The import could not be completed.' }
    }
    if (!error) {
      batch.forEach(({ data }) => savedKeys.add(data.source_key))
      return null
    }

    // PostgreSQL data and constraint errors can be isolated by splitting a batch.
    if (!/^(22|23)/.test(error.code)) return error
    if (batch.length === 1) {
      rowErrors[batch[0].rowNumber] = error.message
      return null
    }

    const midpoint = Math.floor(batch.length / 2)
    const firstError = await saveBatch(batch.slice(0, midpoint))
    return firstError ?? await saveBatch(batch.slice(midpoint))
  }

  for (let index = 0; index < rows.length; index += 500) {
    const error = await saveBatch(rows.slice(index, index + 500))
    if (error) return { savedKeys, rowErrors, error }
  }
  return { savedKeys, rowErrors, error: null }
}

export function parseWarrantyDate(value: WarrantyImportValue | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return validYmd(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 date system, including its historic leap-year offset.
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000)
    return validYmd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  const text = valueToText(value).trim()
  if (!text) return ''

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d+)/)
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
  return validYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

const londonDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function warrantyToday(now = new Date()) {
  return londonDate.format(now)
}

export function warrantyWeekEnd(today = warrantyToday()) {
  const sunday = new Date(ymdToUtc(today))
  sunday.setUTCDate(sunday.getUTCDate() + (7 - sunday.getUTCDay()) % 7)
  return sunday.toISOString().slice(0, 10)
}

export function daysFromToday(date: string, today = warrantyToday()) {
  return Math.round((ymdToUtc(date) - ymdToUtc(today)) / 86_400_000)
}

export function isInWarrantyWindow(
  expiryDate: string,
  window: WarrantyWindow,
  today = warrantyToday(),
) {
  const days = daysFromToday(expiryDate, today)
  if (window === 'all') return true
  if (window === 'overdue') return days < 0
  if (window === 'today') return days === 0
  if (window === 'week') return days >= 0 && expiryDate <= warrantyWeekEnd(today)
  const limit = Number(window)
  return days >= 0 && days <= limit
}

function valueToText(value: WarrantyImportValue | undefined) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  return String(value)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function validYmd(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) return ''
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
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
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function ymdToUtc(value: string) {
  return Date.parse(`${value}T00:00:00Z`)
}
