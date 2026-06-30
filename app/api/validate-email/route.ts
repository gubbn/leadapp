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
    }
  }

  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return {
      first_name: null,
      last_name: null,
    }
  }

  if (parts.length === 1) {
    return {
      first_name: parts[0],
      last_name: null,
    }
  }

  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  }
}

export function classifySizeBand(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null

  const numberValue =
    typeof value === 'number'
      ? value
      : Number(String(value).replace(/[^0-9]/g, ''))

  if (!Number.isFinite(numberValue) || numberValue <= 0) return null

  if (numberValue <= 10) return '1-10'
  if (numberValue <= 50) return '11-50'
  if (numberValue <= 250) return '51-250'

  return '250+'
}