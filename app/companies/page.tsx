'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type DbRow = Record<string, unknown>

type CompanyRow = DbRow & {
  id: string
}

type ContactRow = DbRow & {
  id: string
}

type CampaignHistoryRow = DbRow & {
  id: string
  campaign?: DbRow | null
}

type CompanyView = {
  id: string
  raw: CompanyRow
  contacts: ContactRow[]
  campaignHistory: CampaignHistoryRow[]
}

type RelationshipStatus =
  | 'prospect'
  | 'customer'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

type CompanyEditDraft = {
  companyName: string
  industry: string
  location: string
  sizeBand: string
  domain: string
  lastContactDate: string
  dnc: boolean
  relationshipStatus: RelationshipStatus
}

type RelationshipFilter =
  | 'all'
  | 'prospects'
  | 'customers'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

type DncFilter = 'all' | 'dnc' | 'not-dnc'

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<CompanyView[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [relationshipFilter, setRelationshipFilter] =
    useState<RelationshipFilter>('all')
  const [dncFilter, setDncFilter] = useState<DncFilter>('all')
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [selectedLocations, setSelectedLocations] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<CompanyEditDraft | null>(null)
  const [logCompanyUpdate, setLogCompanyUpdate] = useState(true)

  const industryOptions = useMemo(() => {
    return Array.from(
      new Set(
        companies
          .map((company) => getCompanyIndustry(company.raw))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort()
  }, [companies])

  const locationOptions = useMemo(() => {
    return Array.from(
      new Set(
        companies
          .map((company) => getCompanyLocation(company.raw))
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort()
  }, [companies])

  const relationshipCounts = useMemo(() => {
    const counts: Record<RelationshipStatus, number> = {
      prospect: 0,
      customer: 0,
      quoted: 0,
      bounced: 0,
      negative: 0,
      'no-answer': 0,
      other: 0,
    }

    companies.forEach((company) => {
      const status = getRelationshipStatus(company)
      counts[status] += 1
    })

    return counts
  }, [companies])

  const dncCount = useMemo(() => {
    return companies.filter((company) => getCompanyDnc(company.raw)).length
  }, [companies])

  const filteredCompanies = useMemo(() => {
    const cleanedSearch = searchTerm.trim().toLowerCase()

    return companies.filter((company) => {
      const relationshipStatus = getRelationshipStatus(company)
      const industry = getCompanyIndustry(company.raw)
      const location = getCompanyLocation(company.raw)

      const contactSearchText = company.contacts
        .map((contact) =>
          [
            getContactName(contact),
            getContactEmail(contact),
            getContactOutcome(contact),
            getContactRole(contact),
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ')

      const campaignSearchText = company.campaignHistory
        .map((history) =>
          [
            getString(history, ['email_status']),
            getString(history, ['outcome']),
            getString(history.campaign || {}, ['name', 'campaign_name']),
          ]
            .filter(Boolean)
            .join(' '),
        )
        .join(' ')

      const matchesSearch =
        !cleanedSearch ||
        [
          getCompanyName(company.raw),
          getCompanyIndustry(company.raw),
          getCompanyLocation(company.raw),
          getCompanyDomain(company.raw),
          getManualRelationshipLabel(company.raw),
          contactSearchText,
          campaignSearchText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(cleanedSearch)

      const matchesRelationship =
        relationshipFilter === 'all' ||
        (relationshipFilter === 'prospects' &&
          relationshipStatus === 'prospect') ||
        (relationshipFilter === 'customers' &&
          relationshipStatus === 'customer') ||
        (relationshipFilter === 'quoted' && relationshipStatus === 'quoted') ||
        (relationshipFilter === 'bounced' && relationshipStatus === 'bounced') ||
        (relationshipFilter === 'negative' &&
          relationshipStatus === 'negative') ||
        (relationshipFilter === 'no-answer' &&
          relationshipStatus === 'no-answer') ||
        (relationshipFilter === 'other' && relationshipStatus === 'other')

      const matchesDnc =
        dncFilter === 'all' ||
        (dncFilter === 'dnc' && getCompanyDnc(company.raw)) ||
        (dncFilter === 'not-dnc' && !getCompanyDnc(company.raw))

      const matchesIndustry =
        selectedIndustries.length === 0 ||
        selectedIndustries.includes(industry || '')

      const matchesLocation =
        selectedLocations.length === 0 ||
        (location
          ? selectedLocations.includes(location)
          : selectedLocations.includes('__unknown__'))

      return (
        matchesSearch &&
        matchesRelationship &&
        matchesDnc &&
        matchesIndustry &&
        matchesLocation
      )
    })
  }, [
    companies,
    searchTerm,
    relationshipFilter,
    dncFilter,
    selectedIndustries,
    selectedLocations,
  ])

  const editingCompany = editingId
    ? companies.find((company) => company.id === editingId) || null
    : null

  async function loadCompanies() {
    setLoading(true)
    setMessage('')
    setErrorMessage('')
    setWarningMessage('')

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')

    if (companyError) {
      setErrorMessage(companyError.message)
      setLoading(false)
      return
    }

    const companyRows = ((companyData ?? []) as DbRow[])
      .filter(isRowWithId)
      .map((row) => row as CompanyRow)

    let contactRows: ContactRow[] = []
    let campaignHistoryRows: CampaignHistoryRow[] = []
    let campaignRows: DbRow[] = []
    const warnings: string[] = []

    const { data: contactsData, error: contactsError } = await supabase
      .from('contacts')
      .select('*')

    if (contactsError) {
      warnings.push(`Contacts could not be loaded: ${contactsError.message}`)
    } else {
      contactRows = ((contactsData ?? []) as DbRow[])
        .filter(isRowWithId)
        .map((row) => row as ContactRow)
    }

    const { data: campaignsData, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')

    if (campaignsError) {
      warnings.push(
        `Campaign names could not be loaded: ${campaignsError.message}`,
      )
    } else {
      campaignRows = (campaignsData ?? []) as DbRow[]
    }

    const campaignsById = new Map<string, DbRow>()

    campaignRows.forEach((campaign) => {
      const campaignId = getString(campaign, ['id'])
      if (campaignId) campaignsById.set(campaignId, campaign)
    })

    const { data: campaignCompanyData, error: campaignCompanyError } =
      await supabase.from('campaign_companies').select('*')

    if (campaignCompanyError) {
      warnings.push(
        `Campaign history could not be loaded: ${campaignCompanyError.message}`,
      )
    } else {
      campaignHistoryRows = ((campaignCompanyData ?? []) as DbRow[])
        .filter(isRowWithId)
        .map((row) => {
          const campaignId = getString(row, ['campaign_id'])

          return {
            ...(row as CampaignHistoryRow),
            campaign: campaignId ? campaignsById.get(campaignId) || null : null,
          }
        })
    }

    const contactsByCompanyId = new Map<string, ContactRow[]>()

    contactRows.forEach((contact) => {
      const companyId = getString(contact, ['company_id'])
      if (!companyId) return

      const current = contactsByCompanyId.get(companyId) || []
      current.push(contact)
      contactsByCompanyId.set(companyId, current)
    })

    const campaignHistoryByCompanyId = new Map<string, CampaignHistoryRow[]>()

    campaignHistoryRows.forEach((history) => {
      const companyId = getString(history, ['company_id'])
      if (!companyId) return

      const current = campaignHistoryByCompanyId.get(companyId) || []
      current.push(history)
      campaignHistoryByCompanyId.set(companyId, current)
    })

    const companyViews = companyRows
      .map((company) => ({
        id: company.id,
        raw: company,
        contacts: contactsByCompanyId.get(company.id) || [],
        campaignHistory: campaignHistoryByCompanyId.get(company.id) || [],
      }))
      .sort((a, b) =>
        getCompanyName(a.raw).localeCompare(getCompanyName(b.raw)),
      )

    setCompanies(companyViews)
    setWarningMessage(warnings.join(' '))
    setLoading(false)
  }

  useEffect(() => {
    // The initial company load only runs once when this page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCompanies()
  }, [])

  function resetFilters() {
    setSearchTerm('')
    setRelationshipFilter('all')
    setDncFilter('all')
    setSelectedIndustries([])
    setSelectedLocations([])
    setMessage('')
    setErrorMessage('')
  }

  function startEdit(company: CompanyView) {
    setEditingId(company.id)
    setEditDraft({
      companyName: getCompanyName(company.raw),
      industry: getCompanyIndustry(company.raw),
      location: getCompanyLocation(company.raw),
      sizeBand: getCompanySizeBand(company.raw),
      domain: getCompanyDomain(company.raw),
      lastContactDate: toDateInputValue(getCompanyLastContactDate(company.raw)),
      dnc: getCompanyDnc(company.raw),
      relationshipStatus: getRelationshipStatus(company),
    })
    setLogCompanyUpdate(true)
    setMessage('')
    setErrorMessage('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
    setSavingId(null)
    setMessage('')
    setErrorMessage('')
  }

  function updateDraft(
    field: keyof CompanyEditDraft,
    value: string | boolean | RelationshipStatus,
  ) {
    setEditDraft((current) => {
      if (!current) return current

      return {
        ...current,
        [field]: value,
      }
    })
  }

  async function saveCompany(company: CompanyView) {
    if (!editDraft) return

    const changeSummary = describeCompanyChanges(company, editDraft)
    setSavingId(company.id)
    setMessage('')
    setErrorMessage('')

    const payload: DbRow = {}

    const nameKey = findFirstExistingKey(company.raw, [
      'company_name',
      'business_name',
      'name',
    ])

    if (!nameKey) {
      setErrorMessage(
        'Could not find a company name column. Expected company_name, business_name or name.',
      )
      setSavingId(null)
      return
    }

    payload[nameKey] = cleanText(editDraft.companyName)

    setPayloadIfColumnExists(payload, company.raw, ['industry'], editDraft.industry)
    setPayloadIfColumnExists(payload, company.raw, ['location', 'town'], editDraft.location)
    setPayloadIfColumnExists(payload, company.raw, ['size_band'], editDraft.sizeBand)
    setPayloadIfColumnExists(payload, company.raw, ['domain', 'website'], editDraft.domain)
    setPayloadIfColumnExists(
      payload,
      company.raw,
      ['last_contact_date'],
      editDraft.lastContactDate,
    )

    payload.relationship_status = toDbRelationshipStatus(
      editDraft.relationshipStatus,
    )

    setBooleanPayloadIfColumnExists(
      payload,
      company.raw,
      ['dnc', 'is_dnc', 'do_not_contact'],
      editDraft.dnc,
    )

    if ('updated_at' in company.raw) {
      payload.updated_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', company.id)
      .select('*')

    if (error) {
      setErrorMessage(error.message)
      setSavingId(null)
      return
    }

    const updatedRow = ((data ?? []) as DbRow[]).find(
      (row) => getString(row, ['id']) === company.id,
    )

    if (!updatedRow) {
      setErrorMessage(
        'No company row was updated. This is usually caused by Supabase RLS blocking updates.',
      )
      setSavingId(null)
      return
    }

    setCompanies((current) =>
      current
        .map((item) =>
          item.id === company.id
            ? {
                ...item,
                raw: updatedRow as CompanyRow,
              }
            : item,
        )
        .sort((a, b) =>
          getCompanyName(a.raw).localeCompare(getCompanyName(b.raw)),
        ),
    )

    let activityLogged = false
    if (logCompanyUpdate && changeSummary) {
      const { error: activityError } = await supabase
        .from('crm_activities')
        .insert({
          company_id: company.id,
          activity_type: 'company_update',
          summary: changeSummary,
        })

      if (activityError) {
        setWarningMessage(
          `Company saved, but its activity could not be logged: ${activityError.message}`,
        )
      } else {
        activityLogged = true
      }
    }

    setMessage(
      activityLogged
        ? 'Company updated and added to recent activity.'
        : 'Company updated.',
    )
    setSavingId(null)
    setEditingId(null)
    setEditDraft(null)
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
              Companies
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review, filter and manage companies.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Search companies, update relationship status, open full company
              records, review contacts and see which campaigns each company has
              been selected for.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-5">
          <SummaryCard label="Total companies" value={companies.length} />

          <SummaryCard
            label="Visible companies"
            value={filteredCompanies.length}
          />

          <SummaryCard
            label="Customers"
            value={relationshipCounts.customer}
            urgent={relationshipCounts.customer > 0}
          />

          <SummaryCard
            label="Quoted"
            value={relationshipCounts.quoted}
            urgent={relationshipCounts.quoted > 0}
          />

          <SummaryCard
            label="DNC companies"
            value={dncCount}
            urgent={dncCount > 0}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Company filters
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Relationship can now be updated directly. If no manual value is
                present, the page falls back to contact and campaign history.
              </p>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="w-fit rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold transition hover:bg-stone-50"
            >
              Reset filters
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Search
              </span>

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search company, contact, campaign, industry, location..."
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              />
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Relationship
              </span>

              <select
                value={relationshipFilter}
                onChange={(event) =>
                  setRelationshipFilter(
                    event.target.value as RelationshipFilter,
                  )
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="all">All relationships</option>
                <option value="prospects">Prospects</option>
                <option value="customers">Customers / won</option>
                <option value="quoted">Quoted / negotiating</option>
                <option value="bounced">Bounced</option>
                <option value="negative">Negative</option>
                <option value="no-answer">No answer</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                DNC
              </span>

              <select
                value={dncFilter}
                onChange={(event) =>
                  setDncFilter(event.target.value as DncFilter)
                }
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
              >
                <option value="all">All companies</option>
                <option value="dnc">DNC only</option>
                <option value="not-dnc">Not DNC</option>
              </select>
            </label>

            <MultiSelectDropdown
              label="Industry"
              emptyLabel="All industries"
              options={industryOptions.map((industry) => ({
                value: industry,
                label: industry,
              }))}
              selectedValues={selectedIndustries}
              onChange={setSelectedIndustries}
            />

            <MultiSelectDropdown
              label="Location"
              emptyLabel="All locations"
              options={[
                { value: '__unknown__', label: 'Unknown' },
                ...locationOptions.map((location) => ({
                  value: location,
                  label: location,
                })),
              ]}
              selectedValues={selectedLocations}
              onChange={setSelectedLocations}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <CountPill
              label="Prospects"
              value={relationshipCounts.prospect}
              tone="good"
            />

            <CountPill
              label="Customers"
              value={relationshipCounts.customer}
              tone="info"
            />

            <CountPill
              label="Quoted"
              value={relationshipCounts.quoted}
              tone="warning"
            />

            <CountPill
              label="Bounced"
              value={relationshipCounts.bounced}
              tone="bad"
            />

            <CountPill
              label="Negative"
              value={relationshipCounts.negative}
              tone="bad"
            />

            <CountPill
              label="No answer"
              value={relationshipCounts['no-answer']}
              tone="neutral"
            />
          </div>

          {message ? (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-semibold text-green-700">
              {message}
            </p>
          ) : null}

          {warningMessage ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              {warningMessage}
            </p>
          ) : null}

          {errorMessage ? (
            <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </div>

        {editingCompany && editDraft ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-company-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !savingId) cancelEdit()
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void saveCompany(editingCompany)
              }}
              className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                    Company details
                  </p>
                  <h2 id="edit-company-title" className="mt-2 text-2xl font-black text-stone-950">
                    Edit {getCompanyName(editingCompany.raw) || 'company'}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Update the main record in one focused form.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={Boolean(savingId)}
                  aria-label="Close editor"
                  className="rounded-xl border border-stone-200 px-3 py-2 font-black text-stone-500 hover:bg-stone-50"
                >
                  ✕
                </button>
              </div>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <EditField label="Company name">
                  <EditorInput value={editDraft.companyName} onChange={(value) => updateDraft('companyName', value)} />
                </EditField>
                <EditField label="Relationship">
                  <select
                    value={editDraft.relationshipStatus}
                    onChange={(event) => updateDraft('relationshipStatus', event.target.value as RelationshipStatus)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                  >
                    <option value="prospect">Prospect</option>
                    <option value="quoted">Quoted / negotiating</option>
                    <option value="customer">Customer / won</option>
                    <option value="bounced">Bounced</option>
                    <option value="negative">Negative</option>
                    <option value="no-answer">No answer</option>
                    <option value="other">Other</option>
                  </select>
                </EditField>
                <EditField label="Industry">
                  <EditorInput value={editDraft.industry} onChange={(value) => updateDraft('industry', value)} />
                </EditField>
                <EditField label="Location">
                  <EditorInput value={editDraft.location} onChange={(value) => updateDraft('location', value)} placeholder="Village, town or city" />
                </EditField>
                <EditField label="Size band">
                  <EditorInput value={editDraft.sizeBand} onChange={(value) => updateDraft('sizeBand', value)} placeholder="For example, 15–49" />
                </EditField>
                <EditField label="Website or domain">
                  <EditorInput value={editDraft.domain} onChange={(value) => updateDraft('domain', value)} placeholder="example.co.uk" />
                </EditField>
                <EditField label="Last contact">
                  <input
                    type="date"
                    value={editDraft.lastContactDate}
                    onChange={(event) => updateDraft('lastContactDate', event.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                  />
                </EditField>
                <label className="flex min-h-20 items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={editDraft.dnc}
                    onChange={(event) => updateDraft('dnc', event.target.checked)}
                    className="h-5 w-5 accent-red-600"
                  />
                  <span>
                    <span className="block text-sm font-black text-stone-800">Do not contact</span>
                    <span className="block text-xs text-stone-500">Exclude this company from outreach.</span>
                  </span>
                </label>
                <label className="flex min-h-20 items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={logCompanyUpdate}
                    onChange={(event) => setLogCompanyUpdate(event.target.checked)}
                    className="h-5 w-5 accent-red-600"
                  />
                  <span>
                    <span className="block text-sm font-black text-stone-800">
                      Add to recent activity
                    </span>
                    <span className="block text-xs text-stone-500">
                      Record a summary of the fields that changed.
                    </span>
                  </span>
                </label>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={Boolean(savingId)}
                  className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={Boolean(savingId) || !editDraft.companyName.trim()}
                  className="rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {savingId ? 'Saving changes…' : 'Save company'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-xl font-black text-stone-950">
              Companies table
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Showing {filteredCompanies.length} of {companies.length}{' '}
              companies.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Company</th>
                  <th className="px-4 py-3">Relationship</th>
                  <th className="px-4 py-3">DNC</th>
                  <th className="px-4 py-3">Contacts</th>
                  <th className="px-4 py-3">Campaigns</th>
                  <th className="px-4 py-3">Industry</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Domain</th>
                  <th className="px-4 py-3">Last contact</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={10}>
                      Loading companies...
                    </td>
                  </tr>
                ) : filteredCompanies.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={10}>
                      No companies match these filters.
                    </td>
                  </tr>
                ) : (
                  filteredCompanies.map((company) => {
                    const isEditing = false
                    const relationshipStatus = getRelationshipStatus(company)
                    const latestCampaign = getLatestCampaign(company)
                    const contactCount = company.contacts.length
                    const campaignCount = company.campaignHistory.length

                    return (
                      <tr
                        key={company.id}
                        className="border-t border-stone-100 align-top"
                      >
                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <TableInput
                              value={editDraft.companyName}
                              onChange={(value) =>
                                updateDraft('companyName', value)
                              }
                              placeholder="Company name"
                            />
                          ) : (
                            <div>
                              <Link
                                href={`/companies/${company.id}`}
                                className="font-black text-stone-950 hover:text-red-600"
                              >
                                {getCompanyName(company.raw) ||
                                  'Unnamed company'}
                              </Link>

                              <div className="mt-1 text-xs text-stone-500">
                                Created{' '}
                                {formatDate(getCompanyCreatedAt(company.raw))}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <select
                              value={editDraft.relationshipStatus}
                              onChange={(event) =>
                                updateDraft(
                                  'relationshipStatus',
                                  event.target.value as RelationshipStatus,
                                )
                              }
                              className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                            >
                              <option value="prospect">Prospect</option>
                              <option value="quoted">
                                Quoted / negotiating
                              </option>
                              <option value="customer">Customer / won</option>
                              <option value="bounced">Bounced</option>
                              <option value="negative">Negative</option>
                              <option value="no-answer">No answer</option>
                              <option value="other">Other</option>
                            </select>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <RelationshipBadge
                                status={relationshipStatus}
                              />

                              <span className="text-xs text-stone-500">
                                {getRelationshipSummary(company)}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <label className="flex items-center gap-2 font-bold">
                              <input
                                type="checkbox"
                                checked={editDraft.dnc}
                                onChange={(event) =>
                                  updateDraft('dnc', event.target.checked)
                                }
                              />
                              DNC
                            </label>
                          ) : getCompanyDnc(company.raw) ? (
                            <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                              DNC
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                              OK
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
                            {contactCount}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className="w-fit rounded-full bg-stone-100 px-2 py-1 text-xs font-bold text-stone-700">
                              {campaignCount}
                            </span>

                            {latestCampaign ? (
                              <span className="text-xs text-stone-500">
                                Latest:{' '}
                                {getString(latestCampaign.campaign || {}, [
                                  'name',
                                  'campaign_name',
                                ]) || 'Campaign'}
                              </span>
                            ) : null}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <TableInput
                              value={editDraft.industry}
                              onChange={(value) =>
                                updateDraft('industry', value)
                              }
                              placeholder="Industry"
                            />
                          ) : (
                            getCompanyIndustry(company.raw) || '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <TableInput
                              value={editDraft.location}
                              onChange={(value) =>
                                updateDraft('location', value)
                              }
                              placeholder="Location"
                            />
                          ) : (
                            getCompanyLocation(company.raw) || '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <TableInput
                              value={editDraft.domain}
                              onChange={(value) =>
                                updateDraft('domain', value)
                              }
                              placeholder="Domain"
                            />
                          ) : getCompanyDomain(company.raw) ? (
                            <a
                              href={normaliseWebsiteUrl(
                                getCompanyDomain(company.raw),
                              )}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-red-600 hover:underline"
                            >
                              {getCompanyDomain(company.raw)}
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing && editDraft ? (
                            <input
                              type="date"
                              value={editDraft.lastContactDate}
                              onChange={(event) =>
                                updateDraft(
                                  'lastContactDate',
                                  event.target.value,
                                )
                              }
                              className="w-40 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                            />
                          ) : (
                            formatDate(getCompanyLastContactDate(company.raw))
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => saveCompany(company)}
                                disabled={savingId === company.id}
                                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                              >
                                {savingId === company.id ? 'Saving...' : 'Save'}
                              </button>

                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={savingId === company.id}
                                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <Link
                                href={`/companies/${company.id}`}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-700 transition hover:bg-red-100"
                              >
                                Open
                              </Link>

                              <button
                                type="button"
                                onClick={() => startEdit(company)}
                                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition hover:bg-stone-50"
                              >
                                Edit
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

function isRowWithId(value: DbRow): value is DbRow & { id: string } {
  return typeof value.id === 'string' && value.id.length > 0
}

function getString(row: DbRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number') {
      return String(value)
    }
  }

  return ''
}

function getBoolean(row: DbRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key]

    if (typeof value === 'boolean') return value

    if (typeof value === 'string') {
      const cleaned = value.trim().toLowerCase()
      if (['true', 'yes', 'y', '1'].includes(cleaned)) return true
      if (['false', 'no', 'n', '0'].includes(cleaned)) return false
    }

    if (typeof value === 'number') {
      return value === 1
    }
  }

  return false
}

function getCompanyName(company: DbRow) {
  return getString(company, ['company_name', 'business_name', 'name'])
}

function getCompanyIndustry(company: DbRow) {
  return getString(company, ['industry'])
}

function getCompanyLocation(company: DbRow) {
  return getString(company, ['location', 'town', 'postcode'])
}

function getCompanySizeBand(company: DbRow) {
  return getString(company, ['size_band'])
}

function getCompanyDomain(company: DbRow) {
  return getString(company, ['domain', 'website'])
}

function getCompanyLastContactDate(company: DbRow) {
  return getString(company, ['last_contact_date'])
}

function getCompanyCreatedAt(company: DbRow) {
  return getString(company, ['created_at'])
}

function getCompanyDnc(company: DbRow) {
  return getBoolean(company, ['dnc', 'is_dnc', 'do_not_contact'])
}

function getContactName(contact: DbRow) {
  return [getString(contact, ['first_name']), getString(contact, ['last_name'])]
    .filter(Boolean)
    .join(' ')
    .trim()
}

function getContactEmail(contact: DbRow) {
  return getString(contact, ['email', 'email_address'])
}

function getContactRole(contact: DbRow) {
  return getString(contact, ['role', 'job_title', 'position'])
}

function getContactOutcome(contact: DbRow) {
  return getString(contact, ['outcome', 'status'])
}

function getManualRelationshipStatus(company: DbRow): RelationshipStatus | null {
  const value = cleanOutcome(getString(company, ['relationship_status']))

  if (!value) return null

  if (value === 'prospect') return 'prospect'
  if (value === 'customer' || value === 'won') return 'customer'
  if (
    value === 'quoted' ||
    value === 'quote sent' ||
    value === 'negotiating'
  ) {
    return 'quoted'
  }
  if (value === 'bounced' || value === 'bounce') return 'bounced'
  if (value === 'negative') return 'negative'
  if (value === 'no answer') return 'no-answer'
  if (value === 'no-answer') return 'no-answer'
  if (value === 'other') return 'other'

  return null
}

function getManualRelationshipLabel(company: DbRow) {
  const status = getManualRelationshipStatus(company)
  return status ? relationshipLabel(status) : ''
}

function getRelationshipStatus(company: CompanyView): RelationshipStatus {
  const manualStatus = getManualRelationshipStatus(company.raw)

  if (manualStatus) {
    return manualStatus
  }

  const contactOutcomes = company.contacts.map((contact) =>
    cleanOutcome(getContactOutcome(contact)),
  )

  const campaignEmailStatuses = company.campaignHistory.map((history) =>
    cleanOutcome(getString(history, ['email_status'])),
  )

  const campaignOutcomes = company.campaignHistory.map((history) =>
    cleanOutcome(getString(history, ['outcome'])),
  )

  const allOutcomes = [
    ...contactOutcomes,
    ...campaignEmailStatuses,
    ...campaignOutcomes,
  ]

  if (allOutcomes.includes('customer') || allOutcomes.includes('won')) {
    return 'customer'
  }

  if (
    allOutcomes.includes('quoted') ||
    allOutcomes.includes('quote sent') ||
    allOutcomes.includes('negotiating')
  ) {
    return 'quoted'
  }

  if (allOutcomes.includes('bounced') || allOutcomes.includes('bounce')) {
    return 'bounced'
  }

  if (allOutcomes.includes('negative')) {
    return 'negative'
  }

  if (allOutcomes.includes('no answer')) {
    return 'no-answer'
  }

  const meaningfulOutcomes = allOutcomes.filter(
    (value) =>
      value &&
      value !== 'none' &&
      value !== 'selected' &&
      value !== 'sent' &&
      value !== 'no response' &&
      value !== 'out of office',
  )

  if (meaningfulOutcomes.length > 0) {
    return 'other'
  }

  return 'prospect'
}

function getRelationshipSummary(company: CompanyView) {
  const manualStatus = getManualRelationshipStatus(company.raw)

  if (manualStatus) {
    return 'Manually set'
  }

  const status = getRelationshipStatus(company)

  if (status === 'customer') return 'Customer / won'
  if (status === 'quoted') return 'Quoted / negotiating'
  if (status === 'bounced') return 'Email bounced'
  if (status === 'negative') return 'Negative response'
  if (status === 'no-answer') return 'No answer'
  if (status === 'other') return 'Other activity'

  const campaignCount = company.campaignHistory.length

  if (campaignCount > 0) {
    return `${campaignCount} campaign${campaignCount === 1 ? '' : 's'}`
  }

  return 'No campaign activity'
}

function relationshipLabel(status: RelationshipStatus) {
  if (status === 'prospect') return 'Prospect'
  if (status === 'customer') return 'Customer / won'
  if (status === 'quoted') return 'Quoted / negotiating'
  if (status === 'bounced') return 'Bounced'
  if (status === 'negative') return 'Negative'
  if (status === 'no-answer') return 'No answer'
  return 'Other'
}

function toDbRelationshipStatus(status: RelationshipStatus) {
  if (status === 'no-answer') return 'no_answer'
  return status
}

function getLatestCampaign(company: CompanyView) {
  return [...company.campaignHistory].sort((a, b) => {
    const aDate =
      getString(a.campaign || {}, ['created_at']) ||
      getString(a, ['created_at'])
    const bDate =
      getString(b.campaign || {}, ['created_at']) ||
      getString(b, ['created_at'])

    return bDate.localeCompare(aDate)
  })[0]
}

function cleanOutcome(value: string) {
  return value.trim().toLowerCase().replaceAll('_', ' ')
}

function cleanText(value: string) {
  return value.trim() || null
}

function findFirstExistingKey(row: DbRow, keys: string[]) {
  return keys.find((key) => key in row)
}

function setPayloadIfColumnExists(
  payload: DbRow,
  row: DbRow,
  keys: string[],
  value: string,
) {
  const key = findFirstExistingKey(row, keys)

  if (key) {
    payload[key] = cleanText(value)
  }
}

function setBooleanPayloadIfColumnExists(
  payload: DbRow,
  row: DbRow,
  keys: string[],
  value: boolean,
) {
  const key = findFirstExistingKey(row, keys)

  if (key) {
    payload[key] = value
  }
}

function normaliseWebsiteUrl(value: string) {
  const cleaned = value.trim()

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned
  }

  return `https://${cleaned}`
}

function toDateInputValue(value: string) {
  if (!value) return ''

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value.slice(0, 10)
  }

  return parsed.toISOString().slice(0, 10)
}

function formatDate(value: string) {
  if (!value) return '-'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('en-GB')
}

function TableInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm outline-none transition focus:border-red-500 focus:ring-4 focus:ring-red-50"
    />
  )
}

function MultiSelectDropdown({
  label,
  emptyLabel,
  options,
  selectedValues,
  onChange,
}: {
  label: string
  emptyLabel: string
  options: { value: string; label: string }[]
  selectedValues: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function dismissWithKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismissWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismissWithKeyboard)
    }
  }, [])

  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value))
      return
    }

    onChange([...selectedValues, value])
  }

  const selectedLabel =
    selectedValues.length === 0
      ? emptyLabel
      : selectedValues.length === 1
        ? options.find((option) => option.value === selectedValues[0])?.label ||
          selectedValues[0]
        : `${selectedValues.length} selected`

  return (
    <div ref={dropdownRef} className="relative block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>

      <details open={open} className="group mt-1">
        <summary
          onClick={(event) => {
            event.preventDefault()
            setOpen((current) => !current)
          }}
          className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-800 outline-none transition hover:bg-stone-50 group-open:border-red-500 group-open:ring-4 group-open:ring-red-50"
        >
          <span className="truncate">{selectedLabel}</span>
          <span className="ml-2 text-xs text-stone-400">▼</span>
        </summary>

        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white p-2 shadow-xl">
          {selectedValues.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-2 w-full rounded-lg bg-stone-100 px-3 py-2 text-left text-xs font-bold text-stone-600 transition hover:bg-stone-200"
            >
              Clear selection
            </button>
          ) : null}

          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">
              No options available.
            </p>
          ) : (
            <div className="space-y-1">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option.value)}
                    onChange={() => toggleValue(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  )
}

function RelationshipBadge({ status }: { status: RelationshipStatus }) {
  const classes =
    status === 'prospect'
      ? 'bg-green-100 text-green-800'
      : status === 'customer'
        ? 'bg-blue-100 text-blue-800'
        : status === 'quoted'
          ? 'bg-amber-100 text-amber-800'
          : status === 'bounced' || status === 'negative'
            ? 'bg-red-100 text-red-800'
            : 'bg-stone-100 text-stone-700'

  return (
    <span
      className={`w-fit rounded-full px-2 py-1 text-xs font-bold ${classes}`}
    >
      {relationshipLabel(status)}
    </span>
  )
}

function CountPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'good' | 'warning' | 'bad' | 'neutral' | 'info'
}) {
  const classes =
    tone === 'good'
      ? 'bg-green-50 text-green-800 ring-green-100'
      : tone === 'warning'
        ? 'bg-amber-50 text-amber-800 ring-amber-100'
        : tone === 'bad'
          ? 'bg-red-50 text-red-800 ring-red-100'
          : tone === 'info'
            ? 'bg-blue-50 text-blue-800 ring-blue-100'
            : 'bg-stone-50 text-stone-700 ring-stone-100'

  return (
    <div className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${classes}`}>
      {label}: {value}
    </div>
  )
}

function EditField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function EditorInput({
  value,
  onChange,
  placeholder = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
    />
  )
}

function describeCompanyChanges(
  company: CompanyView,
  draft: CompanyEditDraft,
) {
  const fields: Array<[string, string | boolean, string | boolean]> = [
    ['Name', getCompanyName(company.raw), draft.companyName.trim()],
    ['Relationship', getRelationshipStatus(company), draft.relationshipStatus],
    ['Industry', getCompanyIndustry(company.raw), draft.industry.trim()],
    ['Location', getCompanyLocation(company.raw), draft.location.trim()],
    ['Size band', getCompanySizeBand(company.raw), draft.sizeBand.trim()],
    ['Domain', getCompanyDomain(company.raw), draft.domain.trim()],
    [
      'Last contact',
      toDateInputValue(getCompanyLastContactDate(company.raw)),
      draft.lastContactDate,
    ],
    ['DNC', getCompanyDnc(company.raw), draft.dnc],
  ]

  const changes = fields
    .filter(([, before, after]) => before !== after)
    .map(([label, before, after]) => {
      const from = before === '' ? 'blank' : before === true ? 'Yes' : before === false ? 'No' : before
      const to = after === '' ? 'blank' : after === true ? 'Yes' : after === false ? 'No' : after
      return `${label}: ${from} → ${to}`
    })

  return changes.length ? `Company details updated — ${changes.join('; ')}.` : ''
}

function SummaryCard({
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
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'
      }`}
    >
      <p className="text-sm font-bold text-stone-500">{label}</p>

      <p
        className={`mt-3 text-4xl font-black tracking-tight ${
          urgent ? 'text-red-600' : 'text-stone-950'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
