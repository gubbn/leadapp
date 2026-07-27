'use client'

import { type FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'
import CompanyLookupLinks from '@/app/components/CompanyLookupLinks'
import { formatCurrency, stageFor } from '@/lib/crm'

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

type RelationshipStatus =
  | 'prospect'
  | 'customer'
  | 'quoted'
  | 'bounced'
  | 'negative'
  | 'no-answer'
  | 'other'

export default function CompanyDetailPage() {
  const params = useParams()
  const companyId = Array.isArray(params.id)
    ? params.id[0]
    : String(params.id || '')

  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistoryRow[]>(
    [],
  )
  const [deals, setDeals] = useState<DbRow[]>([])
  const [tasks, setTasks] = useState<DbRow[]>([])
  const [activities, setActivities] = useState<DbRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const [addingContact, setAddingContact] = useState(false)

  // Existing detail-page loader is intentionally triggered when the route id changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    loadCompany()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const relationshipStatus = useMemo(() => {
    return getRelationshipStatus(contacts, campaignHistory)
  }, [contacts, campaignHistory])

  const stats = useMemo(() => {
    const selected = campaignHistory.length

    const bounced = campaignHistory.filter(
      (row) => cleanOutcome(getString(row, ['email_status'])) === 'bounced',
    ).length

    const outOfOffice = campaignHistory.filter(
      (row) => cleanOutcome(getString(row, ['email_status'])) === 'out of office',
    ).length

    const quoted = campaignHistory.filter((row) => {
      const outcome = cleanOutcome(getString(row, ['outcome']))
      return outcome === 'quoted' || outcome === 'quote sent'
    }).length

    const customers = campaignHistory.filter((row) => {
      const outcome = cleanOutcome(getString(row, ['outcome']))
      return outcome === 'customer' || outcome === 'won'
    }).length

    return {
      selected,
      bounced,
      outOfOffice,
      quoted,
      customers,
      success: quoted + customers,
    }
  }, [campaignHistory])

  async function loadCompany() {
    setLoading(true)
    setErrorMessage('')
    setWarningMessage('')

    const warnings: string[] = []

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (companyError) {
      setErrorMessage(companyError.message)
      setLoading(false)
      return
    }

    setCompany(companyData as CompanyRow)

    const [dealsResult, tasksResult, activitiesResult] = await Promise.all([
      supabase
        .from('deals')
        .select('*')
        .eq('company_id', companyId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('crm_tasks')
        .select('*')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true, nullsFirst: false }),
      supabase
        .from('crm_activities')
        .select('*')
        .eq('company_id', companyId)
        .order('occurred_at', { ascending: false }),
    ])

    if (dealsResult.error) warnings.push(`Deals could not be loaded: ${dealsResult.error.message}`)
    if (tasksResult.error) warnings.push(`Tasks could not be loaded: ${tasksResult.error.message}`)
    if (activitiesResult.error) warnings.push(`Activities could not be loaded: ${activitiesResult.error.message}`)
    setDeals((dealsResult.data ?? []) as DbRow[])
    setTasks((tasksResult.data ?? []) as DbRow[])
    setActivities((activitiesResult.data ?? []) as DbRow[])

    const { data: contactData, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)

    if (contactsError) {
      warnings.push(`Contacts could not be loaded: ${contactsError.message}`)
      setContacts([])
    } else {
      setContacts(
        ((contactData ?? []) as DbRow[])
          .filter(isRowWithId)
          .map((row) => row as ContactRow)
          .sort((a, b) => getContactName(a).localeCompare(getContactName(b))),
      )
    }

    const { data: campaignCompanyData, error: campaignCompanyError } =
      await supabase
        .from('campaign_companies')
        .select('*')
        .eq('company_id', companyId)

    if (campaignCompanyError) {
      warnings.push(
        `Campaign history could not be loaded: ${campaignCompanyError.message}`,
      )
      setCampaignHistory([])
      setWarningMessage(warnings.join(' '))
      setLoading(false)
      return
    }

    const campaignCompanyRows = ((campaignCompanyData ?? []) as DbRow[])
      .filter(isRowWithId)
      .map((row) => row as CampaignHistoryRow)

    const campaignIds = Array.from(
      new Set(
        campaignCompanyRows
          .map((row) => getString(row, ['campaign_id']))
          .filter(Boolean),
      ),
    )

    let campaignsById = new Map<string, DbRow>()

    if (campaignIds.length > 0) {
      const { data: campaignData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .in('id', campaignIds)

      if (campaignsError) {
        warnings.push(`Campaign names could not be loaded: ${campaignsError.message}`)
      } else {
        campaignsById = new Map(
          ((campaignData ?? []) as DbRow[])
            .map((campaign) => [getString(campaign, ['id']), campaign])
            .filter(([id]) => Boolean(id)) as [string, DbRow][],
        )
      }
    }

    const historyWithCampaigns = campaignCompanyRows
      .map((history) => {
        const campaignId = getString(history, ['campaign_id'])

        return {
          ...history,
          campaign: campaignId ? campaignsById.get(campaignId) || null : null,
        }
      })
      .sort((a, b) => {
        const aDate =
          getString(a, ['created_at']) ||
          getString(a.campaign || {}, ['created_at'])
        const bDate =
          getString(b, ['created_at']) ||
          getString(b.campaign || {}, ['created_at'])

        return bDate.localeCompare(aDate)
      })

    setCampaignHistory(historyWithCampaigns)
    setWarningMessage(warnings.join(' '))
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/companies" className="text-sm font-bold text-red-600">
            ← Back to companies
          </Link>

          <div className="mt-6 max-w-4xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Company record
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              {company ? getCompanyName(company) || 'Unnamed company' : 'Company'}
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              View the company details, linked contacts and campaign activity.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {errorMessage ? (
          <p className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {warningMessage ? (
          <p className="mb-6 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {warningMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mb-6 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            {successMessage}
          </p>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm font-semibold text-stone-500">
            Loading company...
          </div>
        ) : !company ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm font-semibold text-stone-500">
            Company not found.
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-5">
              <SummaryCard label="Contacts" value={contacts.length} />

              <SummaryCard label="Campaigns" value={stats.selected} />

              <SummaryCard
                label="Bounced"
                value={stats.bounced}
                urgent={stats.bounced > 0}
              />

              <SummaryCard
                label="Quoted"
                value={stats.quoted}
                urgent={stats.quoted > 0}
              />

              <SummaryCard
                label="Customers"
                value={stats.customers}
                urgent={stats.customers > 0}
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-xl font-black text-stone-950">
                      Company details
                    </h2>

                    <p className="mt-1 text-sm text-stone-500">
                      Core company information from the companies table.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <RelationshipBadge status={relationshipStatus} />
                    <button
                      type="button"
                      onClick={() => setEditingDetails(true)}
                      className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-black text-white hover:bg-stone-800"
                    >
                      Edit details
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <DetailItem label="Name" value={getCompanyName(company)} />
                  <DetailItem label="Industry" value={getCompanyIndustry(company)} />
                  <DetailItem label="Location" value={getCompanyLocation(company)} />
                  <DetailItem label="Size band" value={getCompanySizeBand(company)} />
                  <DetailItem label="Domain" value={getCompanyDomain(company)} isLink />
                  <DetailItem label="Last contact" value={formatDate(getCompanyLastContactDate(company))} />
                  <DetailItem label="Created" value={formatDate(getCompanyCreatedAt(company))} />
                  <DetailItem label="DNC" value={getCompanyDnc(company) ? 'Yes' : 'No'} />
                </div>

                <div className="mt-6 border-t border-stone-100 pt-5">
                  <p className="mb-3 text-xs font-black uppercase tracking-wide text-stone-400">
                    One-click research
                  </p>
                  <CompanyLookupLinks
                    companyName={getCompanyName(company)}
                    domain={getCompanyDomain(company)}
                    telephone={contacts.map(getContactPhone).find(Boolean)}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-black text-stone-950">
                  Pipeline summary
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Based on contacts and campaign history.
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <MetricBlock
                    label="Success rate"
                    value={percent(stats.success, stats.selected)}
                  />

                  <MetricBlock
                    label="Bounce rate"
                    value={percent(stats.bounced, stats.selected)}
                  />

                  <MetricBlock
                    label="Out of office rate"
                    value={percent(stats.outOfOffice, stats.selected)}
                  />

                  <MetricBlock
                    label="Relationship"
                    value={relationshipLabel(relationshipStatus)}
                  />
                </div>
              </section>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                      Revenue
                    </p>
                    <h2 className="mt-1 text-xl font-black text-stone-950">
                      Opportunities
                    </h2>
                  </div>
                  <Link href="/sales" className="rounded-lg bg-stone-950 px-3 py-2 text-xs font-black text-white">
                    Open pipeline
                  </Link>
                </div>
                <div className="mt-5 space-y-3">
                  {deals.length ? deals.map((deal) => (
                    <div key={getString(deal, ['id'])} className="rounded-xl border border-stone-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black text-stone-900">{getString(deal, ['name'])}</p>
                          <p className="mt-1 text-xs font-bold text-red-600">{stageFor(getString(deal, ['stage'])).label}</p>
                        </div>
                        <p className="text-sm font-black text-stone-900">{formatCurrency(getString(deal, ['annual_value']))}</p>
                      </div>
                      <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs leading-5 text-stone-600">
                        {getString(deal, ['next_action']) || 'No next action set'}
                        {getString(deal, ['next_action_due']) ? ` · ${formatDate(getString(deal, ['next_action_due']))}` : ''}
                      </p>
                    </div>
                  )) : (
                    <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
                      No opportunity exists yet. Create one from the Sales pipeline.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                  Next actions
                </p>
                <h2 className="mt-1 text-xl font-black text-stone-950">Open tasks</h2>
                <div className="mt-5 space-y-3">
                  {tasks.filter((task) => !['completed', 'cancelled'].includes(getString(task, ['status']))).length ? (
                    tasks
                      .filter((task) => !['completed', 'cancelled'].includes(getString(task, ['status'])))
                      .map((task) => (
                        <div key={getString(task, ['id'])} className="rounded-xl bg-stone-50 p-4">
                          <p className="text-sm font-black text-stone-900">{getString(task, ['title'])}</p>
                          <p className="mt-1 text-xs text-stone-500">
                            {formatDate(getString(task, ['due_date']))} · {getString(task, ['priority']) || 'normal'}
                          </p>
                        </div>
                      ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
                      No open tasks for this company.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">
                Relationship history
              </p>
              <h2 className="mt-1 text-xl font-black text-stone-950">Activity timeline</h2>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {activities.length ? activities.slice(0, 12).map((activity) => (
                  <div key={getString(activity, ['id'])} className="border-l-2 border-red-100 pl-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-stone-100 px-2 py-1 text-[10px] font-black uppercase text-stone-500">
                        {(getString(activity, ['activity_type']) || 'note').replace('_', ' ')}
                      </span>
                      <span className="text-[10px] font-bold text-stone-400">
                        {formatDate(getString(activity, ['occurred_at']))}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-bold leading-6 text-stone-800">
                      {getString(activity, ['summary'])}
                    </p>
                  </div>
                )) : (
                  <p className="rounded-xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
                    No calls, emails, meetings or notes have been logged yet.
                  </p>
                )}
              </div>
            </section>

            {editingDetails ? (
              <CompanyDetailsEditor
                company={company}
                onClose={() => setEditingDetails(false)}
                onSaved={(updatedCompany, activity) => {
                  setCompany(updatedCompany)
                  if (activity) {
                    setActivities((current) => [activity, ...current])
                  }
                  setEditingDetails(false)
                }}
              />
            ) : null}

            {addingContact ? (
              <AddContactEditor
                company={company}
                onClose={() => setAddingContact(false)}
                onSaved={(contact, activity) => {
                  setContacts((current) => [...current, contact])
                  if (activity) setActivities((current) => [activity, ...current])
                  setAddingContact(false)
                  setSuccessMessage(`${getContactName(contact) || 'Contact'} added.`)
                }}
              />
            ) : null}

            <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 p-5">
                <div>
                  <h2 className="text-xl font-black text-stone-950">
                    Contacts
                  </h2>

                  <p className="mt-1 text-sm text-stone-500">
                    Contacts linked to this company.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSuccessMessage('')
                    setAddingContact(true)
                  }}
                  className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700"
                >
                  + Add contact
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Source</th>
                    </tr>
                  </thead>

                  <tbody>
                    {contacts.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-stone-500" colSpan={6}>
                          No contacts found for this company.
                        </td>
                      </tr>
                    ) : (
                      contacts.map((contact) => (
                        <tr
                          key={contact.id}
                          className="border-t border-stone-100"
                        >
                          <td className="px-4 py-3 font-bold text-stone-950">
                            {getContactName(contact) || 'Unnamed contact'}
                          </td>

                          <td className="px-4 py-3">
                            {getContactEmail(contact) ? (
                              <a
                                href={`mailto:${getContactEmail(contact)}`}
                                className="font-semibold text-red-600 hover:underline"
                              >
                                {getContactEmail(contact)}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>

                          <td className="px-4 py-3">
                            {getContactRole(contact) || '-'}
                          </td>

                          <td className="px-4 py-3">
                            {getContactPhone(contact) || '-'}
                          </td>

                          <td className="px-4 py-3">
                            {getContactOutcome(contact) || '-'}
                          </td>

                          <td className="px-4 py-3">
                            {getContactSource(contact) || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 p-5">
                <h2 className="text-xl font-black text-stone-950">
                  Campaign history
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Campaigns this company has been selected for.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Email used</th>
                      <th className="px-4 py-3">Email status</th>
                      <th className="px-4 py-3">Outcome</th>
                      <th className="px-4 py-3">Notes</th>
                      <th className="px-4 py-3">Selected</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>

                  <tbody>
                    {campaignHistory.length === 0 ? (
                      <tr>
                        <td className="px-4 py-5 text-stone-500" colSpan={7}>
                          This company has not been selected for a campaign yet.
                        </td>
                      </tr>
                    ) : (
                      campaignHistory.map((history) => {
                        const campaignId = getString(history, ['campaign_id'])
                        const campaignName =
                          getString(history.campaign || {}, ['name']) ||
                          'Unnamed campaign'

                        return (
                          <tr
                            key={history.id}
                            className="border-t border-stone-100"
                          >
                            <td className="px-4 py-3 font-bold text-stone-950">
                              {campaignName}
                            </td>

                            <td className="px-4 py-3">
                              {getString(history, ['email_address_used']) || '-'}
                            </td>

                            <td className="px-4 py-3">
                              <StatusPill
                                value={
                                  getString(history, ['email_status']) ||
                                  'selected'
                                }
                              />
                            </td>

                            <td className="px-4 py-3">
                              <StatusPill
                                value={getString(history, ['outcome']) || 'none'}
                              />
                            </td>

                            <td className="max-w-md px-4 py-3 text-stone-600">
                              {getString(history, ['notes']) || '-'}
                            </td>

                            <td className="px-4 py-3">
                              {formatDate(getString(history, ['created_at']))}
                            </td>

                            <td className="px-4 py-3">
                              {campaignId ? (
                                <Link
                                  href={`/campaigns/${campaignId}`}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100"
                                >
                                  Open campaign
                                </Link>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
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
  return getString(company, ['last_contact_date', 'last_contacted_at'])
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
  return getString(contact, ['email_address', 'email'])
}

function getContactRole(contact: DbRow) {
  return getString(contact, ['role', 'job_title', 'position'])
}

function getContactPhone(contact: DbRow) {
  return getString(contact, ['telephone', 'phone', 'mobile'])
}

function getContactOutcome(contact: DbRow) {
  return getString(contact, ['outcome', 'status'])
}

function getContactSource(contact: DbRow) {
  return getString(contact, ['contact_source', 'source'])
}

function getRelationshipStatus(
  contacts: ContactRow[],
  campaignHistory: CampaignHistoryRow[],
): RelationshipStatus {
  const contactOutcomes = contacts.map((contact) =>
    cleanOutcome(getContactOutcome(contact)),
  )

  const campaignEmailStatuses = campaignHistory.map((history) =>
    cleanOutcome(getString(history, ['email_status'])),
  )

  const campaignOutcomes = campaignHistory.map((history) =>
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

function cleanOutcome(value: string) {
  return value.trim().toLowerCase().replaceAll('_', ' ')
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

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function normaliseWebsiteUrl(value: string) {
  const cleaned = value.trim()

  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
    return cleaned
  }

  return `https://${cleaned}`
}

function formatDate(value: string) {
  if (!value) return '-'

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('en-GB')
}

function DetailItem({
  label,
  value,
  isLink = false,
}: {
  label: string
  value: string
  isLink?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </p>

      {isLink && value && value !== '-' ? (
        <a
          href={normaliseWebsiteUrl(value)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 block font-bold text-red-600 hover:underline"
        >
          {value}
        </a>
      ) : (
        <p className="mt-1 font-bold text-stone-950">{value || '-'}</p>
      )}
    </div>
  )
}

function MetricBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </p>

      <p className="mt-2 text-2xl font-black text-stone-950">{value}</p>
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
      className={`w-fit rounded-full px-3 py-1 text-xs font-black uppercase tracking-wide ${classes}`}
    >
      {relationshipLabel(status)}
    </span>
  )
}

function StatusPill({ value }: { value: string }) {
  const cleaned = cleanOutcome(value)

  const classes =
    cleaned === 'customer' || cleaned === 'won'
      ? 'bg-blue-100 text-blue-800'
      : cleaned === 'quoted' || cleaned === 'quote sent'
        ? 'bg-amber-100 text-amber-800'
        : cleaned === 'bounced' || cleaned === 'negative'
          ? 'bg-red-100 text-red-800'
          : cleaned === 'out of office'
            ? 'bg-purple-100 text-purple-800'
            : 'bg-stone-100 text-stone-700'

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${classes}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  )
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

function CompanyDetailsEditor({
  company,
  onClose,
  onSaved,
}: {
  company: CompanyRow
  onClose: () => void
  onSaved: (company: CompanyRow, activity: DbRow | null) => void
}) {
  const [draft, setDraft] = useState({
    companyName: getCompanyName(company),
    industry: getCompanyIndustry(company),
    location: getCompanyLocation(company),
    sizeBand: getCompanySizeBand(company),
    domain: getCompanyDomain(company),
    lastContactDate: toDateInput(getCompanyLastContactDate(company)),
    dnc: getCompanyDnc(company),
  })
  const [logActivity, setLogActivity] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof typeof draft, value: string | boolean) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      company_name: draft.companyName.trim(),
      industry: draft.industry.trim() || null,
      location: draft.location.trim() || null,
      size_band: draft.sizeBand.trim() || null,
      domain: draft.domain.trim() || null,
      last_contact_date: draft.lastContactDate || null,
      dnc: draft.dnc,
      updated_at: new Date().toISOString(),
    }
    const { data, error: saveError } = await supabase
      .from('companies')
      .update(payload)
      .eq('id', company.id)
      .select('*')
      .single()

    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }

    let activity: DbRow | null = null
    const summary = companyChangeSummary(company, draft)
    if (logActivity && summary) {
      const result = await supabase
        .from('crm_activities')
        .insert({
          company_id: company.id,
          activity_type: 'company_update',
          summary,
        })
        .select('*')
        .single()

      if (result.error) {
        setError(`Details saved, but activity logging failed: ${result.error.message}`)
        setSaving(false)
        onSaved(data as CompanyRow, null)
        return
      }
      activity = result.data as DbRow
    }

    onSaved(data as CompanyRow, activity)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="company-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form onSubmit={submit} className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Company record</p>
            <h2 id="company-editor-title" className="mt-2 text-2xl font-black text-stone-950">
              Edit company details
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-stone-200 px-3 py-2 font-black text-stone-500 hover:bg-stone-50">
            ✕
          </button>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <EditorField label="Company name" value={draft.companyName} onChange={(value) => update('companyName', value)} />
          <EditorField label="Industry" value={draft.industry} onChange={(value) => update('industry', value)} />
          <EditorField label="Location" value={draft.location} onChange={(value) => update('location', value)} placeholder="Village, town or city" />
          <EditorField label="Size band" value={draft.sizeBand} onChange={(value) => update('sizeBand', value)} placeholder="For example, 15–49" />
          <EditorField label="Website or domain" value={draft.domain} onChange={(value) => update('domain', value)} placeholder="example.co.uk" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Last contact</span>
            <input type="date" value={draft.lastContactDate} onChange={(event) => update('lastContactDate', event.target.value)} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50" />
          </label>
          <EditorCheckbox checked={draft.dnc} onChange={(value) => update('dnc', value)} title="Do not contact" description="Exclude this company from outreach." />
          <EditorCheckbox checked={logActivity} onChange={setLogActivity} title="Add to recent activity" description="Record a summary of the fields changed." highlighted />
        </div>

        {error ? <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !draft.companyName.trim()} className="rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Saving changes…' : 'Save company'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AddContactEditor({
  company,
  onClose,
  onSaved,
}: {
  company: CompanyRow
  onClose: () => void
  onSaved: (contact: ContactRow, activity: DbRow | null) => void
}) {
  const [draft, setDraft] = useState({
    firstName: '',
    lastName: '',
    role: '',
    email: '',
    telephone: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')

    const result = await supabase
      .from('contacts')
      .insert({
        company_id: company.id,
        first_name: draft.firstName.trim(),
        last_name: draft.lastName.trim() || null,
        role: draft.role.trim() || null,
        email: draft.email.trim() || null,
        telephone: draft.telephone.trim() || null,
        notes: draft.notes.trim() || null,
        contact_source: 'company_record',
      })
      .select('*')
      .single()

    if (result.error) {
      setError(result.error.message)
      setSaving(false)
      return
    }

    const contact = result.data as ContactRow
    const contactName = getContactName(contact) || 'A contact'
    const activityResult = await supabase
      .from('crm_activities')
      .insert({
        company_id: company.id,
        contact_id: contact.id,
        activity_type: 'note',
        summary: `${contactName} added as a contact from the company record.`,
      })
      .select('*')
      .single()

    if (activityResult.error) {
      setError(`Contact added, but activity logging failed: ${activityResult.error.message}`)
      setSaving(false)
      onSaved(contact, null)
      return
    }

    onSaved(contact, activityResult.data as DbRow)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contact-editor-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <form onSubmit={submit} className="max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Company contact</p>
            <h2 id="contact-editor-title" className="mt-2 text-2xl font-black text-stone-950">
              Add contact to {getCompanyName(company)}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-stone-200 px-3 py-2 font-black text-stone-500 hover:bg-stone-50">
            ✕
          </button>
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <EditorField label="First name" value={draft.firstName} onChange={(value) => update('firstName', value)} />
          <EditorField label="Last name" value={draft.lastName} onChange={(value) => update('lastName', value)} />
          <EditorField label="Role" value={draft.role} onChange={(value) => update('role', value)} placeholder="Managing Director" />
          <EditorField label="Email" value={draft.email} onChange={(value) => update('email', value)} placeholder="name@company.co.uk" />
          <EditorField label="Telephone" value={draft.telephone} onChange={(value) => update('telephone', value)} />
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">Notes</span>
            <textarea value={draft.notes} onChange={(event) => update('notes', event.target.value)} rows={3} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50" />
          </label>
        </div>

        <p className="mt-5 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
          This contact will be linked to the company and recorded in recent activity.
        </p>
        {error ? <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-stone-300 px-5 py-3 text-sm font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving || !draft.firstName.trim()} className="rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Adding contact…' : 'Add contact'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditorField({ label, value, onChange, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50" />
    </label>
  )
}

function EditorCheckbox({ checked, onChange, title, description, highlighted = false }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string; highlighted?: boolean }) {
  return (
    <label className={`flex min-h-20 items-center gap-3 rounded-xl border px-4 py-3 ${highlighted ? 'border-red-100 bg-red-50' : 'border-stone-200 bg-stone-50'}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-red-600" />
      <span>
        <span className="block text-sm font-black text-stone-800">{title}</span>
        <span className="block text-xs text-stone-500">{description}</span>
      </span>
    </label>
  )
}

function toDateInput(value: string) {
  if (!value) return ''
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10)
}

function companyChangeSummary(
  company: DbRow,
  draft: {
    companyName: string
    industry: string
    location: string
    sizeBand: string
    domain: string
    lastContactDate: string
    dnc: boolean
  },
) {
  const fields: Array<[string, string | boolean, string | boolean]> = [
    ['Name', getCompanyName(company), draft.companyName.trim()],
    ['Industry', getCompanyIndustry(company), draft.industry.trim()],
    ['Location', getCompanyLocation(company), draft.location.trim()],
    ['Size band', getCompanySizeBand(company), draft.sizeBand.trim()],
    ['Domain', getCompanyDomain(company), draft.domain.trim()],
    ['Last contact', toDateInput(getCompanyLastContactDate(company)), draft.lastContactDate],
    ['DNC', getCompanyDnc(company), draft.dnc],
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
