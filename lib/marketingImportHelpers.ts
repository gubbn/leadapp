export type EmailStatus =
  | 'unchecked'
  | 'missing'
  | 'invalid_format'
  | 'valid_format'
  | 'duplicate'
  | 'deliverable'
  | 'risky'
  | 'undeliverable'

export type EmailDeliverability =
  | 'unchecked'
  | 'format_only'
  | 'role_address'
  | 'domain_has_mx'
  | 'no_mx'
  | 'disposable'
  | 'unknown'

export type EmailValidationResult = {
  email_status: EmailStatus
  email_deliverability: EmailDeliverability
  email_validation_notes: string | null
}

const roleAddressPrefixes = [
  'admin',
  'accounts',
  'billing',
  'bookings',
  'contact',
  'enquiries',
  'enquiry',
  'hello',
  'help',
  'info',
  'mail',
  'office',
  'reception',
  'sales',
  'support',
  'team',
]

const disposableDomains = [
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'yopmail.com',
]

export function normaliseEmail(email: string | null | undefined) {
  if (!email) return null

  const cleaned = email.trim().toLowerCase()

  return cleaned.length > 0 ? cleaned : null
}

export function isValidEmail(email: string | null | undefined) {
  const cleaned = normaliseEmail(email)

  if (!cleaned) return false

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
}

export function getEmailDomain(email: string | null | undefined) {
  const cleaned = normaliseEmail(email)

  if (!cleaned || !cleaned.includes('@')) return null

  return cleaned.split('@').pop() || null
}

export function isRoleAddress(email: string | null | undefined) {
  const cleaned = normaliseEmail(email)

  if (!cleaned || !cleaned.includes('@')) return false

  const localPart = cleaned.split('@')[0]

  return roleAddressPrefixes.includes(localPart)
}

export function isDisposableEmail(email: string | null | undefined) {
  const domain = getEmailDomain(email)

  if (!domain) return false

  return disposableDomains.includes(domain)
}

export function validateEmailForLead(
  email: string | null | undefined,
  options?: {
    isDuplicate?: boolean
  },
): EmailValidationResult {
  const cleaned = normaliseEmail(email)

  if (!cleaned) {
    return {
      email_status: 'missing',
      email_deliverability: 'unchecked',
      email_validation_notes: 'Email address is missing.',
    }
  }

  if (!isValidEmail(cleaned)) {
    return {
      email_status: 'invalid_format',
      email_deliverability: 'format_only',
      email_validation_notes: 'Email address format is invalid.',
    }
  }

  if (options?.isDuplicate) {
    return {
      email_status: 'duplicate',
      email_deliverability: 'format_only',
      email_validation_notes: 'This email address already exists.',
    }
  }

  if (isDisposableEmail(cleaned)) {
    return {
      email_status: 'risky',
      email_deliverability: 'disposable',
      email_validation_notes: 'This looks like a disposable email address.',
    }
  }

  if (isRoleAddress(cleaned)) {
    return {
      email_status: 'risky',
      email_deliverability: 'role_address',
      email_validation_notes:
        'This is a shared or role-based email address, such as info@ or sales@.',
    }
  }

  return {
    email_status: 'valid_format',
    email_deliverability: 'format_only',
    email_validation_notes: 'Email format looks valid.',
  }
}

export function splitSingleName(name: string | null | undefined) {
  if (!name) {
    return {
      first_name: null,
      last_name: null,
      firstName: null,
      lastName: null,
    }
  }

  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return {
      first_name: null,
      last_name: null,
      firstName: null,
      lastName: null,
    }
  }

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      last_name: null,
      firstName: parts[0],
      lastName: null,
    }
  }

  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')

  return {
    first_name: firstName,
    last_name: lastName,
    firstName,
    lastName,
  }
}

export function hasMultipleContacts(name: string | null | undefined) {
  if (!name) return false

  const cleaned = name.trim()

  if (!cleaned) return false

  return /\s+(and|&)\s+|\/|\\|;|\n/i.test(cleaned)
}

