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

export default function AppHeader() {
  const pathname = usePathname()

  return (
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

          <LogoutButton />
        </nav>
      </div>
    </header>
  )
}