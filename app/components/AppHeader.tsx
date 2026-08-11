'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import LogoutButton from '@/app/components/LogoutButton'

type MenuItem = {
  href: string
  label: string
  description: string
}

type Menu = {
  label: string
  href: string
  match: string[]
  items: MenuItem[]
}

const menus: Menu[] = [
  {
    label: 'CRM',
    href: '/companies',
    match: ['/companies', '/contacts', '/add', '/import', '/cleanup', '/duplicates', '/location-research', '/prospecting'],
    items: [
      { href: '/companies', label: 'Companies', description: 'Business records' },
      { href: '/contacts', label: 'Contacts', description: 'People and follow-ups' },
      { href: '/add', label: 'Add lead', description: 'Create a lead manually' },
      { href: '/import', label: 'Import leads', description: 'Upload a spreadsheet' },
      { href: '/cleanup', label: 'Data cleanup', description: 'Review imported records' },
      { href: '/duplicates', label: 'Duplicates', description: 'Find matching companies' },
      { href: '/location-research', label: 'Location categories', description: 'Assign UK counties to places' },
      { href: '/prospecting', label: 'Prospecting queue', description: 'Research, qualify and create next actions' },
    ],
  },
  {
    label: 'Sales',
    href: '/sales',
    match: ['/sales'],
    items: [
      { href: '/sales', label: 'Deal pipeline', description: 'Move opportunities toward a contract' },
      { href: '/#tasks', label: 'Tasks', description: 'Today’s follow-ups and next actions' },
      { href: '/sales/workflows', label: 'Health checks, proposals and renewals', description: 'Work the timing-sensitive queues' },
      { href: '/quotes', label: 'Quotes', description: 'Track quote values and follow-up chases' },
    ],
  },
  {
    label: 'Marketing',
    href: '/campaigns',
    match: ['/campaigns', '/offers', '/automation', '/social'],
    items: [
      { href: '/campaigns', label: 'Campaign home', description: 'View campaign activity' },
      { href: '/campaigns/builder', label: 'Campaign builder', description: 'Create a targeted list' },
      { href: '/campaigns/history', label: 'Campaign history', description: 'Review previous sends' },
      { href: '/social', label: 'Content bank', description: 'Capture useful stories' },
      { href: '/social/planner', label: 'Social planner', description: 'Create weekly posts' },
      { href: '/social/facebook-groups', label: 'Facebook groups', description: 'Manage community channels' },
      { href: '/offers', label: 'Offers', description: 'Manage offers and claimants' },
      { href: '/automation', label: 'Automation', description: 'Sending and tracking setup' },
    ],
  },
  {
    label: 'Playbook',
    href: '/playbook',
    match: ['/playbook', '/knowledgebase'],
    items: [
      { href: '/playbook', label: 'Playbook overview', description: 'Six-month strategy progress' },
      { href: '/playbook#monthly-plan', label: 'Monthly plan', description: 'Campaign actions and targets' },
      { href: '/playbook#weekly-rhythm', label: 'Weekly rhythm', description: 'Repeatable weekly checklist' },
      { href: '/playbook#scorecard', label: 'Scorecard', description: 'Record monthly performance' },
      { href: '/knowledgebase', label: 'CRM knowledge base', description: 'Full system and workflow guide' },
    ],
  },
]

function pathMatches(pathname: string, path: string) {
  return path === '/'
    ? pathname === '/'
    : pathname === path || pathname.startsWith(`${path}/`)
}

function menuIsActive(pathname: string, menu: Menu) {
  return menu.match.some((path) => pathMatches(pathname, path))
}

