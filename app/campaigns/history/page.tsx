'use client'

import { ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type DbRow = Record<string, unknown>

type SavedCampaign = {
  id: string
  name: string
  description: string | null
  created_at: string | null
  updated_at: string | null
  archived_at?: string | null
}

type CampaignCompanyLite = {
  id: string
  campaign_id: string
  email_status: string | null
  outcome: string | null
}

type SavedCampaignSummary = SavedCampaign & {
  selected_count: number
  bounced_count: number
  out_of_office_count: number
  quoted_count: number
  customer_count: number
  success_count: number
  success_rate: string
  bounce_rate: string
  out_of_office_rate: string
}

type ParsedCsvRow = Record<string, string>

type ImportPreview = {
  fileName: string
  suggestedCampaignName: string
  totalRows: number
  matchedRows: ImportedCampaignCompany[]
  unmatchedRows: ParsedCsvRow[]
}

type ImportedCampaignCompany = {
  company_id: string
  contact_id: string | null
  email_address_used: string | null
  email_status: string
  outcome: string
  notes: string | null
  company_name: string
}

export default function CampaignHistoryPage() {
  const [campaigns, setCampaigns] = useState<SavedCampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [message, setMessage] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [detailsEditor, setDetailsEditor] = useState<{
    id: string
    original: string | null
    draft: string
  } | null>(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importCampaignName, setImportCampaignName] = useState('')
  const [savingImport, setSavingImport] = useState(false)
  const [lastImportedCampaignId, setLastImportedCampaignId] = useState<
    string | null
  >(null)

  useEffect(() => {
    loadCampaignHistory()
  }, [])

  const archivedCount = campaigns.filter((campaign) => campaign.archived_at).length

  const visibleCampaigns = useMemo(
    () =>
      campaigns.filter(
        (campaign) => showArchived || !campaign.archived_at,
      ),
    [campaigns, showArchived],
  )

  const totals = useMemo(() => {
    const selected = visibleCampaigns.reduce(
      (total, campaign) => total + campaign.selected_count,
      0,
    )

    const bounced = visibleCampaigns.reduce(
      (total, campaign) => total + campaign.bounced_count,
      0,
    )

    const outOfOffice = visibleCampaigns.reduce(
      (total, campaign) => total + campaign.out_of_office_count,
      0,
    )

    const quoted = visibleCampaigns.reduce(
      (total, campaign) => total + campaign.quoted_count,
      0,
    )

    const customers = visibleCampaigns.reduce(
      (total, campaign) => total + campaign.customer_count,
      0,
    )

    return {
      selected,
      bounced,
      outOfOffice,
      quoted,
      customers,
      success: quoted + customers,
    }
  }, [visibleCampaigns])

  async function loadCampaignHistory() {
    setLoading(true)
    setErrorMessage('')

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (campaignError) {
      setErrorMessage(campaignError.message)
      setLoading(false)
      return
    }

    const savedCampaigns = (campaignData ?? []) as SavedCampaign[]

    if (savedCampaigns.length === 0) {
      setCampaigns([])
      setLoading(false)
      return
    }

    const campaignIds = savedCampaigns.map((campaign) => campaign.id)
    const campaignCompanyRows: CampaignCompanyLite[] = []

    const chunks = chunkArray(campaignIds, 500)

    for (const chunk of chunks) {
      const { data: historyData, error: historyError } = await supabase
        .from('campaign_companies')
        .select('id, campaign_id, email_status, outcome')
        .in('campaign_id', chunk)

      if (historyError) {
        setErrorMessage(historyError.message)
        setLoading(false)
        return
      }

      campaignCompanyRows.push(...((historyData ?? []) as CampaignCompanyLite[]))
    }

    const summaries = savedCampaigns.map((campaign) => {
      const historyRows = campaignCompanyRows.filter(
        (row) => row.campaign_id === campaign.id,
      )

      const selected = historyRows.length

      const bounced = historyRows.filter(
        (row) => row.email_status === 'bounced',
      ).length

      const outOfOffice = historyRows.filter(
        (row) => row.email_status === 'out_of_office',
      ).length

      const quoted = historyRows.filter(
        (row) => row.outcome === 'quoted',
      ).length

      const customers = historyRows.filter(
        (row) => row.outcome === 'customer',
      ).length

      const success = quoted + customers

      return {
        ...campaign,
        selected_count: selected,
        bounced_count: bounced,
        out_of_office_count: outOfOffice,
        quoted_count: quoted,
        customer_count: customers,
        success_count: success,
        success_rate: percent(success, selected),
        bounce_rate: percent(bounced, selected),
        out_of_office_rate: percent(outOfOffice, selected),
      }
    })

    setCampaigns(summaries)
    setLoading(false)
  }

  async function saveCampaignDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detailsEditor || savingDetails) return

    const { id, original, draft } = detailsEditor
    const description = draft.trim() || null
    if (description === original) {
      setDetailsEditor(null)
      return
    }

    setSavingDetails(true)
    setDetailsError('')
    setMessage('')

    const update = supabase
      .from('campaigns')
      .update({ description, updated_at: new Date().toISOString() })
      .eq('id', id)

    const { data, error } = await (original === null
      ? update.is('description', null)
      : update.eq('description', original)
    )
      .select('description, updated_at')
      .maybeSingle()

    setSavingDetails(false)
    if (error || !data) {
      setDetailsError(
        error?.message || 'The details could not be saved. The campaign may have changed or you may lack editing access.',
      )
      return
    }

    setCampaigns((current) =>
      current.map((campaign) =>
        campaign.id === id
          ? { ...campaign, description: data.description, updated_at: data.updated_at }
          : campaign,
      ),
    )
    setDetailsEditor(null)
    setMessage('Campaign details saved.')
  }

  async function setCampaignArchived(campaign: SavedCampaignSummary, archived: boolean) {
    const action = archived ? 'archive' : 'restore'
    const confirmed = window.confirm(
      `${archived ? 'Archive' : 'Restore'} “${campaign.name}”? ${
        archived
          ? 'It will be hidden until archived campaigns are shown.'
          : 'It will return to the main campaign history.'
      }`,
    )

    if (!confirmed) return

    setArchivingId(campaign.id)
    setMessage('')
    setErrorMessage('')

    const archivedAt = archived ? new Date().toISOString() : null
    const { data, error } = await supabase
      .from('campaigns')
      .update({ archived_at: archivedAt, updated_at: new Date().toISOString() })
      .eq('id', campaign.id)
      .select('id, archived_at')
      .single()

    if (error || !data) {
      setErrorMessage(
        error?.message || `The campaign could not be ${action}d.`,
      )
      setArchivingId(null)
      return
    }

    setCampaigns((current) =>
      current.map((item) =>
        item.id === campaign.id
          ? { ...item, archived_at: data.archived_at }
          : item,
      ),
    )
    setMessage(
      archived
        ? `“${campaign.name}” was archived.`
        : `“${campaign.name}” was restored to campaign history.`,
    )
    setArchivingId(null)
  }

  async function handleCsvUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) return

    setUploading(true)
    setErrorMessage('')
    setMessage('')
    setImportPreview(null)
    setImportCampaignName('')
    setLastImportedCampaignId(null)

    try {
      const text = await file.text()
      const parsedRows = parseCsv(text)

      if (parsedRows.length === 0) {
        setErrorMessage('This CSV does not contain any rows.')
        setUploading(false)
        return
      }

      const preview = await buildImportPreview(file.name, parsedRows)

      setImportPreview(preview)
      setImportCampaignName(preview.suggestedCampaignName)
      setMessage(
        `CSV loaded. Matched ${preview.matchedRows.length} compan${
          preview.matchedRows.length === 1 ? 'y' : 'ies'
        }. ${preview.unmatchedRows.length} row${
          preview.unmatchedRows.length === 1 ? '' : 's'
        } could not be matched.`,
      )
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not read this CSV.',
      )
    }

    setUploading(false)
    event.target.value = ''
  }

  async function buildImportPreview(fileName: string, rows: ParsedCsvRow[]) {
    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')

    if (companyError) {
      throw new Error(companyError.message)
    }

    const { data: contactData, error: contactError } = await supabase
      .from('contacts')
      .select('*')

    if (contactError) {
      throw new Error(contactError.message)
    }

    const companies = ((companyData ?? []) as DbRow[]).filter(isRowWithId)
    const contacts = ((contactData ?? []) as DbRow[]).filter(isRowWithId)

    const companiesById = new Map<string, DbRow>()
    const companiesByName = new Map<string, DbRow>()
    const contactsByEmail = new Map<string, DbRow>()

    companies.forEach((company) => {
      const companyId = getString(company, ['id'])
      const companyName = normaliseKey(getCompanyName(company))

      if (companyId) companiesById.set(companyId, company)
      if (companyName) companiesByName.set(companyName, company)
    })

    contacts.forEach((contact) => {
      const email = normaliseEmail(getContactEmail(contact))

      if (email) {
        contactsByEmail.set(email, contact)
      }
    })

    const matchedByCompany = new Map<string, ImportedCampaignCompany>()
    const unmatchedRows: ParsedCsvRow[] = []

    rows.forEach((row) => {
      const email = normaliseEmail(
        getCsvValue(row, [
          'Email Address',
          'Email',
          'email',
          'email_address',
          'Email Used',
          'email_address_used',
        ]),
      )

      const companyNameFromCsv = getCsvValue(row, [
        'Company Name',
        'Company',
        'Business Name',
        'company_name',
        'business_name',
      ])

      const contact = email ? contactsByEmail.get(email) || null : null
      const contactCompanyId = contact ? getString(contact, ['company_id']) : ''
      const companyFromContact = contactCompanyId
        ? companiesById.get(contactCompanyId) || null
        : null

      const companyFromName = companyNameFromCsv
        ? companiesByName.get(normaliseKey(companyNameFromCsv)) || null
        : null

      const company = companyFromContact || companyFromName

      if (!company) {
        unmatchedRows.push(row)
        return
      }

      const companyId = getString(company, ['id'])

      if (!companyId) {
        unmatchedRows.push(row)
        return
      }

      if (matchedByCompany.has(companyId)) {
        return
      }

      const emailStatus = mapEmailStatus(
        getCsvValue(row, [
          'Email Status',
          'email_status',
          'Status',
          'Mail Status',
        ]),
      )

      const outcome = mapOutcome(
        getCsvValue(row, [
          'Outcome',
          'outcome',
          'Relationship Status',
          'relationship_status',
        ]),
      )

      const csvNotes = getCsvValue(row, [
        'Notes',
        'notes',
        'Email Note',
        'Campaign Note',
      ])

      matchedByCompany.set(companyId, {
        company_id: companyId,
        contact_id: contact ? getString(contact, ['id']) || null : null,
        email_address_used: email || null,
        email_status: emailStatus,
        outcome,
        notes: csvNotes || 'Imported from previous campaign CSV.',
        company_name: getCompanyName(company) || companyNameFromCsv || 'Company',
      })
    })

    const suggestedCampaignName =
      getCsvValue(rows[0], [
        'Campaign Name',
        'campaign_name',
        'Campaign',
        'campaign',
      ]) || fileName.replace(/\.[^/.]+$/, '').replaceAll('-', ' ')

    return {
      fileName,
      suggestedCampaignName,
      totalRows: rows.length,
      matchedRows: Array.from(matchedByCompany.values()),
      unmatchedRows,
    }
  }

  async function saveImportedCampaign() {
    if (!importPreview) return

    const cleanedCampaignName = importCampaignName.trim()

    if (!cleanedCampaignName) {
      setErrorMessage('Give the imported campaign a name before saving.')
      return
    }

    if (importPreview.matchedRows.length === 0) {
      setErrorMessage('No companies were matched, so nothing can be saved.')
      return
    }

    setSavingImport(true)
    setErrorMessage('')
    setMessage('')
    setLastImportedCampaignId(null)

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .insert({
        name: cleanedCampaignName,
        description: `Imported from previous CSV "${importPreview.fileName}". ${importPreview.matchedRows.length} companies matched. ${importPreview.unmatchedRows.length} rows could not be matched.`,
      })
      .select('id, name')
      .single()

    if (campaignError || !campaignData) {
      setErrorMessage(campaignError?.message || 'Could not create campaign.')
      setSavingImport(false)
      return
    }

    const payload = importPreview.matchedRows.map((row) => ({
      campaign_id: campaignData.id,
      company_id: row.company_id,
      contact_id: row.contact_id,
      email_address_used: row.email_address_used,
      email_status: row.email_status,
      outcome: row.outcome,
      notes: row.notes,
    }))

    const { error: campaignCompaniesError } = await supabase
      .from('campaign_companies')
      .insert(payload)

    if (campaignCompaniesError) {
      setErrorMessage(campaignCompaniesError.message)
      setSavingImport(false)
      return
    }

    setLastImportedCampaignId(campaignData.id)
    setMessage(
      `Imported "${cleanedCampaignName}" with ${importPreview.matchedRows.length} compan${
        importPreview.matchedRows.length === 1 ? 'y' : 'ies'
      }.`,
    )

    setImportPreview(null)
    setImportCampaignName('')
    await loadCampaignHistory()
    setSavingImport(false)
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/campaigns" className="text-sm font-bold text-red-600">
            ← Back to campaigns
          </Link>

          <div className="mt-6 max-w-3xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Campaign history
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Review campaign performance.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Open saved campaigns, review selected companies, and track
              bounces, out-of-office replies, quotes and customers.
            </p>
          </div>

          <div className="mt-6">
            <Link
              href="/campaigns/builder"
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
            >
              Build new campaign
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-6">
          <SummaryCard label="Campaigns" value={visibleCampaigns.length} />
          <SummaryCard label="Selected" value={totals.selected} />
          <SummaryCard label="Bounced" value={totals.bounced} urgent={totals.bounced > 0} />
          <SummaryCard label="Out of office" value={totals.outOfOffice} urgent={totals.outOfOffice > 0} />
          <SummaryCard label="Quoted" value={totals.quoted} urgent={totals.quoted > 0} />
          <SummaryCard label="Customers" value={totals.customers} urgent={totals.customers > 0} />
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black text-stone-950">
            Import previous campaign CSV
          </h2>

          <p className="mt-1 text-sm text-stone-500">
            Upload an old campaign CSV that was downloaded before campaign
            saving existed. The system will match companies by contact email
            first, then by company name.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                Upload CSV
              </span>

              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                disabled={uploading || savingImport}
                className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
              />
            </label>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600">
              <p className="font-bold text-stone-900">Expected columns:</p>

              <p className="mt-1">
                Campaign Name, First Name, Last Name, Company Name, Email
                Address, Email Status, Outcome and Notes. It also works with
                simpler CSVs that only have Company and Email columns.
              </p>
            </div>
          </div>

          {importPreview ? (
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-5">
              <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-wide text-red-700">
                    Campaign name to save
                  </span>

                  <input
                    value={importCampaignName}
                    onChange={(event) =>
                      setImportCampaignName(event.target.value)
                    }
                    className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-100"
                  />
                </label>

                <div className="grid grid-cols-3 gap-3">
                  <SmallStat label="CSV rows" value={importPreview.totalRows} />
                  <SmallStat
                    label="Matched"
                    value={importPreview.matchedRows.length}
                  />
                  <SmallStat
                    label="Unmatched"
                    value={importPreview.unmatchedRows.length}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveImportedCampaign}
                  disabled={savingImport || importPreview.matchedRows.length === 0}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingImport ? 'Saving import...' : 'Save imported campaign'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setImportPreview(null)
                    setImportCampaignName('')
                  }}
                  disabled={savingImport}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                >
                  Cancel import
                </button>
              </div>

              {importPreview.unmatchedRows.length > 0 ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-bold text-amber-900">
                    Some rows could not be matched.
                  </p>

                  <p className="mt-1 text-sm text-amber-800">
                    These rows will not be saved unless the company/contact
                    already exists in the database. First few unmatched company
                    names:
                  </p>

                  <ul className="mt-3 list-inside list-disc text-sm text-amber-900">
                    {importPreview.unmatchedRows.slice(0, 8).map((row, index) => (
                      <li key={index}>
                        {getCsvValue(row, [
                          'Company Name',
                          'Company',
                          'Business Name',
                          'company_name',
                        ]) || 'Unnamed company'}{' '}
                        —{' '}
                        {getCsvValue(row, [
                          'Email Address',
                          'Email',
                          'email',
                        ]) || 'no email'}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {lastImportedCampaignId ? (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="font-bold text-green-800">
                Imported campaign saved.
              </p>

              <Link
                href={`/campaigns/${lastImportedCampaignId}`}
                className="mt-3 inline-flex rounded-xl bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-800"
              >
                Open imported campaign
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black text-stone-950">
            Overall success
          </h2>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <MetricBlock label="Success rate" value={percent(totals.success, totals.selected)} />
            <MetricBlock label="Quote rate" value={percent(totals.quoted, totals.selected)} />
            <MetricBlock label="Customer rate" value={percent(totals.customers, totals.selected)} />
            <MetricBlock label="Bounce rate" value={percent(totals.bounced, totals.selected)} />
          </div>
        </div>

        {message ? (
          <p className="mt-6 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700">
            {message}
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-950">
                Saved campaigns
              </h2>

              <p className="mt-1 text-sm text-stone-500">
                Open a campaign to mark bounced emails, out-of-office replies,
                quotes and customers.
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-bold text-stone-700">
              <input
                type="checkbox"
                checked={showArchived}
                disabled={savingDetails}
                onChange={(event) => {
                  const checked = event.target.checked
                  setShowArchived(checked)
                  if (!checked && campaigns.some((campaign) => campaign.id === detailsEditor?.id && campaign.archived_at)) {
                    setDetailsEditor(null)
                  }
                }}
                className="h-4 w-4 accent-red-600"
              />
              Show archived ({archivedCount})
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-4 py-3">Selected</th>
                  <th className="px-4 py-3">Bounced</th>
                  <th className="px-4 py-3">OOO</th>
                  <th className="px-4 py-3">Quoted</th>
                  <th className="px-4 py-3">Customers</th>
                  <th className="px-4 py-3">Success</th>
                  <th className="px-4 py-3">Bounce rate</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={10}>
                      Loading saved campaigns...
                    </td>
                  </tr>
                ) : visibleCampaigns.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={10}>
                      {campaigns.length === 0
                        ? 'No campaigns have been saved yet.'
                        : 'No active campaigns. Turn on “Show archived” to view archived campaigns.'}
                    </td>
                  </tr>
                ) : (
                  visibleCampaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className={`border-t border-stone-100 align-top ${
                        campaign.archived_at ? 'bg-stone-50/80' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="font-black text-stone-950 hover:text-red-600"
                          >
                            {campaign.name}
                          </Link>

                          {campaign.archived_at ? (
                            <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-stone-600">
                              Archived
                            </span>
                          ) : null}
                        </div>

                        {detailsEditor?.id === campaign.id ? (
                          <form onSubmit={saveCampaignDetails} className="mt-3 min-w-56 max-w-md">
                            <label className="block text-xs font-semibold text-stone-700">
                              Campaign details
                              <textarea
                                value={detailsEditor.draft}
                                onChange={(event) =>
                                  setDetailsEditor({ ...detailsEditor, draft: event.target.value })
                                }
                                disabled={savingDetails}
                                rows={4}
                                className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal focus:border-red-500 focus:outline-none"
                              />
                            </label>
                            {detailsError ? (
                              <p role="alert" className="mt-2 text-xs text-red-700">{detailsError}</p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button type="submit" disabled={savingDetails} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">
                                {savingDetails ? 'Saving…' : 'Save details'}
                              </button>
                              <button type="button" disabled={savingDetails} onClick={() => setDetailsEditor(null)} className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50">
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            {campaign.description ? (
                              <p className="mt-1 max-w-md whitespace-pre-wrap [overflow-wrap:anywhere] text-xs text-stone-500">
                                {campaign.description}
                              </p>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`Edit details for ${campaign.name}`}
                              disabled={detailsEditor !== null || archivingId === campaign.id}
                              onClick={() => {
                                setDetailsError('')
                                setDetailsEditor({
                                  id: campaign.id,
                                  original: campaign.description,
                                  draft: campaign.description ?? '',
                                })
                              }}
                              className="mt-2 text-xs font-bold text-red-700 hover:underline disabled:opacity-50"
                            >
                              {campaign.description ? 'Edit details' : 'Add details'}
                            </button>
                          </>
                        )}
                      </td>

                      <td className="px-4 py-3 font-bold">
                        {campaign.selected_count}
                      </td>

                      <td className="px-4 py-3">
                        {campaign.bounced_count}
                      </td>

                      <td className="px-4 py-3">
                        {campaign.out_of_office_count}
                      </td>

                      <td className="px-4 py-3">{campaign.quoted_count}</td>

                      <td className="px-4 py-3">{campaign.customer_count}</td>

                      <td className="px-4 py-3 font-bold">
                        {campaign.success_rate}
                      </td>

                      <td className="px-4 py-3">{campaign.bounce_rate}</td>

                      <td className="px-4 py-3">
                        {formatDate(campaign.created_at)}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-2">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                          >
                            Open campaign
                          </Link>

                          <button
                            type="button"
                            onClick={() =>
                              setCampaignArchived(campaign, !campaign.archived_at)
                            }
                            disabled={archivingId === campaign.id || detailsEditor?.id === campaign.id}
                            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 disabled:opacity-50"
                          >
                            {archivingId === campaign.id
                              ? 'Saving...'
                              : campaign.archived_at
                                ? 'Restore'
                                : 'Archive'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

function parseCsv(text: string): ParsedCsvRow[] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentValue = ''
  let insideQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && insideQuotes && nextChar === '"') {
      currentValue += '"'
      index += 1
      continue
    }

    if (char === '"') {
      insideQuotes = !insideQuotes
      continue
    }

    if (char === ',' && !insideQuotes) {
      currentRow.push(currentValue)
      currentValue = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }

      currentRow.push(currentValue)

      if (currentRow.some((value) => value.trim())) {
        rows.push(currentRow)
      }

      currentRow = []
      currentValue = ''
      continue
    }

    currentValue += char
  }

  currentRow.push(currentValue)

  if (currentRow.some((value) => value.trim())) {
    rows.push(currentRow)
  }

  if (rows.length < 2) return []

  const headers = rows[0].map((header) => header.trim())

  return rows.slice(1).map((row) => {
    const record: ParsedCsvRow = {}

    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() || ''
    })

    return record
  })
}

function getCsvValue(row: ParsedCsvRow, keys: string[]) {
  const normalisedEntries = Object.entries(row).map(([key, value]) => ({
    key: key.trim().toLowerCase(),
    value,
  }))

  for (const key of keys) {
    const found = normalisedEntries.find(
      (entry) => entry.key === key.trim().toLowerCase(),
    )

    if (found?.value?.trim()) {
      return found.value.trim()
    }
  }

  return ''
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

function getCompanyName(company: DbRow) {
  return getString(company, ['company_name', 'business_name', 'name'])
}

function getContactEmail(contact: DbRow) {
  return getString(contact, ['email_address', 'email'])
}

function normaliseEmail(value: string) {
  return value.trim().toLowerCase()
}

function normaliseKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function mapEmailStatus(value: string) {
  const cleaned = value.trim().toLowerCase().replaceAll('_', ' ')

  if (cleaned.includes('bounce')) return 'bounced'
  if (cleaned.includes('out of office') || cleaned === 'ooo') {
    return 'out_of_office'
  }
  if (cleaned.includes('sent')) return 'sent'
  if (cleaned.includes('no response')) return 'no_response'

  return 'selected'
}

function mapOutcome(value: string) {
  const cleaned = value.trim().toLowerCase().replaceAll('_', ' ')

  if (cleaned === 'customer' || cleaned === 'won') return 'customer'
  if (
    cleaned === 'quoted' ||
    cleaned === 'quote sent' ||
    cleaned === 'negotiating'
  ) {
    return 'quoted'
  }
  if (cleaned === 'negative') return 'negative'
  if (cleaned === 'dnc') return 'dnc'
  if (cleaned === 'no answer') return 'no_answer'

  return 'none'
}

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('en-GB')
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }

  return chunks
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-black text-stone-950">{value}</p>
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
