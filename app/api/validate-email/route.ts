import { NextResponse } from 'next/server'
import { resolveMx } from 'node:dns/promises'

export const runtime = 'nodejs'

type ValidateEmailResponse = {
  ok: boolean
  email_status:
    | 'missing'
    | 'invalid_format'
    | 'deliverable'
    | 'undeliverable'
    | 'unchecked'
  email_deliverability:
    | 'unchecked'
    | 'format_only'
    | 'domain_has_mx'
    | 'no_mx'
    | 'unknown'
  email_validation_notes: string
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getEmailDomain(email: string) {
  const parts = email.split('@')
  return parts.length === 2 ? parts[1] : null
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = String(body?.email || '').trim().toLowerCase()

    if (!email) {
      return NextResponse.json<ValidateEmailResponse>({
        ok: false,
        email_status: 'missing',
        email_deliverability: 'unchecked',
        email_validation_notes: 'Email address is missing.',
      })
    }

    if (!isValidEmail(email)) {
      return NextResponse.json<ValidateEmailResponse>({
        ok: false,
        email_status: 'invalid_format',
        email_deliverability: 'format_only',
        email_validation_notes: 'Email address format is invalid.',
      })
    }

    const domain = getEmailDomain(email)

    if (!domain) {
      return NextResponse.json<ValidateEmailResponse>({
        ok: false,
        email_status: 'invalid_format',
        email_deliverability: 'format_only',
        email_validation_notes: 'Email domain could not be checked.',
      })
    }

    try {
      const mxRecords = await resolveMx(domain)

      if (!mxRecords || mxRecords.length === 0) {
        return NextResponse.json<ValidateEmailResponse>({
          ok: false,
          email_status: 'undeliverable',
          email_deliverability: 'no_mx',
          email_validation_notes:
            'The email domain does not appear to have mail records.',
        })
      }

      return NextResponse.json<ValidateEmailResponse>({
        ok: true,
        email_status: 'deliverable',
        email_deliverability: 'domain_has_mx',
        email_validation_notes:
          'The email format is valid and the domain has mail records.',
      })
    } catch {
      return NextResponse.json<ValidateEmailResponse>({
        ok: false,
        email_status: 'undeliverable',
        email_deliverability: 'no_mx',
        email_validation_notes:
          'The email domain could not be verified for receiving mail.',
      })
    }
  } catch {
    return NextResponse.json<ValidateEmailResponse>(
      {
        ok: false,
        email_status: 'unchecked',
        email_deliverability: 'unknown',
        email_validation_notes: 'Email validation failed.',
      },
      { status: 500 },
    )
  }
}