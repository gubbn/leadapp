import type { ReactNode } from 'react'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import LogoutButton from './components/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function MarketingDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const [
    contactsResult,
    companiesResult,
    due90Result,
    cleanupResult,
    duplicateResult,
  ] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true }),

    supabase.from('companies').select('id', { count: 'exact', head: true }),

    supabase.from('contacts_due_90_days').select('contact_id', {
      count: 'exact',
      head: true,
    }),

    supabase
      .from('lead_import_rows')
      .select('id', { count: 'exact', head: true })
      .or(
  'needs_contact_name_cleanup.eq.true,needs_email_cleanup.eq.true,needs_dnc_review.eq.true'
)
      .eq('approved_to_crm', false),

    supabase.from('company_duplicate_groups').select('match_key', {
      count: 'exact',
      head: true,
    }),
  ])

  const totalContacts = contactsResult.count ?? 0
  const totalCompanies = companiesResult.count ?? 0
  const due90 = due90Result.count ?? 0
  const cleanup = cleanupResult.count ?? 0
  const duplicates = duplicateResult.count ?? 0

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <Link href="/" className="group">
            <p className="text-xl font-black tracking-tight text-red-600">
              Fixing IT
            </p>

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              Marketing Dashboard
            </p>
          </Link>

          <nav className="hidden items-center gap-2 text-sm font-semibold text-stone-600 md:flex">
            <NavLink href="/import">Import</NavLink>
            <NavLink href="/cleanup">Cleanup</NavLink>
            <NavLink href="/companies">Companies</NavLink>
            <NavLink href="/contacts">Contacts</NavLink>
            <NavLink href="/campaigns">Campaigns</NavLink>
            <NavLink href="/duplicates">Duplicates</NavLink>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 lg:grid-cols-[1.4fr_0.6fr] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              Lead management
            </p>

            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Clean, segment and export your marketing leads.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
              Import your spreadsheet, flag messy data, spot duplicate
              businesses, split companies into campaign groups and export clean
              mail merge lists when you are ready to send.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/import"
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-red-700"
              >
                Import spreadsheet
              </Link>

              <Link
                href="/campaigns"
                className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-800 shadow-sm transition hover:bg-stone-50"
              >
                Build campaign
              </Link>

              <Link
                href="/duplicates"
                className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-bold text-stone-800 shadow-sm transition hover:bg-stone-50"
              >
                Check duplicates
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-stone-500">
              Today&apos;s focus
            </p>

            <div className="mt-4 space-y-3">
              <FocusItem
                label="Contacts due 90+ day follow-up"
                value={due90}
                urgent={due90 > 0}
              />

              <FocusItem
                label="Imported rows needing cleanup"
                value={cleanup}
                urgent={cleanup > 0}
              />

              <FocusItem
                label="Possible duplicate businesses"
                value={duplicates}
                urgent={duplicates > 0}
              />

              <FocusItem label="Clean export contacts" value={totalContacts} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <DashboardCard
            label="Companies"
            value={totalCompanies}
            href="/companies"
            helper="Businesses in your CRM"
          />

          <DashboardCard
            label="Contacts"
            value={totalContacts}
            href="/contacts"
            helper="Clean contact records"
          />

          <DashboardCard
            label="90+ days due"
            value={due90}
            href="/campaigns?due90=true"
            helper="Ready for follow-up"
            urgent={due90 > 0}
          />

          <DashboardCard
            label="Cleanup needed"
            value={cleanup}
            href="/cleanup"
            helper="Rows needing attention"
            urgent={cleanup > 0}
          />

          <DashboardCard
            label="Duplicates"
            value={duplicates}
            href="/duplicates"
            helper="Possible duplicate companies"
            urgent={duplicates > 0}
          />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-4">
          <ActionCard
            step="01"
            title="Import spreadsheet"
            description="Upload your CSV and let the dashboard check names, emails, DNC status and company size."
            href="/import"
            buttonLabel="Import leads"
          />

          <ActionCard
            step="02"
            title="Clean imported rows"
            description="Review contacts that need splitting, missing details, or business size classification."
            href="/cleanup"
            buttonLabel="Open cleanup"
          />

          <ActionCard
            step="03"
            title="Check duplicates"
            description="Find companies that may already exist because of similar names or matching domains."
            href="/duplicates"
            buttonLabel="Review duplicates"
          />

          <ActionCard
            step="04"
            title="Export campaign list"
            description="Filter by business size, location, industry and 90-day follow-up status."
            href="/campaigns"
            buttonLabel="Create export"
          />
        </div>
      </section>
    </main>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 transition hover:bg-stone-100 hover:text-red-600"
    >
      {children}
    </Link>
  )
}

function DashboardCard({
  label,
  value,
  href,
  helper,
  urgent = false,
}: {
  label: string
  value: number
  href: string
  helper: string
  urgent?: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        urgent ? 'border-red-300 ring-4 ring-red-50' : 'border-stone-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-stone-500">{label}</p>
          <p className="mt-1 text-xs text-stone-400">{helper}</p>
        </div>

        {urgent && (
          <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
            Alert
          </span>
        )}
      </div>

      <p
        className={`mt-5 text-4xl font-black tracking-tight ${
          urgent ? 'text-red-600' : 'text-stone-950'
        }`}
      >
        {value}
      </p>
    </Link>
  )
}

function ActionCard({
  step,
  title,
  description,
  href,
  buttonLabel,
}: {
  step: string
  title: string
  description: string
  href: string
  buttonLabel: string
}) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-500">
            Step {step}
          </p>

          <h2 className="mt-3 text-xl font-black text-stone-950">{title}</h2>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-sm font-black text-red-600">
          {step}
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>

      <Link
        href={href}
        className="mt-6 inline-flex rounded-xl bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600"
      >
        {buttonLabel}
      </Link>
    </section>
  )
}

function FocusItem({
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
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
        urgent
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-stone-200 bg-stone-50 text-stone-700'
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-lg font-black">{value}</span>
    </div>
  )
}