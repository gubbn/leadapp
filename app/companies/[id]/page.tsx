'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
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
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [warningMessage, setWarningMessage] = useState('')

  useEffect(() => {
    loadCompany()
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

                  <RelationshipBadge status={relationshipStatus} />
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

            <section className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-200 p-5">
                <h2 className="text-xl font-black text-stone-950">
                  Contacts
                </h2>

                <p className="mt-1 text-sm text-stone-500">
                  Contacts linked to this company.
                </p>
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