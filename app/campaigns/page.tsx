import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'

export const dynamic = 'force-dynamic'

export default function CampaignsPage() {
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
              Campaigns
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Build campaigns and review performance.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Build new mail merge campaigns, save selected companies to
              campaign history, then review bounced emails, out-of-office
              replies, quotes and customers.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2">
          <Link
            href="/campaigns/builder"
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
          >
            <p className="text-sm font-black uppercase tracking-wide text-red-600">
              Builder
            </p>

            <h2 className="mt-3 text-2xl font-black text-stone-950">
              Build a campaign
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Filter companies by size, industry, location, email quality and
              relationship status. Save the selected companies and download the
              CSV for mail merge.
            </p>

            <span className="mt-6 inline-flex rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white">
              Open builder
            </span>
          </Link>

          <Link
            href="/campaigns/history"
            className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-red-200 hover:shadow-md"
          >
            <p className="text-sm font-black uppercase tracking-wide text-red-600">
              History
            </p>

            <h2 className="mt-3 text-2xl font-black text-stone-950">
              Campaign history
            </h2>

            <p className="mt-3 text-sm leading-6 text-stone-600">
              Review saved campaigns, open campaign records, track bounces,
              out-of-office replies, quoted companies and customers.
            </p>

            <span className="mt-6 inline-flex rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white">
              Open history
            </span>
          </Link>
        </div>
      </section>
    </main>
  )
}