export function classifySizeBand(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 'unknown'

  const rawValue = String(value).trim().toLowerCase()

  if (rawValue === 'micro') return 'micro'
  if (rawValue === 'small') return 'small'
  if (rawValue === 'medium') return 'medium'
  if (rawValue === 'large') return 'large'
  if (rawValue === 'enterprise') return 'enterprise'
  if (rawValue === 'unknown') return 'unknown'

  if (
    rawValue.includes('1-10') ||
    rawValue.includes('1–10') ||
    rawValue.includes('1 to 10')
  ) {
    return 'micro'
  }

  if (
    rawValue.includes('11-50') ||
    rawValue.includes('11–50') ||
    rawValue.includes('11 to 50')
  ) {
    return 'small'
  }

  if (
    rawValue.includes('51-250') ||
    rawValue.includes('51–250') ||
    rawValue.includes('51 to 250')
  ) {
    return 'medium'
  }

  if (
    rawValue.includes('251-1000') ||
    rawValue.includes('251–1000') ||
    rawValue.includes('251 to 1000')
  ) {
    return 'large'
  }

  if (
    rawValue.includes('1000+') ||
    rawValue.includes('1000 plus') ||
    rawValue.includes('over 1000')
  ) {
    return 'enterprise'
  }

  const numberValue =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9]/g, ''))

  if (!Number.isFinite(numberValue) || numberValue <= 0) return 'unknown'

  if (numberValue <= 10) return 'micro'
  if (numberValue <= 50) return 'small'
  if (numberValue <= 250) return 'medium'
  if (numberValue <= 1000) return 'large'

  return 'enterprise'
}

export function parseDnc(value: string | boolean | null | undefined) {
  if (typeof value === 'boolean') return value

  if (value === null || value === undefined) return false

  const cleaned = String(value).trim().toLowerCase()

  if (!cleaned) return false

  return [
    'yes',
    'y',
    'true',
    '1',
    'do not contact',
    'dnc',
    'no contact',
    'unsubscribe',
    'unsubscribed',
    'opt out',
    'opt-out',
  ].includes(cleaned)
}

export function needsDncReview(value: string | boolean | null | undefined) {
  if (typeof value === 'boolean') return false

  if (value === null || value === undefined) return false

  const cleaned = String(value).trim().toLowerCase()

  if (!cleaned) return false

  const clearValues = [
    'yes',
    'y',
    'true',
    '1',
    'no',
    'n',
    'false',
    '0',
    'do not contact',
    'dnc',
    'no contact',
    'unsubscribe',
    'unsubscribed',
    'opt out',
    'opt-out',
  ]

  return !clearValues.includes(cleaned)
}

export function parseDate(value: string | Date | null | undefined) {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null

    return value.toISOString().slice(0, 10)
  }

  const cleaned = String(value).trim()

  if (!cleaned) return null

  const parsed = new Date(cleaned)

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  const ukDateMatch = cleaned.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)

  if (ukDateMatch) {
    const day = Number(ukDateMatch[1])
    const month = Number(ukDateMatch[2])
    const year =
      ukDateMatch[3].length === 2
        ? Number(`20${ukDateMatch[3]}`)
        : Number(ukDateMatch[3])

    const date = new Date(Date.UTC(year, month - 1, day))

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10)
    }
  }

  return null
}

export function estimatedLastContactDate(
  daysSinceLastContact: string | number | null | undefined,
) {
  if (
    daysSinceLastContact === null ||
    daysSinceLastContact === undefined ||
    daysSinceLastContact === ''
  ) {
    return null
  }

  const days =
    typeof daysSinceLastContact === 'number'
      ? daysSinceLastContact
      : Number(String(daysSinceLastContact).replace(/[^0-9]/g, ''))

  if (!Number.isFinite(days) || days < 0) return null

  const date = new Date()
  date.setDate(date.getDate() - days)

  return date.toISOString().slice(0, 10)
}

export function getField(
  row: Record<string, unknown>,
  possibleNames: string[],
) {
  const normalisedRowEntries = Object.entries(row).map(([key, value]) => ({
    key,
    normalisedKey: normaliseColumnName(key),
    value,
  }))

  for (const possibleName of possibleNames) {
    const normalisedPossibleName = normaliseColumnName(possibleName)

    const match = normalisedRowEntries.find(
      (entry) => entry.normalisedKey === normalisedPossibleName,
    )

    if (match) {
      return cleanFieldValue(match.value)
    }
  }

  return ''
}

export function csvEscape(value: unknown) {
  if (value === null || value === undefined) return ''

  const stringValue = String(value)

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function normaliseColumnName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function cleanFieldValue(value: unknown) {
  if (value === null || value === undefined) return ''

  return String(value).trim()
}