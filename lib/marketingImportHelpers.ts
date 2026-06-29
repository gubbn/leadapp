export type SizeBand =
  | 'micro'
  | 'small'
  | 'medium'
  | 'large'
  | 'enterprise'
  | 'unknown'

export function cleanValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export function normaliseHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

export function getField(row: Record<string, unknown>, possibleHeaders: string[]) {
  const entries = Object.entries(row)

  for (const [key, value] of entries) {
    const normalisedKey = normaliseHeader(key)

    if (possibleHeaders.some((header) => normaliseHeader(header) === normalisedKey)) {
      return cleanValue(value)
    }
  }

  return ''
}

export function hasMultipleContacts(contactName: string) {
  const value = contactName.toLowerCase()

  return (
    value.includes('/') ||
    value.includes(';') ||
    value.includes('&') ||
    value.includes('\n') ||
    value.includes(' and ') ||
    value.includes(',')
  )
}

export function splitSingleName(contactName: string) {
  const cleaned = contactName.replace(/\s+/g, ' ').trim()

  if (!cleaned) {
    return {
      firstName: '',
      lastName: '',
    }
  }

  const parts = cleaned.split(' ')

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: '',
    }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export function isValidEmail(email: string) {
  if (!email) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function parseDnc(value: string) {
  const cleaned = value.toLowerCase().trim()

  if (['yes', 'y', 'true', '1', 'do not contact', 'dnc'].includes(cleaned)) {
    return true
  }

  if (['no', 'n', 'false', '0', ''].includes(cleaned)) {
    return false
  }

  return false
}

export function needsDncReview(value: string) {
  const cleaned = value.toLowerCase().trim()

  if (!cleaned) return false

  return ![
    'yes',
    'y',
    'true',
    '1',
    'do not contact',
    'dnc',
    'no',
    'n',
    'false',
    '0',
  ].includes(cleaned)
}

export function classifySizeBand(value: string): SizeBand {
  const cleaned = value.toLowerCase().trim()

  if (!cleaned) return 'unknown'

  if (cleaned.includes('micro')) return 'micro'
  if (cleaned.includes('small')) return 'small'
  if (cleaned.includes('medium')) return 'medium'
  if (cleaned.includes('large')) return 'large'
  if (cleaned.includes('enterprise')) return 'enterprise'

  const numbers = cleaned.match(/\d+/g)

  if (!numbers || numbers.length === 0) {
    return 'unknown'
  }

  const maxNumber = Math.max(...numbers.map(Number))

  if (cleaned.includes('+') && maxNumber >= 1000) return 'enterprise'
  if (maxNumber <= 10) return 'micro'
  if (maxNumber <= 50) return 'small'
  if (maxNumber <= 250) return 'medium'
  if (maxNumber <= 1000) return 'large'

  return 'enterprise'
}

export function estimatedLastContactDate(daysSinceLastContact: string) {
  const days = Number(daysSinceLastContact)

  if (!Number.isFinite(days) || days < 0) {
    return null
  }

  const date = new Date()
  date.setDate(date.getDate() - days)

  return date.toISOString().slice(0, 10)
}

export function parseDate(value: string) {
  if (!value) return null

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

export function csvEscape(value: unknown) {
  const stringValue = value === null || value === undefined ? '' : String(value)

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }

  return stringValue
}