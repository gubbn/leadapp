'use client'

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'

type CleanupFilter =
  | 'all'
  | 'needs_cleanup'
  | 'ready'
  | 'submitted'
  | 'review'
  | 'duplicates'
  | 'existing_company'
  | 'existing_contact'
  | 'dnc'

type LeadImportRow = {
  id: string
  lead_company_name: string | null
  contact_name_raw: string | null
  first_name: string | null
  last_name: string | null
  role: string | null
  industry: string | null
  email_address: string | null
  telephone: string | null
  domain: string | null
  needs_contact_name_cleanup: boolean | null
  needs_email_cleanup: boolean | null
  needs_dnc_review: boolean | null
  submitted_for_approval: boolean | null
  submitted_at: string | null
  submitted_by: string | null
  review_before_approval: boolean | null
  approval_notes: string | null
}

type Company = {
  id: string
  company_name: string | null
  domain: string | null
}

type Contact = {
  id: string
  company_id: string | null
  first_name: string | null
  last_name: string | null
}

type ContactDraft = {
  first_name: string | null
  last_name: string | null
}

type ExistingMatchInfo = {
  company: Company | null
  matchedContacts: Contact[]
}

type DuplicateInfo = {
  key: string | null
  count: number
  otherIds: string[]
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const MAX_ROWS_TO_LOAD = 5000
const MAX_REFERENCE_ROWS = 10000

const leadImportSelect = `
  id,
  lead_company_name,
  contact_name_raw,
  first_name,
  last_name,
  role,
  industry,
  email_address,
  telephone,
  domain,
  needs_contact_name_cleanup,
  needs_email_cleanup,
  needs_dnc_review,
  submitted_for_approval,
  submitted_at,
  submitted_by,
  review_before_approval,
  approval_notes
`

const inputClass =
  'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const labelClass = 'mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500'

const buttonClass =
  'rounded-xl px-4 py-2 text-sm font-bold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50'

function clean(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed.length ? trimmed : null
}

function normalise(value: string | null | undefined) {
  return clean(value)?.toLowerCase().replace(/\s+/g, ' ') ?? null
}

function getEmailDomain(value: string | null | undefined) {
  const email = clean(value)
  if (!email || !email.includes('@')) return null
  return clean(email.split('@')[1])
}

function isValidEmail(value: string | null | undefined) {
  const email = clean(value)
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getCompanyIdentity(row: LeadImportRow) {
  return (
    normalise(row.lead_company_name) ||
    normalise(row.domain) ||
    normalise(getEmailDomain(row.email_address))
  )
}

function getCompanyDisplayName(row: LeadImportRow) {
  return (
    clean(row.lead_company_name) ||
    clean(row.domain) ||
    getEmailDomain(row.email_address) ||
    'Company name missing'
  )
}

function parseSingleName(value: string): ContactDraft {
  const parts = value.trim().replace(/\s+/g, ' ').split(' ')

  if (parts.length === 1) {
    return {
      first_name: parts[0] || null,
      last_name: null,
    }
  }

  return {
    first_name: parts[0] || null,
    last_name: parts.slice(1).join(' ') || null,
  }
}

function splitContactName(rawName: string | null | undefined): ContactDraft[] {
  const raw = clean(rawName)
  if (!raw) return []

  const parts = raw
    .replace(/\s+/g, ' ')
    .split(/\s+(?:and|&|\+)\s+|\/|,/i)
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length <= 1) {
    return [parseSingleName(raw)]
  }

  const parsed = parts.map(parseSingleName)
  const sharedLastName = parsed[parsed.length - 1]?.last_name ?? null

  return parsed.map((contact) => ({
    first_name: contact.first_name,
    last_name: contact.last_name || sharedLastName,
  }))
}

function getContactDrafts(row: LeadImportRow): ContactDraft[] {
  const rawContacts = splitContactName(row.contact_name_raw)

  if (rawContacts.length > 1) return rawContacts

  const firstName = clean(row.first_name)
  const lastName = clean(row.last_name)

  if (firstName || lastName) {
    return [
      {
        first_name: firstName,
        last_name: lastName,
      },
    ]
  }

  return rawContacts
}

function getContactDisplayName(contact: ContactDraft | Contact) {
  return (
    [clean(contact.first_name), clean(contact.last_name)].filter(Boolean).join(' ') ||
    'Unnamed contact'
  )
}

function rowIsSubmitted(row: LeadImportRow) {
  return Boolean(row.submitted_for_approval)
}

function rowNeedsNameCleanup(row: LeadImportRow) {
  const contacts = getContactDrafts(row)
  return contacts.length === 0 || contacts.some((contact) => !clean(contact.first_name))
}

function rowNeedsEmailCleanup(row: LeadImportRow) {
  return !isValidEmail(row.email_address)
}

function rowHasBlockingIssues(row: LeadImportRow) {
  return (
    !clean(row.lead_company_name) ||
    rowNeedsNameCleanup(row) ||
    rowNeedsEmailCleanup(row) ||
    Boolean(row.needs_dnc_review)
  )
}

function rowNeedsCleanup(row: LeadImportRow) {
  if (rowIsSubmitted(row)) return false
  return rowHasBlockingIssues(row)
}

function rowIsReady(row: LeadImportRow) {
  return !rowIsSubmitted(row) && !rowHasBlockingIssues(row)
}

function rowNeedsApprovalReview(row: LeadImportRow) {
  return Boolean(row.submitted_for_approval && row.review_before_approval)
}

function buildSavePayload(row: LeadImportRow) {
  return {
    lead_company_name: clean(row.lead_company_name),
    contact_name_raw: clean(row.contact_name_raw),
    first_name: clean(row.first_name),
    last_name: clean(row.last_name),
    role: clean(row.role),
    industry: clean(row.industry),
    email_address: clean(row.email_address),
    telephone: clean(row.telephone),
    domain: clean(row.domain),
    needs_contact_name_cleanup: rowNeedsNameCleanup(row),
    needs_email_cleanup: rowNeedsEmailCleanup(row),
    needs_dnc_review: Boolean(row.needs_dnc_review),
    review_before_approval: Boolean(row.review_before_approval),
    approval_notes: clean(row.approval_notes),
  }
}

function getDuplicateKey(row: LeadImportRow) {
  const companyIdentity = getCompanyIdentity(row)
  if (!companyIdentity) return null

  const email = normalise(row.email_address)
  if (email) return `company:${companyIdentity}|email:${email}`

  const rawName = normalise(row.contact_name_raw)
  if (rawName) return `company:${companyIdentity}|raw:${rawName}`

  const firstName = normalise(row.first_name)
  const lastName = normalise(row.last_name)

  if (firstName || lastName) {
    return `company:${companyIdentity}|name:${firstName ?? ''} ${lastName ?? ''}`.trim()
  }

  return null
}

function buildDuplicateGroups(rows: LeadImportRow[]) {
  const groups = new Map<string, LeadImportRow[]>()

  rows.forEach((row) => {
    const key = getDuplicateKey(row)
    if (!key) return

    const existingRows = groups.get(key) ?? []
    groups.set(key, [...existingRows, row])
  })

  return groups
}

function getDuplicateInfo(
  row: LeadImportRow,
  duplicateGroups: Map<string, LeadImportRow[]>
): DuplicateInfo {
  const key = getDuplicateKey(row)

  if (!key) {
    return {
      key: null,
      count: 0,
      otherIds: [],
    }
  }

  const groupRows = duplicateGroups.get(key) ?? []

  return {
    key,
    count: groupRows.length,
    otherIds: groupRows
      .filter((groupRow) => groupRow.id !== row.id)
      .map((groupRow) => groupRow.id),
  }
}

function buildCompanyLookup(companies: Company[]) {
  const lookup = new Map<string, Company>()

  companies.forEach((company) => {
    const nameKey = normalise(company.company_name)
    const domainKey = normalise(company.domain)

    if (nameKey) lookup.set(`name:${nameKey}`, company)
    if (domainKey) lookup.set(`domain:${domainKey}`, company)
  })

  return lookup
}

function buildContactsByCompany(contacts: Contact[]) {
  const lookup = new Map<string, Contact[]>()

  contacts.forEach((contact) => {
    if (!contact.company_id) return

    const existingContacts = lookup.get(contact.company_id) ?? []
    lookup.set(contact.company_id, [...existingContacts, contact])
  })

  return lookup
}

function getExistingMatchInfo(
  row: LeadImportRow,
  companyLookup: Map<string, Company>,
  contactsByCompany: Map<string, Contact[]>
): ExistingMatchInfo {
  const nameKey = normalise(row.lead_company_name)
  const domainKey = normalise(row.domain) || normalise(getEmailDomain(row.email_address))

  const company =
    (nameKey ? companyLookup.get(`name:${nameKey}`) : null) ||
    (domainKey ? companyLookup.get(`domain:${domainKey}`) : null) ||
    null

  if (!company) {
    return {
      company: null,
      matchedContacts: [],
    }
  }

  const rowContacts = getContactDrafts(row)
  const existingContacts = contactsByCompany.get(company.id) ?? []

  const matchedContacts = existingContacts.filter((existingContact) => {
    return rowContacts.some((rowContact) => {
      const rowFirst = normalise(rowContact.first_name)
      const rowLast = normalise(rowContact.last_name)
      const existingFirst = normalise(existingContact.first_name)
      const existingLast = normalise(existingContact.last_name)

      if (!rowFirst || !existingFirst) return false

      if (rowLast || existingLast) {
        return rowFirst === existingFirst && rowLast === existingLast
      }

      return rowFirst === existingFirst
    })
  })

  return {
    company,
    matchedContacts,
  }
}

function rowMatchesSearch(row: LeadImportRow, term: string) {
  if (!term) return true

  const haystack = [
    row.lead_company_name,
    row.contact_name_raw,
    row.first_name,
    row.last_name,
    row.role,
    row.industry,
    row.email_address,
    row.telephone,
    row.domain,
    row.approval_notes,
  ]
    .map((value) => value ?? '')
    .join(' ')
    .toLowerCase()

  return haystack.includes(term)
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

export default function CleanupPage() {
  const [rows, setRows] = useState<LeadImportRow[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState<CleanupFilter>('all')
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  const companyLookup = useMemo(() => buildCompanyLookup(companies), [companies])
  const contactsByCompany = useMemo(() => buildContactsByCompany(contacts), [contacts])
  const duplicateGroups = useMemo(() => buildDuplicateGroups(rows), [rows])

  const duplicateRowsToRemove = useMemo(() => {
    const ids: string[] = []

    duplicateGroups.forEach((groupRows) => {
      if (groupRows.length <= 1) return

      groupRows.slice(1).forEach((row) => {
        ids.push(row.id)
      })
    })

    return ids
  }, [duplicateGroups])

  const existingContactRowsToRemove = useMemo(() => {
    return rows
      .filter((row) => {
        const existingInfo = getExistingMatchInfo(row, companyLookup, contactsByCompany)
        return existingInfo.company && existingInfo.matchedContacts.length > 0
      })
      .map((row) => row.id)
  }, [rows, companyLookup, contactsByCompany])

  const bulkRowsToRemove = useMemo(() => {
    return Array.from(
      new Set([...duplicateRowsToRemove, ...existingContactRowsToRemove])
    )
  }, [duplicateRowsToRemove, existingContactRowsToRemove])

  const bulkApprovalRows = useMemo(() => {
    return rows.filter(
      (row) =>
        row.submitted_for_approval === true &&
        row.review_before_approval !== true &&
        !rowHasBlockingIssues(row)
    )
  }, [rows])

  const stats = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const duplicateInfo = getDuplicateInfo(row, duplicateGroups)
        const existingInfo = getExistingMatchInfo(row, companyLookup, contactsByCompany)

        if (rowNeedsCleanup(row)) acc.needsCleanup += 1
        if (rowIsReady(row)) acc.ready += 1
        if (rowIsSubmitted(row)) acc.submitted += 1
        if (rowNeedsApprovalReview(row)) acc.review += 1
        if (duplicateInfo.count > 1) acc.duplicates += 1
        if (existingInfo.company) acc.existingCompanies += 1
        if (existingInfo.matchedContacts.length > 0) acc.existingContacts += 1

        return acc
      },
      {
        needsCleanup: 0,
        ready: 0,
        submitted: 0,
        review: 0,
        duplicates: 0,
        existingCompanies: 0,
        existingContacts: 0,
      }
    )
  }, [rows, duplicateGroups, companyLookup, contactsByCompany])

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return rows.filter((row) => {
      const duplicateInfo = getDuplicateInfo(row, duplicateGroups)
      const existingInfo = getExistingMatchInfo(row, companyLookup, contactsByCompany)

      if (!rowMatchesSearch(row, term)) return false

      if (filter === 'needs_cleanup') return rowNeedsCleanup(row)
      if (filter === 'ready') return rowIsReady(row)
      if (filter === 'submitted') return rowIsSubmitted(row)
      if (filter === 'review') return rowNeedsApprovalReview(row)
      if (filter === 'duplicates') return duplicateInfo.count > 1
      if (filter === 'existing_company') return Boolean(existingInfo.company)
      if (filter === 'existing_contact') return existingInfo.matchedContacts.length > 0
      if (filter === 'dnc') return Boolean(row.needs_dnc_review)

      return true
    })
  }, [rows, searchTerm, filter, duplicateGroups, companyLookup, contactsByCompany])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))

  const visibleRows = useMemo(() => {
    const start = page * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, page, pageSize])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    setMessage(null)

    const [rowsResult, companiesResult, contactsResult] = await Promise.all([
      supabase
        .from('lead_import_rows')
        .select(leadImportSelect)
        .range(0, MAX_ROWS_TO_LOAD - 1),

      supabase
        .from('companies')
        .select(
          `
          id,
          company_name,
          domain
        `
        )
        .range(0, MAX_REFERENCE_ROWS - 1),

      supabase
        .from('contacts')
        .select(
          `
          id,
          company_id,
          first_name,
          last_name
        `
        )
        .range(0, MAX_REFERENCE_ROWS - 1),
    ])

    if (rowsResult.error) {
      setRows([])
      setErrorMessage(rowsResult.error.message)
    } else {
      setRows((rowsResult.data ?? []) as LeadImportRow[])
    }

    if (companiesResult.error) {
      setCompanies([])
      setErrorMessage(companiesResult.error.message)
    } else {
      setCompanies((companiesResult.data ?? []) as Company[])
    }

    if (contactsResult.error) {
      setContacts([])
      setErrorMessage(contactsResult.error.message)
    } else {
      setContacts((contactsResult.data ?? []) as Contact[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(Math.max(0, totalPages - 1))
    }
  }, [page, totalPages])

  function resetPage() {
    setPage(0)
  }

  const saveRow = useCallback(async (rowId: string, draft: LeadImportRow) => {
    setBusy(rowId)
    setMessage(null)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('lead_import_rows')
      .update(buildSavePayload(draft))
      .eq('id', rowId)
      .select(leadImportSelect)
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      const savedRow = data as LeadImportRow

      setRows((currentRows) =>
        currentRows.map((row) => (row.id === rowId ? savedRow : row))
      )

      setMessage('Row saved.')
    }

    setBusy(null)
  }, [])

  const submitForApproval = useCallback(async (rowId: string, draft: LeadImportRow) => {
    setBusy(rowId)
    setMessage(null)
    setErrorMessage(null)

    if (rowHasBlockingIssues(draft)) {
      setErrorMessage('This row still has cleanup issues. Fix them before submitting.')
      setBusy(null)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('lead_import_rows')
      .update({
        ...buildSavePayload(draft),
        submitted_for_approval: true,
        submitted_at: new Date().toISOString(),
        submitted_by: user?.id ?? null,
      })
      .eq('id', rowId)
      .select(leadImportSelect)
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      const submittedRow = data as LeadImportRow

      setRows((currentRows) =>
        currentRows.map((row) => (row.id === rowId ? submittedRow : row))
      )

      setMessage('Row submitted for approval.')
    }

    setBusy(null)
  }, [])

  const unsubmitRow = useCallback(async (rowId: string) => {
    setBusy(rowId)
    setMessage(null)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('lead_import_rows')
      .update({
        submitted_for_approval: false,
        submitted_at: null,
        submitted_by: null,
      })
      .eq('id', rowId)
      .select(leadImportSelect)
      .single()

    if (error) {
      setErrorMessage(error.message)
    } else {
      const savedRow = data as LeadImportRow

      setRows((currentRows) =>
        currentRows.map((row) => (row.id === rowId ? savedRow : row))
      )

      setMessage('Row returned to cleanup queue.')
    }

    setBusy(null)
  }, [])

  const removeRow = useCallback(async (rowId: string) => {
    const confirmed = window.confirm('Remove this import row?')
    if (!confirmed) return

    setBusy(rowId)
    setMessage(null)
    setErrorMessage(null)

    const { error } = await supabase.from('lead_import_rows').delete().eq('id', rowId)

    if (error) {
      setErrorMessage(error.message)
    } else {
      setRows((currentRows) => currentRows.filter((row) => row.id !== rowId))
      setMessage('Import row removed.')
    }

    setBusy(null)
  }, [])

  const removeAllDuplicates = useCallback(async () => {
    if (bulkRowsToRemove.length === 0) {
      setMessage('No duplicate or already-existing contact rows found.')
      return
    }

    const confirmed = window.confirm(
      `Remove ${bulkRowsToRemove.length} row${
        bulkRowsToRemove.length === 1 ? '' : 's'
      }? This removes repeated import duplicates and rows where the company/contact already exists in your CRM.`
    )

    if (!confirmed) return

    setBusy('bulk-duplicates')
    setMessage(null)
    setErrorMessage(null)

    const chunks = chunkArray(bulkRowsToRemove, 100)

    for (const chunk of chunks) {
      const { error } = await supabase.from('lead_import_rows').delete().in('id', chunk)

      if (error) {
        setErrorMessage(error.message)
        setBusy(null)
        return
      }
    }

    const deletedIds = new Set(bulkRowsToRemove)

    setRows((currentRows) => currentRows.filter((row) => !deletedIds.has(row.id)))

    setMessage(
      `${bulkRowsToRemove.length} row${
        bulkRowsToRemove.length === 1 ? '' : 's'
      } removed.`
    )

    setBusy(null)
  }, [bulkRowsToRemove])

  const removeDuplicateRowsForRow = useCallback(
    async (row: LeadImportRow) => {
      const duplicateInfo = getDuplicateInfo(row, duplicateGroups)
      const existingInfo = getExistingMatchInfo(row, companyLookup, contactsByCompany)

      const idsToRemove = new Set<string>()

      duplicateInfo.otherIds.forEach((id) => idsToRemove.add(id))

      if (existingInfo.company && existingInfo.matchedContacts.length > 0) {
        idsToRemove.add(row.id)
      }

      const ids = Array.from(idsToRemove)

      if (ids.length === 0) {
        setMessage('No duplicate rows found for this row.')
        return
      }

      const confirmed = window.confirm(
        `Remove ${ids.length} duplicate/already-existing row${
          ids.length === 1 ? '' : 's'
        }?`
      )

      if (!confirmed) return

      setBusy(row.id)
      setMessage(null)
      setErrorMessage(null)

      const { error } = await supabase.from('lead_import_rows').delete().in('id', ids)

      if (error) {
        setErrorMessage(error.message)
      } else {
        const deletedIds = new Set(ids)
        setRows((currentRows) => currentRows.filter((item) => !deletedIds.has(item.id)))
        setMessage('Duplicate/already-existing rows removed.')
      }

      setBusy(null)
    },
    [duplicateGroups, companyLookup, contactsByCompany]
  )

  const approveRow = useCallback(async (row: LeadImportRow) => {
    const companyName = clean(row.lead_company_name)
    const industry = clean(row.industry)
    const domain = clean(row.domain)
    const telephone = clean(row.telephone)
    const role = clean(row.role)

    if (!companyName) {
      throw new Error('Company name is required.')
    }

    if (rowHasBlockingIssues(row)) {
      throw new Error('This row still has cleanup issues.')
    }

    const rowContacts = getContactDrafts(row)

    if (rowContacts.length === 0) {
      throw new Error('At least one contact is required.')
    }

    const { data: existingCompany, error: existingCompanyError } = await supabase
      .from('companies')
      .select('id')
      .ilike('company_name', companyName)
      .limit(1)
      .maybeSingle()

    if (existingCompanyError) {
      throw new Error(existingCompanyError.message)
    }

    let companyId = existingCompany?.id as string | undefined

    if (!companyId) {
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          company_name: companyName,
          industry,
          domain,
        })
        .select('id')
        .single()

      if (companyError) {
        throw new Error(companyError.message)
      }

      companyId = newCompany.id as string
    }

    for (const contact of rowContacts) {
      const firstName = clean(contact.first_name)
      const lastName = clean(contact.last_name)

      if (!firstName) continue

      let existingContactQuery = supabase
        .from('contacts')
        .select('id')
        .eq('company_id', companyId)
        .eq('first_name', firstName)
        .limit(1)

      if (lastName) {
        existingContactQuery = existingContactQuery.eq('last_name', lastName)
      } else {
        existingContactQuery = existingContactQuery.is('last_name', null)
      }

      const { data: existingContact, error: existingContactError } =
        await existingContactQuery.maybeSingle()

      if (existingContactError) {
        throw new Error(existingContactError.message)
      }

      if (!existingContact) {
        const { error: contactError } = await supabase.from('contacts').insert({
          company_id: companyId,
          first_name: firstName,
          last_name: lastName,
          role,
          telephone,
        })

        if (contactError) {
          throw new Error(contactError.message)
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('lead_import_rows')
      .delete()
      .eq('id', row.id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }
  }, [])

  const approveSingleSubmittedRow = useCallback(
    async (rowId: string, draft: LeadImportRow) => {
      if (!draft.submitted_for_approval) {
        setErrorMessage('This row has not been submitted yet.')
        return
      }

      setBusy(rowId)
      setMessage(null)
      setErrorMessage(null)

      try {
        const { data, error } = await supabase
          .from('lead_import_rows')
          .update(buildSavePayload(draft))
          .eq('id', rowId)
          .select(leadImportSelect)
          .single()

        if (error) {
          throw new Error(error.message)
        }

        const savedRow = data as LeadImportRow

        await approveRow(savedRow)

        setRows((currentRows) => currentRows.filter((row) => row.id !== rowId))
        setMessage('Submitted row approved.')
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to approve row.')
      }

      setBusy(null)
    },
    [approveRow]
  )

  const approveAllSubmittedRows = useCallback(async () => {
    if (bulkApprovalRows.length === 0) {
      setMessage('No submitted rows are ready for bulk approval.')
      return
    }

    const confirmed = window.confirm(
      `Approve ${bulkApprovalRows.length} submitted row${
        bulkApprovalRows.length === 1 ? '' : 's'
      }? Rows marked "review before approval" will be skipped.`
    )

    if (!confirmed) return

    setBusy('bulk-approve')
    setMessage(null)
    setErrorMessage(null)

    const approvedIds: string[] = []

    try {
      for (const row of bulkApprovalRows) {
        await approveRow(row)
        approvedIds.push(row.id)
      }

      const approvedSet = new Set(approvedIds)

      setRows((currentRows) => currentRows.filter((row) => !approvedSet.has(row.id)))

      setMessage(
        `${approvedIds.length} submitted row${
          approvedIds.length === 1 ? '' : 's'
        } approved.`
      )

      await fetchData()
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Bulk approval stopped: ${error.message}`
          : 'Bulk approval stopped because a row failed.'
      )
    }

    setBusy(null)
  }, [approveRow, bulkApprovalRows, fetchData])

  return (
    <>
      <AppHeader />

      <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-stone-950">
                Cleanup & approval
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-stone-600">
                Edit imported rows, submit clean rows for approval, review submitted
                rows where needed, then approve them into companies and contacts.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={removeAllDuplicates}
                disabled={loading || busy !== null || bulkRowsToRemove.length === 0}
                className={`${buttonClass} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
              >
                {busy === 'bulk-duplicates' ? 'Removing...' : 'Remove all duplicates'}
              </button>

              <button
                type="button"
                onClick={approveAllSubmittedRows}
                disabled={loading || busy !== null || bulkApprovalRows.length === 0}
                className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
              >
                {busy === 'bulk-approve'
                  ? 'Approving...'
                  : `Approve submitted (${bulkApprovalRows.length})`}
              </button>

              <button
                type="button"
                onClick={fetchData}
                disabled={loading}
                className={`${buttonClass} bg-stone-900 text-white hover:bg-stone-700`}
              >
                Refresh
              </button>
            </div>
          </div>

          <section className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-7">
            <StatCard label="Rows" value={rows.length} />
            <StatCard label="Needs cleanup" value={stats.needsCleanup} />
            <StatCard label="Ready" value={stats.ready} />
            <StatCard label="Submitted" value={stats.submitted} />
            <StatCard label="Needs review" value={stats.review} />
            <StatCard label="Duplicates" value={stats.duplicates} />
            <StatCard label="Existing contacts" value={stats.existingContacts} />
          </section>

          {bulkRowsToRemove.length > 0 ? (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-bold">
                {bulkRowsToRemove.length} row
                {bulkRowsToRemove.length === 1 ? '' : 's'} can be removed.
              </p>

              <p className="mt-1">
                This includes {duplicateRowsToRemove.length} repeated import duplicate
                {duplicateRowsToRemove.length === 1 ? '' : 's'} and{' '}
                {existingContactRowsToRemove.length} row
                {existingContactRowsToRemove.length === 1 ? '' : 's'} where the company
                and named contact already exist.
              </p>
            </div>
          ) : null}

          <section className="mb-6 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-[1fr_260px_180px] lg:items-end">
              <div>
                <label className={labelClass}>Search</label>
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value)
                    resetPage()
                  }}
                  placeholder="Search company, contact, email, phone, domain..."
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Filter</label>
                <select
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value as CleanupFilter)
                    resetPage()
                  }}
                  className={inputClass}
                >
                  <option value="all">All rows</option>
                  <option value="needs_cleanup">Needs cleanup</option>
                  <option value="ready">Ready to submit</option>
                  <option value="submitted">Submitted</option>
                  <option value="review">Submitted - needs review</option>
                  <option value="duplicates">Duplicates</option>
                  <option value="existing_company">Existing company</option>
                  <option value="existing_contact">Existing named contact</option>
                  <option value="dnc">DNC review</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Rows per page</label>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value))
                    resetPage()
                  }}
                  className={inputClass}
                >
                  {PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {message ? (
            <div className="mb-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-800">
              {message}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              {errorMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center text-sm font-semibold text-stone-500 shadow-sm">
              Loading cleanup rows...
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center shadow-sm">
              <p className="text-lg font-bold text-stone-950">No rows found</p>
              <p className="mt-2 text-sm text-stone-600">
                Try changing the search or filter.
              </p>
            </div>
          ) : (
            <section className="space-y-4">
              {visibleRows.map((row, index) => (
                <CleanupRowCard
                  key={row.id}
                  row={row}
                  rowNumber={page * pageSize + index + 1}
                  busy={busy === row.id}
                  duplicateGroups={duplicateGroups}
                  companyLookup={companyLookup}
                  contactsByCompany={contactsByCompany}
                  onSave={saveRow}
                  onSubmit={submitForApproval}
                  onUnsubmit={unsubmitRow}
                  onApproveSubmitted={approveSingleSubmittedRow}
                  onRemove={removeRow}
                  onRemoveDuplicates={removeDuplicateRowsForRow}
                />
              ))}
            </section>
          )}

          <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing{' '}
              <span className="font-bold text-stone-900">{filteredRows.length}</span>{' '}
              matching row{filteredRows.length === 1 ? '' : 's'} · Page{' '}
              <span className="font-bold text-stone-900">{page + 1}</span> of{' '}
              <span className="font-bold text-stone-900">{totalPages}</span>
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                className={`${buttonClass} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
              >
                Previous
              </button>

              <button
                type="button"
                disabled={page + 1 >= totalPages || loading}
                onClick={() =>
                  setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))
                }
                className={`${buttonClass} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-stone-950">{value}</p>
    </div>
  )
}

type CleanupRowCardProps = {
  row: LeadImportRow
  rowNumber: number
  busy: boolean
  duplicateGroups: Map<string, LeadImportRow[]>
  companyLookup: Map<string, Company>
  contactsByCompany: Map<string, Contact[]>
  onSave: (rowId: string, draft: LeadImportRow) => Promise<void>
  onSubmit: (rowId: string, draft: LeadImportRow) => Promise<void>
  onUnsubmit: (rowId: string) => Promise<void>
  onApproveSubmitted: (rowId: string, draft: LeadImportRow) => Promise<void>
  onRemove: (rowId: string) => Promise<void>
  onRemoveDuplicates: (row: LeadImportRow) => Promise<void>
}

const CleanupRowCard = memo(function CleanupRowCard({
  row,
  rowNumber,
  busy,
  duplicateGroups,
  companyLookup,
  contactsByCompany,
  onSave,
  onSubmit,
  onUnsubmit,
  onApproveSubmitted,
  onRemove,
  onRemoveDuplicates,
}: CleanupRowCardProps) {
  const [draft, setDraft] = useState<LeadImportRow>(row)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setDraft(row)
    setDirty(false)
  }, [row])

  const contactDrafts = useMemo(() => getContactDrafts(draft), [draft])

  const duplicateInfo = useMemo(
    () => getDuplicateInfo(draft, duplicateGroups),
    [draft, duplicateGroups]
  )

  const existingInfo = useMemo(
    () => getExistingMatchInfo(draft, companyLookup, contactsByCompany),
    [draft, companyLookup, contactsByCompany]
  )

  const companyName = getCompanyDisplayName(draft)

  const needsCompany = !clean(draft.lead_company_name)
  const needsName = rowNeedsNameCleanup(draft)
  const needsEmail = rowNeedsEmailCleanup(draft)
  const needsDnc = Boolean(draft.needs_dnc_review)
  const isSubmitted = rowIsSubmitted(draft)
  const isReady = rowIsReady(draft)
  const needsReview = rowNeedsApprovalReview(draft)

  function updateField(
    field:
      | 'lead_company_name'
      | 'contact_name_raw'
      | 'first_name'
      | 'last_name'
      | 'role'
      | 'industry'
      | 'email_address'
      | 'telephone'
      | 'domain'
      | 'approval_notes',
    value: string
  ) {
    setDirty(true)
    setDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updateBooleanField(
    field: 'needs_dnc_review' | 'review_before_approval',
    value: boolean
  ) {
    setDirty(true)
    setDraft((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function splitNameIntoFields() {
    const contacts = splitContactName(draft.contact_name_raw)
    if (contacts.length === 0) return

    setDirty(true)
    setDraft((current) => ({
      ...current,
      first_name: contacts[0].first_name,
      last_name: contacts[0].last_name,
    }))
  }

  return (
    <article
      className={`overflow-hidden rounded-3xl border bg-white shadow-sm ${
        isSubmitted ? 'border-green-300 ring-2 ring-green-100' : 'border-stone-200'
      }`}
    >
      <div className="border-b border-stone-200 bg-stone-50 px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="dark">Row {rowNumber}</Badge>

              {dirty ? <Badge tone="blue">Unsaved changes</Badge> : null}
              {isSubmitted ? <Badge tone="green">Submitted</Badge> : null}
              {needsReview ? <Badge tone="purple">Needs approval review</Badge> : null}
              {isReady ? <Badge tone="green">Ready to submit</Badge> : null}

              {!isSubmitted && needsCompany ? (
                <Badge tone="amber">Company missing</Badge>
              ) : null}
              {!isSubmitted && needsName ? <Badge tone="amber">Name cleanup</Badge> : null}
              {!isSubmitted && needsEmail ? <Badge tone="amber">Email cleanup</Badge> : null}
              {!isSubmitted && needsDnc ? <Badge tone="amber">DNC review</Badge> : null}

              {duplicateInfo.count > 1 ? (
                <Badge tone="red">Import duplicate ({duplicateInfo.count})</Badge>
              ) : null}

              {existingInfo.company ? <Badge tone="blue">Company exists</Badge> : null}

              {existingInfo.matchedContacts.length > 0 ? (
                <Badge tone="red">
                  Existing named contact ({existingInfo.matchedContacts.length})
                </Badge>
              ) : null}

              {contactDrafts.length > 1 ? (
                <Badge tone="purple">Creates {contactDrafts.length} contacts</Badge>
              ) : null}
            </div>

            <h2 className="text-xl font-bold text-stone-950">{companyName}</h2>

            <p className="mt-1 text-sm text-stone-600">
              {contactDrafts.length > 0
                ? contactDrafts.map(getContactDisplayName).join(', ')
                : clean(draft.email_address) || 'No contact name'}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSave(row.id, draft)}
              disabled={busy || !dirty}
              className={`${buttonClass} border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
            >
              {busy ? 'Saving...' : 'Save changes'}
            </button>

            {isSubmitted ? (
              <>
                <button
                  type="button"
                  onClick={() => onApproveSubmitted(row.id, draft)}
                  disabled={busy}
                  className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
                >
                  Approve now
                </button>

                <button
                  type="button"
                  onClick={() => onUnsubmit(row.id)}
                  disabled={busy}
                  className={`${buttonClass} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
                >
                  Unsubmit
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onSubmit(row.id, draft)}
                disabled={busy || !isReady}
                className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
              >
                Submit for approval
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 xl:grid-cols-[1fr_1fr_320px]">
        <section>
          <h3 className="mb-3 text-sm font-bold text-stone-950">Company details</h3>

          <div className="space-y-4">
            <Field
              label="Company name"
              value={draft.lead_company_name}
              onChange={(value) => updateField('lead_company_name', value)}
              warning={!isSubmitted && needsCompany ? 'Required before submitting.' : null}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Industry"
                value={draft.industry}
                onChange={(value) => updateField('industry', value)}
              />

              <Field
                label="Domain"
                value={draft.domain}
                onChange={(value) => updateField('domain', value)}
              />
            </div>

            {existingInfo.company ? (
              <InfoBox tone="blue">
                <strong>Existing company found:</strong>{' '}
                {clean(existingInfo.company.company_name) || 'Unnamed company'}
              </InfoBox>
            ) : null}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-sm font-bold text-stone-950">Contact details</h3>

          <div className="space-y-4">
            <div>
              <label className={labelClass}>Raw contact name</label>
              <div className="flex gap-2">
                <input
                  value={draft.contact_name_raw ?? ''}
                  onChange={(event) => updateField('contact_name_raw', event.target.value)}
                  className={inputClass}
                />

                <button
                  type="button"
                  onClick={splitNameIntoFields}
                  disabled={busy || !clean(draft.contact_name_raw)}
                  className={`${buttonClass} whitespace-nowrap border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
                >
                  Split
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="First name"
                value={draft.first_name}
                onChange={(value) => updateField('first_name', value)}
                warning={!isSubmitted && needsName ? 'Required before submitting.' : null}
              />

              <Field
                label="Last name"
                value={draft.last_name}
                onChange={(value) => updateField('last_name', value)}
              />
            </div>

            <Field
              label="Role"
              value={draft.role}
              onChange={(value) => updateField('role', value)}
            />

            {contactDrafts.length > 1 ? (
              <InfoBox tone="purple">
                <strong>This row will create multiple contacts:</strong>{' '}
                {contactDrafts.map(getContactDisplayName).join(', ')}
              </InfoBox>
            ) : null}

            {existingInfo.matchedContacts.length > 0 ? (
              <InfoBox tone="red">
                <strong>Same named contact already exists:</strong>{' '}
                {existingInfo.matchedContacts.map(getContactDisplayName).join(', ')}
              </InfoBox>
            ) : null}
          </div>
        </section>

        <aside>
          <h3 className="mb-3 text-sm font-bold text-stone-950">Checks & actions</h3>

          <div className="space-y-4">
            {duplicateInfo.count > 1 ? (
              <InfoBox tone="red">
                <strong>Import duplicate rows found:</strong> {duplicateInfo.count} rows
                match this company/contact.
              </InfoBox>
            ) : null}

            {existingInfo.company && existingInfo.matchedContacts.length > 0 ? (
              <InfoBox tone="red">
                <strong>Already exists in CRM:</strong> this row can be removed because
                the company and named contact already exist.
              </InfoBox>
            ) : null}

            <Field
              label="Email"
              value={draft.email_address}
              onChange={(value) => updateField('email_address', value)}
              warning={!isSubmitted && needsEmail ? 'Email format needs checking.' : null}
            />

            <Field
              label="Telephone"
              value={draft.telephone}
              onChange={(value) => updateField('telephone', value)}
            />

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${
                draft.needs_dnc_review
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-stone-200 bg-stone-50'
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(draft.needs_dnc_review)}
                onChange={(event) =>
                  updateBooleanField('needs_dnc_review', event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-stone-300"
              />
              <span>
                <span className="block text-sm font-bold text-stone-900">
                  Needs DNC review
                </span>
                <span className="mt-1 block text-xs text-stone-600">
                  Untick this once this row is safe to submit.
                </span>
              </span>
            </label>

            <label
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${
                draft.review_before_approval
                  ? 'border-purple-300 bg-purple-50'
                  : 'border-stone-200 bg-stone-50'
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(draft.review_before_approval)}
                onChange={(event) =>
                  updateBooleanField('review_before_approval', event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-stone-300"
              />
              <span>
                <span className="block text-sm font-bold text-stone-900">
                  Review before approval
                </span>
                <span className="mt-1 block text-xs text-stone-600">
                  Bulk approval skips rows with this ticked.
                </span>
              </span>
            </label>

            <div>
              <label className={labelClass}>Approval notes</label>
              <textarea
                value={draft.approval_notes ?? ''}
                onChange={(event) => updateField('approval_notes', event.target.value)}
                rows={3}
                className={inputClass}
              />
            </div>

            <div className="grid gap-2">
              {duplicateInfo.count > 1 ||
              (existingInfo.company && existingInfo.matchedContacts.length > 0) ? (
                <button
                  type="button"
                  onClick={() => onRemoveDuplicates(draft)}
                  disabled={busy}
                  className={`${buttonClass} border border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
                >
                  Remove duplicate/already-existing row
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => onRemove(row.id)}
                disabled={busy}
                className={`${buttonClass} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`}
              >
                Remove this row
              </button>
            </div>
          </div>
        </aside>
      </div>
    </article>
  )
})

function Field({
  label,
  value,
  onChange,
  warning,
}: {
  label: string
  value: string | null
  onChange: (value: string) => void
  warning?: string | null
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} ${
          warning ? 'border-amber-400 bg-amber-50 focus:border-amber-500' : ''
        }`}
      />

      {warning ? <p className="mt-1 text-xs font-bold text-amber-700">{warning}</p> : null}
    </div>
  )
}

function Badge({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'dark' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
}) {
  const classes = {
    dark: 'bg-stone-900 text-white',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    purple: 'bg-purple-100 text-purple-800',
  }

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${classes[tone]}`}>
      {children}
    </span>
  )
}

function InfoBox({
  children,
  tone,
}: {
  children: ReactNode
  tone: 'blue' | 'red' | 'purple'
}) {
  const classes = {
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    purple: 'border-purple-200 bg-purple-50 text-purple-800',
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${classes[tone]}`}>
      {children}
    </div>
  )
}