export default function AppHeader() {
  const pathname = usePathname()
  const activeMenu = menus.find((menu) => menuIsActive(pathname, menu))
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMobileMenu, setOpenMobileMenu] = useState<string | null>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    function dismiss(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null)
        setMobileOpen(false)
        setOpenMobileMenu(null)
      }
    }

    function dismissWithKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null)
        setMobileOpen(false)
        setOpenMobileMenu(null)
      }
    }

    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismissWithKeyboard)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismissWithKeyboard)
    }
  }, [])

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-5 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 rounded-lg focus:outline-none focus:ring-4 focus:ring-red-100"
        >
          <p className="text-xl font-black tracking-tight text-red-600">Fixing IT</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">
            Marketing CRM
          </p>
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-2 md:flex">
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
              pathname === '/'
                ? 'bg-stone-950 text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
            }`}
          >
            Today
          </Link>
          {menus.map((menu) => (
            <DesktopMenu
              key={menu.label}
              menu={menu}
              active={menuIsActive(pathname, menu)}
              pathname={pathname}
              open={openMenu === menu.label}
              onToggle={() =>
                setOpenMenu((current) =>
                  current === menu.label ? null : menu.label,
                )
              }
              onNavigate={() => setOpenMenu(null)}
            />
          ))}

          <Link
            href="/reports"
            aria-current={pathMatches(pathname, '/reports') ? 'page' : undefined}
            className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
              pathMatches(pathname, '/reports')
                ? 'bg-stone-950 text-white'
                : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
            }`}
          >
            Reports
          </Link>
        </nav>

        <div className="hidden shrink-0 lg:block">
          <LogoutButton />
        </div>

        <details open={mobileOpen} className="group relative md:hidden">
          <summary
            onClick={(event) => {
              event.preventDefault()
              setMobileOpen((current) => !current)
              setOpenMobileMenu(null)
            }}
            className="flex cursor-pointer list-none items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 transition hover:bg-stone-100 [&::-webkit-details-marker]:hidden"
          >
            <span className="text-left">
              <span className="block text-[10px] font-black uppercase tracking-wide text-stone-400">
                Navigate
              </span>
              <span className="block max-w-32 truncate text-sm font-black text-stone-800">
                {activeMenu?.label ?? (pathMatches(pathname, '/reports') ? 'Reports' : 'Menu')}
              </span>
            </span>
            <span className="text-stone-400 transition group-open:rotate-180" aria-hidden="true">
              ▾
            </span>
          </summary>

          <div className="absolute right-0 mt-2 max-h-[calc(100vh-6rem)] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3 shadow-xl">
            <div className="space-y-3">
              <Link
                href="/"
                onClick={() => setMobileOpen(false)}
                className={`block rounded-xl px-4 py-3 text-sm font-black ${
                  pathname === '/' ? 'bg-stone-950 text-white' : 'bg-stone-50 text-stone-800'
                }`}
              >
                Today
              </Link>
              {menus.map((menu) => (
                <MobileMenu
                  key={menu.label}
                  menu={menu}
                  pathname={pathname}
                  open={openMobileMenu === menu.label}
                  onToggle={() =>
                    setOpenMobileMenu((current) =>
                      current === menu.label ? null : menu.label,
                    )
                  }
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
              <Link
                href="/reports"
                onClick={() => setMobileOpen(false)}
                className={`block rounded-xl px-4 py-3 text-sm font-black ${
                  pathMatches(pathname, '/reports')
                    ? 'bg-red-600 text-white'
                    : 'bg-stone-50 text-stone-800'
                }`}
              >
                Reports
              </Link>
            </div>
            <div className="mt-3 border-t border-stone-100 px-2 pt-3">
              <LogoutButton />
            </div>
          </div>
        </details>
      </div>
    </header>
  )
}

function DesktopMenu({
  menu,
  active,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  menu: Menu
  active: boolean
  pathname: string
  open: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  return (
    <details open={open} className="group relative">
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
        className={`flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition [&::-webkit-details-marker]:hidden ${
          active
            ? 'bg-red-600 text-white shadow-sm'
            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-950'
        }`}
      >
        {menu.label}
        <span
          className={`text-[10px] transition group-open:rotate-180 ${
            active ? 'text-red-100' : 'text-stone-400'
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </summary>

      <div className="absolute left-1/2 mt-2 w-72 -translate-x-1/2 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
        <div className="border-b border-stone-100 px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-500">
            {menu.label}
          </p>
        </div>
        <div className="mt-1 space-y-1">
          {menu.items.map((item) => {
            const itemPath = item.href.split('#')[0]
            const itemActive =
              item.href.includes('#')
                ? false
                : itemPath === '/'
                  ? pathname === '/'
                  : pathname === itemPath
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={itemActive ? 'page' : undefined}
                className={`block rounded-xl px-3 py-2.5 transition ${
                  itemActive ? 'bg-red-50' : 'hover:bg-stone-50'
                }`}
              >
                <span className={`block text-sm font-black ${itemActive ? 'text-red-700' : 'text-stone-800'}`}>
                  {item.label}
                </span>
                <span className="mt-0.5 block text-xs text-stone-400">{item.description}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </details>
  )
}

function MobileMenu({
  menu,
  pathname,
  open,
  onToggle,
  onNavigate,
}: {
  menu: Menu
  pathname: string
  open: boolean
  onToggle: () => void
  onNavigate: () => void
}) {
  const active = menuIsActive(pathname, menu)
  return (
    <details open={open} className="rounded-xl border border-stone-200 bg-white">
      <summary
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
        className={`flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-sm font-black [&::-webkit-details-marker]:hidden ${
          active ? 'bg-red-600 text-white' : 'bg-stone-50 text-stone-800'
        }`}
      >
        {menu.label}
        <span aria-hidden="true">▾</span>
      </summary>
      <div className="space-y-1 p-2">
        {menu.items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="block rounded-lg px-3 py-2 text-sm font-bold text-stone-600 hover:bg-red-50 hover:text-red-700"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  )
}
