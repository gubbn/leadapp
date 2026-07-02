'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type SavedCampaign = {
  id: string
  name: string
  description: string | null
  created_at: string | null
  updated_at: string | null
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

export default function CampaignHistoryPage() {
  const [campaigns, setCampaigns] = useState<SavedCampaignSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    loadCampaignHistory()
  }, [])

  const totals = useMemo(() => {
    const selected = campaigns.reduce(
      (total, campaign) => total + campaign.selected_count,
      0,
    )

    const bounced = campaigns.reduce(
      (total, campaign) => total + campaign.bounced_count,
      0,
    )

    const outOfOffice = campaigns.reduce(
      (total, campaign) => total + campaign.out_of_office_count,
      0,
    )

    const quoted = campaigns.reduce(
      (total, campaign) => total + campaign.quoted_count,
      0,
    )

    const customers = campaigns.reduce(
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
  }, [campaigns])

  async function loadCampaignHistory() {
    setLoading(true)
    setErrorMessage('')

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, description, created_at, updated_at')
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
          <SummaryCard label="Campaigns" value={campaigns.length} />
          <SummaryCard label="Selected" value={totals.selected} />
          <SummaryCard label="Bounced" value={totals.bounced} urgent={totals.bounced > 0} />
          <SummaryCard label="Out of office" value={totals.outOfOffice} urgent={totals.outOfOffice > 0} />
          <SummaryCard label="Quoted" value={totals.quoted} urgent={totals.quoted > 0} />
          <SummaryCard label="Customers" value={totals.customers} urgent={totals.customers > 0} />
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

        {errorMessage ? (
          <p className="mt-6 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-xl font-black text-stone-950">
              Saved campaigns
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Open a campaign to mark bounced emails, out-of-office replies,
              quotes and customers.
            </p>
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
                ) : campaigns.length === 0 ? (
                  <tr>
                    <td className="px-4 py-5 text-stone-500" colSpan={10}>
                      No campaigns have been saved yet.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr
                      key={campaign.id}
                      className="border-t border-stone-100 align-top"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-black text-stone-950 hover:text-red-600"
                        >
                          {campaign.name}
                        </Link>

                        {campaign.description ? (
                          <p className="mt-1 max-w-md text-xs text-stone-500">
                            {campaign.description}
                          </p>
                        ) : null}
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
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                        >
                          Open campaign
                        </Link>
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