'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/app/components/LogoutButton'

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/add', label: 'Add lead' },
  { href: '/import', label: 'Import' },
  { href: '/cleanup', label: 'Cleanup' },
  { href: '/companies', label: 'Companies' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/reports', label: 'Reports' },
]

const campaignSubItems = [
  { href: '/campaigns/builder', label: 'Builder' },
  { href: '/campaigns/history', label: 'History' },
]

export default function AppHeader() {
  const pathname = usePathname()
  const isCampaignSection =
    pathname === '/campaigns' || pathname.startsWith('/campaigns/')

  return (
    <header className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group">
            <p className="text-xl font-black tracking-tight text-red-600">
              Fixing IT
            </p>

            <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-400">
              Marketing Dashboard
            </p>
          </Link>

          <div className="md:hidden">
            <LogoutButton />
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2 text-sm font-semibold text-stone-600">
          {navItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 transition ${
                  isActive
                    ? 'bg-red-50 text-red-600'
                    : 'hover:bg-stone-100 hover:text-red-600'
                }`}
              >
                {item.label}
              </Link>
            )
          })}

          <div className="hidden md:block">
            <LogoutButton />
          </div>
        </nav>
      </div>

      {isCampaignSection ? (
        <div className="border-t border-stone-100 bg-stone-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3 text-sm font-semibold">
            <span className="mr-1 text-xs font-black uppercase tracking-wide text-stone-400">
              Campaigns
            </span>

            {campaignSubItems.map((item) => {
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 transition ${
                    isActive
                      ? 'bg-red-600 text-white'
                      : 'bg-white text-stone-700 hover:bg-red-50 hover:text-red-600'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}
    </header>
  )
}