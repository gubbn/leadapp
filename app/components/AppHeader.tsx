'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/app/components/LogoutButton'

type NavItem = {
  href: string
  label: string
  description: string
}

type NavGroup = {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'CRM',
    items: [
      { href: '/', label: 'Overview', description: 'Dashboard and priorities' },
      { href: '/companies', label: 'Companies', description: 'Business records' },
      { href: '/contacts', label: 'Contacts', description: 'People and follow-ups' },
    ],
  },
  {
    label: 'Lead management',
    items: [
      { href: '/add', label: 'Add lead', description: 'Create a lead manually' },
      { href: '/import', label: 'Import', description: 'Upload a spreadsheet' },
      { href: '/cleanup', label: 'Cleanup', description: 'Review imported data' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { href: '/campaigns', label: 'Campaigns', description: 'Build and track campaigns' },
      { href: '/offers', label: 'Offers', description: 'Offers and claimants' },
      { href: '/automation', label: 'Automation', description: 'Sending and tracking' },
      { href: '/social', label: 'Social', description: 'Plan social content' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { href: '/reports', label: 'Reports', description: 'Performance and lead stats' },
    ],
  },
]

const campaignSubItems = [
  { href: '/campaigns', label: 'Campaign home' },
  { href: '/campaigns/builder', label: 'Builder' },
  { href: '/campaigns/history', label: 'History' },
]

const socialSubItems = [
  { href: '/social', label: 'Content bank' },
  { href: '/social/planner', label: 'Planner setup' },
  { href: '/social/facebook-groups', label: 'Facebook groups' },
]

function isItemActive(pathname: string, href: string) {
  return href === '/'
    ? pathname === '/'
    : pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppHeader() {
  const pathname = usePathname()
  const isCampaignSection =
    pathname === '/campaigns' || pathname.startsWith('/campaigns/')
  const isSocialSection =
    pathname === '/social' || pathname.startsWith('/social/')
  const activeItem = navGroups
    .flatMap((group) => group.items)
    .find((item) => isItemActive(pathname, item.href))

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex min-h-16 items-center justify-between gap-5 py-3">
          <Link href="/" className="shrink-0 rounded-lg focus:outline-none focus:ring-4 focus:ring-red-100">
            <p className="text-xl font-black tracking-tight text-red-600">
              Fixing IT
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
              Marketing CRM
            </p>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden min-w-0 flex-1 items-center justify-end gap-1 xl:flex"
          >
            {navGroups.map((group, groupIndex) => (
              <div key={group.label} className="flex items-center">
                {groupIndex > 0 ? (
                  <span className="mx-2 h-6 w-px bg-stone-200" aria-hidden="true" />
                ) : null}
                <div className="flex items-center gap-1">
                  {group.items.map((item) => {
                    const active = isItemActive(pathname, item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={item.description}
                        aria-current={active ? 'page' : undefined}
                        className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                          active
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
                        }`}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="hidden shrink-0 xl:block">
            <LogoutButton />
          </div>

          <details className="group relative xl:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 transition hover:bg-stone-100 [&::-webkit-details-marker]:hidden">
              <span className="text-left">
                <span className="block text-[10px] font-black uppercase tracking-wide text-stone-400">
                  Navigate
                </span>
                <span className="block max-w-32 truncate text-sm font-black text-stone-800">
                  {activeItem?.label ?? 'Menu'}
                </span>
              </span>
              <span className="text-stone-400 transition group-open:rotate-180" aria-hidden="true">
                ▾
              </span>
            </summary>

            <div className="absolute right-0 mt-2 max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
              <div className="space-y-4">
                {navGroups.map((group) => (
                  <section key={group.label}>
                    <p className="px-2 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
                      {group.label}
                    </p>
                    <div className="mt-1 grid gap-1 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const active = isItemActive(pathname, item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={`rounded-xl p-3 transition ${
                              active
                                ? 'bg-red-50 text-red-700'
                                : 'hover:bg-stone-50'
                            }`}
                          >
                            <span className="block text-sm font-black">
                              {item.label}
                            </span>
                            <span className={`mt-0.5 block text-xs ${active ? 'text-red-500' : 'text-stone-400'}`}>
                              {item.description}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
              <div className="mt-3 border-t border-stone-100 px-2 pt-3">
                <LogoutButton />
              </div>
            </div>
          </details>
        </div>
      </div>

      {isCampaignSection ? (
        <SectionNav label="Campaigns" pathname={pathname} items={campaignSubItems} />
      ) : null}

      {isSocialSection ? (
        <SectionNav label="Social" pathname={pathname} items={socialSubItems} />
      ) : null}
    </header>
  )
}

function SectionNav({
  label,
  pathname,
  items,
}: {
  label: string
  pathname: string
  items: { href: string; label: string }[]
}) {
  return (
    <div className="border-t border-stone-100 bg-stone-50">
      <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-4 py-2.5 text-sm font-semibold">
        <span className="mr-1 shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">
          {label}
        </span>
        {items.map((item) => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 transition ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 hover:text-red-600'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
