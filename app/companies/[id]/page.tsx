'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import AppHeader from '@/app/components/AppHeader'

type AnyRecord = Record<string, any>

type Contact = {
  id: string
  company_id: string
  first_name: string | null
  last_name: string | null
  email_address: string | null
  role: string | null
  telephone: string | null
  outcome: string | null
  contact_source: string | null
  is_active: boolean | null
  notes: string | null
}

type CampaignHistory = {
  id: string
  campaign_id: string
  company_id: string
  contact_id: string | null
  email_address_used: string | null
  email_status: string | null
  outcome: string | null
  notes: string | null
  created_at: string
  campaigns?: {
    id: string
    name: string
    created_at: string
  } | null
}

function displayValue(value: any) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function contactName(contact: Contact) {
  const name = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  return name || contact.email_address || 'Unnamed contact'
}

function percent(part: number, total: number) {
  if (!total) return '0%'
  return `${((part / total) * 100).toFixed(1)}%`
}

export default function CompanyDetailPage() {
  const params = useParams()
  const companyId = String(params.id)

  const [company, setCompany] = useState<AnyRecord | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadCompany() {
    setLoading(true)
    setError(null)

    const { data: companyData, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single()

    if (companyError) {
      setError(companyError.message)
      setLoading(false)
      return
    }

    const { data: contactData, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (contactsError) {
      setError(contactsError.message)
      setLoading(false)
      return
    }

    const { data: campaignData, error: campaignError } = await supabase
      .from('campaign_companies')
      .select(
        `
        *,
        campaigns (*)
      `
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (campaignError) {
      setError(campaignError.message)
      setLoading(false)
      return
    }

    setCompany(companyData || null)
    setContacts((contactData || []) as Contact[])
    setCampaignHistory((campaignData || []) as CampaignHistory[])
    setLoading(false)
  }

  useEffect(() => {
    loadCompany()
  }, [companyId])

  const stats = useMemo(() => {
    const selected = campaignHistory.length
    const bounced = campaignHistory.filter(
      (row) => row.email_status === 'bounced'
    ).length
    const outOfOffice = campaignHistory.filter(
      (row) => row.email_status === 'out_of_office'
    ).length
    const quoted = campaignHistory.filter((row) => row.outcome === 'quoted')
      .length
    const customer = campaignHistory.filter((row) => row.outcome === 'customer')
      .length

    return {
      selected,
      bounced,
      outOfOffice,
      quoted,
      customer,
      success: quoted + customer,
    }
  }, [campaignHistory])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/companies"
            className="text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            ← Back to companies
          </Link>

          <h1 className="mt-2 text-3xl font-bold">
            {company?.business_name || 'Company'}
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            Company record, contacts and campaign history.
          </p>
        </div>

        {error ? (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-xl border bg-white p-6 text-sm text-slate-600">
            Loading company...
          </div>
        ) : (
          <>
            <section className="mb-6 grid gap-4 md:grid-cols-5">
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Campaigns
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.selected}</p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Bounced
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.bounced}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.bounced, stats.selected)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Out of office
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.outOfOffice}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.outOfOffice, stats.selected)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Quoted
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.quoted}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.quoted, stats.selected)}
                </p>
              </div>

              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Customers
                </p>
                <p className="mt-2 text-3xl font-bold">{stats.customer}</p>
                <p className="text-xs text-slate-500">
                  {percent(stats.customer, stats.selected)}
                </p>
              </div>
            </section>

            <section className="mb-6 rounded-xl border bg-white p-6">
              <h2 className="text-xl font-bold">Company details</h2>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Business name
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(company?.business_name)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Location
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(company?.location)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Industry
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(company?.industry)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Domain
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(company?.domain)}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    DNC
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(
                      company?.is_dnc ??
                        company?.do_not_contact ??
                        company?.dnc ??
                        false
                    )}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Relationship
                  </p>
                  <p className="mt-1 font-medium">
                    {displayValue(
                      company?.relationship ||
                        company?.relationship_status ||
                        company?.status
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="mb-6 overflow-hidden rounded-xl border bg-white">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-bold">Contacts</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Telephone
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Outcome
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Source
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {contacts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          No contacts found for this company.
                        </td>
                      </tr>
                    ) : (
                      contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td className="px-4 py-4 font-medium">
                            {contactName(contact)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(contact.email_address)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(contact.role)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(contact.telephone)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(contact.outcome)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(contact.contact_source)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border bg-white">
              <div className="border-b px-6 py-4">
                <h2 className="text-xl font-bold">Campaign history</h2>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">
                        Campaign
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Email used
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Email status
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Outcome
                      </th>
                      <th className="px-4 py-3 text-left font-semibold">
                        Notes
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {campaignHistory.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-4 py-8 text-center text-slate-500"
                        >
                          This company has not been selected for any campaigns yet.
                        </td>
                      </tr>
                    ) : (
                      campaignHistory.map((history) => (
                        <tr key={history.id}>
                          <td className="px-4 py-4">
                            <Link
                              href={`/campaigns/${history.campaign_id}`}
                              className="font-semibold text-blue-700 hover:text-blue-900"
                            >
                              {history.campaigns?.name || 'Open campaign'}
                            </Link>
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(history.email_address_used)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(history.email_status)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(history.outcome)}
                          </td>
                          <td className="px-4 py-4">
                            {displayValue(history.notes)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}