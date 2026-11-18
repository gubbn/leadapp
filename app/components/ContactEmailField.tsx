'use client'

import { useState } from 'react'

export default function ContactEmailField({
  label = 'Email',
  website,
  name,
  value = '',
  onChange,
  autoFocus = false,
}: {
  label?: string
  website: string | null | undefined
  name?: string
  value?: string
  onChange?: (value: string) => void
  autoFocus?: boolean
}) {
  const suggestedDomain = emailDomainFromWebsite(website)
  const initial = splitEmail(value)
  const [localPart, setLocalPart] = useState(initial.localPart)
  const [customDomain, setCustomDomain] = useState(
    initial.domain && initial.domain !== suggestedDomain ? initial.domain : '',
  )
  const [usingCustomDomain, setUsingCustomDomain] = useState(
    Boolean(initial.domain && initial.domain !== suggestedDomain),
  )
  const [fullEmail, setFullEmail] = useState(value)

  if (!suggestedDomain) {
    return (
      <label className="block">
        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
        <input
          name={name}
          type="email"
          autoFocus={autoFocus}
          value={fullEmail}
          onChange={(event) => {
            setFullEmail(event.target.value)
            onChange?.(event.target.value)
          }}
          className="form-input"
          placeholder="name@company.co.uk"
        />
      </label>
    )
  }

  const activeDomain = usingCustomDomain ? customDomain : suggestedDomain
  const email = buildEmail(localPart, activeDomain)

  function updateLocalPart(nextValue: string) {
    const pasted = splitEmail(nextValue)
    if (pasted.domain) {
      setLocalPart(pasted.localPart)
      if (pasted.domain === suggestedDomain) {
        setUsingCustomDomain(false)
      } else {
        setCustomDomain(pasted.domain)
        setUsingCustomDomain(true)
      }
      onChange?.(buildEmail(pasted.localPart, pasted.domain))
      return
    }

    setLocalPart(nextValue)
    onChange?.(buildEmail(nextValue, activeDomain))
  }

  function updateCustomDomain(nextValue: string) {
    const cleaned = cleanDomain(nextValue)
    setCustomDomain(cleaned)
    onChange?.(buildEmail(localPart, cleaned))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={`${name ?? 'contact-email'}-local`} className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</label>
        <button
          type="button"
          onClick={() => {
            if (usingCustomDomain) {
              setUsingCustomDomain(false)
              onChange?.(buildEmail(localPart, suggestedDomain))
            } else {
              setCustomDomain(activeDomain)
              setUsingCustomDomain(true)
            }
          }}
          className="text-xs font-black text-red-600 hover:text-red-700"
        >
          {usingCustomDomain ? 'Use website domain' : 'Use a different domain'}
        </button>
      </div>
      <div className="flex items-center rounded-xl border border-stone-300 bg-white focus-within:border-red-500 focus-within:ring-4 focus-within:ring-red-50">
        <input
          id={`${name ?? 'contact-email'}-local`}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          autoFocus={autoFocus}
          value={localPart}
          onChange={(event) => updateLocalPart(event.target.value)}
          className="min-w-0 flex-1 rounded-l-xl px-3 py-2.5 text-sm font-semibold outline-none"
          placeholder="name"
          aria-label={`${label} name`}
        />
        <span className="text-sm font-bold text-stone-400">@</span>
        {usingCustomDomain ? (
          <input
            value={customDomain}
            onChange={(event) => updateCustomDomain(event.target.value)}
            className="min-w-0 flex-1 rounded-r-xl px-3 py-2.5 text-sm font-semibold outline-none"
            placeholder="other-domain.co.uk"
            aria-label={`${label} domain`}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate px-3 py-2.5 text-sm font-black text-stone-700">{suggestedDomain}</span>
        )}
      </div>
      <input type="hidden" name={name} value={email} />
      <p className="mt-1.5 text-xs text-stone-500">
        {usingCustomDomain ? 'Using a custom email domain.' : `Domain added from ${suggestedDomain}.`}
      </p>
    </div>
  )
}

export function emailDomainFromWebsite(value: string | null | undefined) {
  const trimmed = value?.trim().toLowerCase()
  if (!trimmed) return ''

  try {
    const url = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`)
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '')
  } catch {
    return cleanDomain(trimmed)
  }
}

function splitEmail(value: string) {
  const separator = value.lastIndexOf('@')
  if (separator < 0) return { localPart: value, domain: '' }
  return {
    localPart: value.slice(0, separator),
    domain: cleanDomain(value.slice(separator + 1)),
  }
}

function buildEmail(localPart: string, domain: string) {
  const local = localPart.trim().replace(/@+$/, '')
  return local && domain ? `${local}@${domain}` : ''
}

function cleanDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^@/, '')
    .replace(/[/:].*$/, '')
}
