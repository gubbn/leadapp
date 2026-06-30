'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import {
  normaliseEmail,
  validateEmailForLead,
} from '@/lib/marketingImportHelpers'
import AppHeader from '@/app/components/AppHeader'

type CompanyForm = {
  company_name: string
  industry: string
  location: string
  size_band: string
  domain: string
  outcome: string
  dnc: boolean
  last_contact_date: string
}

type ContactForm = {
  first_name: string
  last_name: string
  role: string
  email_address: string
  telephone: string
  outcome: string
  dnc: boolean
}

const emptyCompanyForm: CompanyForm = {
  company_name: '',
  industry: '',
  location: '',
  size_band: 'unknown',
  domain: '',
  outcome: '',
  dnc: false,
  last_contact_date: '',
}

const emptyContactForm: ContactForm = {
  first_name: '',
  last_name: '',
  role: '',
  email_address: '',
  telephone: '',
  outcome: '',
  dnc: false,
}

const outcomeOptions = [
  '',
  'No answer',
  'Bounced',
  'Negative',
  'Negotiating',
  'Quote sent',
  'Customer',
  'Won',
]

const sizeBandOptions = [
  'unknown',
  'micro',
  'small',
  'medium',
  'large',
  'enterprise',
]

export default function AddLeadPage() {
  const [companyForm, setCompanyForm] =
    useState<CompanyForm>(emptyCompanyForm)
  const [contactForm, setContactForm] =
    useState<ContactForm>(emptyContactForm)
  const [addContact, setAddContact] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [emailWarning, setEmailWarning] = useState('')

  function updateCompany(field: keyof CompanyForm, value: string | boolean) {
    setCompanyForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateContact(field: keyof ContactForm, value: string | boolean) {
    setContactForm((current) => ({
      ...current,
      [field]: value,
    }))

    if (field === 'email_address' && typeof value === 'string') {
      const validation = validateEmailForLead(value)
      setEmailWarning(validation.email_validation_notes || '')
    }
  }

  async function saveLead() {
    setSaving(true)
    setMessage('')
    setErrorMessage('')

    const companyName = cleanText(companyForm.company_name)

    if (!companyName) {
      setErrorMessage('Company name is required.')
      setSaving(false)
      return
    }

    const cleanedDomain = cleanDomain(companyForm.domain)

    let existingCompanyId: string | null = null

    if (cleanedDomain) {
      const { data: existingByDomain, error: domainError } = await supabase
        .from('companies')
        .select('id')
        .eq('domain', cleanedDomain)
        .maybeSingle()

      if (domainError) {
        setErrorMessage(domainError.message)
        setSaving(false)
        return
      }

      existingCompanyId = existingByDomain?.id ?? null
    }

    if (!existingCompanyId) {
      const { data: existingByName, error: nameError } = await supabase
        .from('companies')
        .select('id')
        .ilike('company_name', companyName)
        .maybeSingle()

      if (nameError) {
        setErrorMessage(nameError.message)
        setSaving(false)
        return
      }

      existingCompanyId = existingByName?.id ?? null
    }

    let companyId = existingCompanyId

    if (!companyId) {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .insert({
          company_name: companyName,
          industry: cleanText(companyForm.industry),
          location: cleanText(companyForm.location),
          size_band: cleanText(companyForm.size_band) || 'unknown',
          domain: cleanedDomain,
          outcome: cleanText(companyForm.outcome),
          dnc: Boolean(companyForm.dnc),
          last_contact_date: cleanText(companyForm.last_contact_date),
        })
        .select('id')
        .single()

      if (companyError) {
        setErrorMessage(companyError.message)
        setSaving(false)
        return
      }

      companyId = companyData.id
    } else {
      const { error: companyUpdateError } = await supabase
        .from('companies')
        .update({
          industry: cleanText(companyForm.industry),
          location: cleanText(companyForm.location),
          size_band: cleanText(companyForm.size_band) || 'unknown',
          domain: cleanedDomain,
          outcome: cleanText(companyForm.outcome),
          dnc: Boolean(companyForm.dnc),
          last_contact_date: cleanText(companyForm.last_contact_date),
        })
        .eq('id', companyId)

      if (companyUpdateError) {
        setErrorMessage(companyUpdateError.message)
        setSaving(false)
        return
      }
    }

    if (addContact) {
      const cleanedEmail = normaliseEmail(contactForm.email_address)
      const emailValidation = validateEmailForLead(cleanedEmail)

      if (
        emailValidation.email_status === 'invalid_format' ||
        emailValidation.email_status === 'missing'
      ) {
        setErrorMessage(
          emailValidation.email_validation_notes ||
            'Please check the contact email address.',
        )
        setSaving(false)
        return
      }

      if (cleanedEmail) {
        const { data: existingContact, error: duplicateError } = await supabase
          .from('contacts')
          .select('id')
          .eq('email_address', cleanedEmail)
          .maybeSingle()

        if (duplicateError) {
          setErrorMessage(duplicateError.message)
          setSaving(false)
          return
        }

        if (existingContact) {
          setErrorMessage(
            'A contact with this email address already exists. Add a different contact or update the existing one.',
          )
          setSaving(false)
          return
        }
      }

      const { error: contactError } = await supabase.from('contacts').insert({
        company_id: companyId,
        first_name: cleanText(contactForm.first_name),
        last_name: cleanText(contactForm.last_name),
        role: cleanText(contactForm.role),
        email_address: cleanedEmail,
        telephone: cleanText(contactForm.telephone),
        outcome: cleanText(contactForm.outcome || companyForm.outcome),
        dnc: Boolean(contactForm.dnc || companyForm.dnc),
        last_contact_date: cleanText(companyForm.last_contact_date),
      })

      if (contactError) {
        setErrorMessage(contactError.message)
        setSaving(false)
        return
      }
    }

    setMessage(
      existingCompanyId
        ? 'Existing company updated and contact saved.'
        : 'New company saved successfully.',
    )

    setCompanyForm(emptyCompanyForm)
    setContactForm(emptyContactForm)
    setAddContact(true)
    setEmailWarning('')
    setSaving(false)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/" className="text-sm font-bold text-red-600">
            ← Back to dashboard
          </Link>

          <div className="mt-6 max-w-3xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Add lead
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Add a company and contact.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Add a company directly into the CRM, with an optional first
              contact. The app checks for existing companies by domain or name
              and checks contact emails before saving.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {message && (
          <p className="mb-6 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
            {message}
          </p>
        )}

        {errorMessage && (
          <p className="mb-6 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="border-b border-stone-100 pb-4">
              <h2 className="text-xl font-black text-stone-950">
                Company details
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Company name is required. Domain helps prevent duplicates.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Input
                label="Company name"
                value={companyForm.company_name}
                onChange={(value) => updateCompany('company_name', value)}
                required
              />

              <Input
                label="Domain"
                value={companyForm.domain}
                onChange={(value) => updateCompany('domain', value)}
                placeholder="example.co.uk"
              />

              <Input
                label="Industry"
                value={companyForm.industry}
                onChange={(value) => updateCompany('industry', value)}
              />

              <Input
                label="Location"
                value={companyForm.location}
                onChange={(value) => updateCompany('location', value)}
              />

              <Select
                label="Size band"
                value={companyForm.size_band}
                options={sizeBandOptions}
                onChange={(value) => updateCompany('size_band', value)}
              />

              <Select
                label="Outcome"
                value={companyForm.outcome}
                options={outcomeOptions}
                emptyLabel="No outcome"
                onChange={(value) => updateCompany('outcome', value)}
              />

              <Input
                label="Last contact date"
                type="date"
                value={companyForm.last_contact_date}
                onChange={(value) =>
                  updateCompany('last_contact_date', value)
                }
              />

              <label className="flex items-end gap-2 rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={companyForm.dnc}
                  onChange={(event) =>
                    updateCompany('dnc', event.target.checked)
                  }
                />
                Do not contact company
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <h2 className="text-xl font-black text-stone-950">
                  Contact details
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Add the first contact now, or save the company only.
                </p>
              </div>

              <label className="flex items-center gap-2 rounded-xl border border-stone-300 px-3 py-2 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={addContact}
                  onChange={(event) => setAddContact(event.target.checked)}
                />
                Add contact
              </label>
            </div>

            <div
              className={`mt-5 grid gap-4 md:grid-cols-2 ${
                !addContact ? 'pointer-events-none opacity-40' : ''
              }`}
            >
              <Input
                label="First name"
                value={contactForm.first_name}
                onChange={(value) => updateContact('first_name', value)}
              />

              <Input
                label="Last name"
                value={contactForm.last_name}
                onChange={(value) => updateContact('last_name', value)}
              />

              <Input
                label="Role"
                value={contactForm.role}
                onChange={(value) => updateContact('role', value)}
              />

              <Input
                label="Email address"
                value={contactForm.email_address}
                onChange={(value) => updateContact('email_address', value)}
                placeholder="name@example.co.uk"
              />

              <Input
                label="Telephone"
                value={contactForm.telephone}
                onChange={(value) => updateContact('telephone', value)}
              />

              <Select
                label="Contact outcome"
                value={contactForm.outcome}
                options={outcomeOptions}
                emptyLabel="Use company outcome"
                onChange={(value) => updateContact('outcome', value)}
              />

              <label className="flex items-end gap-2 rounded-xl border border-stone-300 px-4 py-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={contactForm.dnc}
                  onChange={(event) =>
                    updateContact('dnc', event.target.checked)
                  }
                />
                Do not contact person
              </label>
            </div>

            {emailWarning && addContact && (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
                {emailWarning}
              </p>
            )}
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-stone-950">
                Save lead
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                This saves directly to the company/contact tables, not the
                cleanup queue.
              </p>
            </div>

            <button
              onClick={saveLead}
              disabled={saving}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save company / contact'}
            </button>
          </div>
        </div>
      </section>
    </main>
  )
}

function cleanText(value: string | null | undefined) {
  return value?.trim() || null
}

function cleanDomain(value: string | null | undefined) {
  const cleaned = value
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')

  return cleaned || null
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
        {required ? ' *' : ''}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
      />
    </label>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
  emptyLabel,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  emptyLabel?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option || emptyLabel || 'None'}
          </option>
        ))}
      </select>
    </label>
  )
}