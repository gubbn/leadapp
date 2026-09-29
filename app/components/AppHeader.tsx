'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  ChevronDown,
  CircleGauge,
  ContactRound,
  FileSearch,
  Handshake,
  Import,
  Layers3,
  ListChecks,
  Mail,
  MapPinned,
  Megaphone,
  Menu,
  MessageSquareText,
  Network,
  Plus,
  Radar,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Tag,
  UsersRound,
  WandSparkles,
  X,
} from 'lucide-react'
import LogoutButton from '@/app/components/LogoutButton'

type MenuItem = {
  href: string
  label: string
  description: string
  icon: LucideIcon
}

type MenuGroup = {
  label: string
  description: string
  match: string[]
  icon: LucideIcon
  items: MenuItem[]
}

const menus: MenuGroup[] = [
  {
    label: 'Relationships',
    description: 'Companies, people and prospecting',
    match: ['/companies', '/contacts', '/networking', '/add', '/import', '/cleanup', '/duplicates', '/location-research', '/prospecting'],
    icon: UsersRound,
    items: [
      { href: '/companies', label: 'Companies', description: 'Business records and context', icon: Building2 },
      { href: '/contacts', label: 'Contacts', description: 'People and follow-ups', icon: ContactRound },
      { href: '/prospecting', label: 'Prospecting queue', description: 'Research and qualify leads', icon: Radar },
      { href: '/networking', label: 'Little black book', description: 'People met and where', icon: Network },
      { href: '/add', label: 'Add a lead', description: 'Create a record manually', icon: Plus },
      { href: '/import', label: 'Import leads', description: 'Bring in a spreadsheet', icon: Import },
      { href: '/cleanup', label: 'Data cleanup', description: 'Review imported records', icon: WandSparkles },
      { href: '/duplicates', label: 'Duplicates', description: 'Find matching companies', icon: SearchCheck },
      { href: '/location-research', label: 'Location research', description: 'Assign UK counties', icon: MapPinned },
    ],
  },
  {
    label: 'Revenue',
    description: 'Pipeline, quotes and renewals',
    match: ['/sales', '/quotes'],
    icon: BriefcaseBusiness,
    items: [
      { href: '/sales', label: 'Deal pipeline', description: 'Move opportunities forward', icon: Handshake },
      { href: '/#tasks', label: 'Tasks', description: 'Today’s next actions', icon: ListChecks },
      { href: '/sales/workflows', label: 'Sales workflows', description: 'Proposals, checks and renewals', icon: Activity },
      { href: '/quotes', label: 'Quotes', description: 'Values and follow-up chases', icon: ReceiptText },
    ],
  },
  {
    label: 'Growth',
    description: 'Campaigns, content and offers',
    match: ['/campaigns', '/offers', '/automation', '/social', '/warranties'],
    icon: Megaphone,
    items: [
      { href: '/campaigns', label: 'Campaign home', description: 'Launch and review campaigns', icon: Mail },
      { href: '/campaigns/builder', label: 'Campaign builder', description: 'Build a targeted audience', icon: Layers3 },
      { href: '/campaigns/history', label: 'Campaign history', description: 'Review previous sends', icon: BarChart3 },
      { href: '/social', label: 'Content bank', description: 'Capture useful stories', icon: MessageSquareText },
      { href: '/social/planner', label: 'Social planner', description: 'Create the weekly plan', icon: Sparkles },
      { href: '/social/facebook-groups', label: 'Facebook groups', description: 'Manage community channels', icon: UsersRound },
      { href: '/offers', label: 'Offers', description: 'Offers and claimants', icon: Tag },
      { href: '/warranties', label: 'Warranty expiry', description: 'Plan timely outreach', icon: ShieldCheck },
      { href: '/automation', label: 'Automation', description: 'Sending and tracking setup', icon: CircleGauge },
    ],
  },
  {
    label: 'Strategy',
    description: 'Playbook, guidance and reporting',
    match: ['/playbook', '/scorecard', '/knowledgebase', '/reports'],
    icon: BookOpenText,
    items: [
      { href: '/playbook', label: 'Playbook', description: 'Strategy, plan and rhythm', icon: BookOpenText },
      { href: '/playbook#monthly-plan', label: 'Monthly plan', description: 'Campaign actions and targets', icon: ListChecks },
      { href: '/scorecard', label: 'Scorecard', description: 'Targets, actuals and conversion', icon: CircleGauge },
      { href: '/knowledgebase', label: 'Knowledge base', description: 'System and workflow guide', icon: FileSearch },
      { href: '/reports', label: 'Reports', description: 'Performance at a glance', icon: BarChart3 },
    ],
  },
]

function pathMatches(pathname: string, path: string) {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
}

function menuIsActive(pathname: string, menu: MenuGroup) {
  return menu.match.some((path) => pathMatches(pathname, path))
}

export default function AppHeader() {
  const pathname = usePathname()
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
    <header ref={headerRef} className="sticky top-0 z-50 border-b border-white/10 bg-stone-950 text-white shadow-[0_8px_30px_rgba(15,18,20,0.14)]">
      <div className="mx-auto flex h-[4.5rem] max-w-[96rem] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400">
          <span className="grid h-9 w-9 place-items-center rounded-[0.7rem] bg-red-600 shadow-[0_8px_20px_rgba(226,61,40,0.28)] transition group-hover:-rotate-3 group-hover:scale-105">
            <span className="text-sm font-black tracking-[-0.08em]">FI</span>
          </span>
          <span className="hidden sm:block">
            <span className="block text-[0.95rem] font-black leading-none tracking-[-0.02em]">Fixing IT</span>
            <span className="mt-1 block text-[0.58rem] font-bold uppercase tracking-[0.22em] text-stone-400">Growth desk</span>
          </span>
        </Link>

        <span className="hidden h-7 w-px bg-white/10 lg:block" aria-hidden="true" />

        <nav aria-label="Primary navigation" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          <Link href="/" aria-current={pathname === '/' ? 'page' : undefined} className={`nav-trigger ${pathname === '/' ? 'nav-trigger-active' : ''}`}>
            <CircleGauge size={16} strokeWidth={2.2} />
            Today
          </Link>
          {menus.map((menu) => (
            <DesktopMenu
              key={menu.label}
              menu={menu}
              pathname={pathname}
              open={openMenu === menu.label}
              onToggle={() => setOpenMenu((current) => current === menu.label ? null : menu.label)}
              onNavigate={() => setOpenMenu(null)}
            />
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <Link href="/add" className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3.5 py-2.5 text-xs font-black text-white shadow-lg shadow-red-950/20 transition hover:bg-red-500">
            <Plus size={15} strokeWidth={3} />
            New lead
          </Link>
          <LogoutButton />
        </div>

        <button
          type="button"
          onClick={() => { setMobileOpen((current) => !current); setOpenMobileMenu(null) }}
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
          className="ml-auto grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-white transition hover:bg-white/10 lg:hidden"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen ? (
        <div id="mobile-navigation" className="absolute inset-x-0 top-full max-h-[calc(100vh-4.5rem)] overflow-y-auto border-t border-white/10 bg-stone-950 p-4 shadow-2xl lg:hidden">
          <div className="mx-auto max-w-2xl space-y-2">
            <Link href="/" onClick={() => setMobileOpen(false)} className={`mobile-nav-row ${pathname === '/' ? 'mobile-nav-row-active' : ''}`}>
              <CircleGauge size={18} />
              <span>Today</span>
            </Link>
            {menus.map((menu) => (
              <MobileMenu
                key={menu.label}
                menu={menu}
                pathname={pathname}
                open={openMobileMenu === menu.label}
                onToggle={() => setOpenMobileMenu((current) => current === menu.label ? null : menu.label)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4">
              <Link href="/add" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white">
                <Plus size={17} /> New lead
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}

function DesktopMenu({ menu, pathname, open, onToggle, onNavigate }: { menu: MenuGroup; pathname: string; open: boolean; onToggle: () => void; onNavigate: () => void }) {
  const active = menuIsActive(pathname, menu)
  const Icon = menu.icon
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} className={`nav-trigger ${active ? 'nav-trigger-active' : ''}`}>
        <Icon size={16} strokeWidth={2.2} />
        {menu.label}
        <ChevronDown size={13} className={`ml-0.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className={`absolute top-[calc(100%+0.85rem)] w-[36rem] overflow-hidden rounded-2xl border border-stone-200 bg-white text-stone-950 shadow-[0_24px_70px_rgba(15,18,20,0.22)] ${menu.label === 'Strategy' ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
          <div className="flex items-center gap-3 border-b border-stone-100 bg-stone-50 px-5 py-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-100 text-red-700"><Icon size={18} /></span>
            <div>
              <p className="text-sm font-black">{menu.label}</p>
              <p className="mt-0.5 text-xs text-stone-500">{menu.description}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-2">
            {menu.items.map((item) => {
              const itemPath = item.href.split('#')[0]
              const itemActive = !item.href.includes('#') && (itemPath === '/' ? pathname === '/' : pathname === itemPath)
              const ItemIcon = item.icon
              return (
                <Link key={item.href} href={item.href} onClick={onNavigate} aria-current={itemActive ? 'page' : undefined} className={`group flex gap-3 rounded-xl p-3 transition ${itemActive ? 'bg-red-50' : 'hover:bg-stone-50'}`}>
                  <ItemIcon size={17} className={`mt-0.5 shrink-0 ${itemActive ? 'text-red-600' : 'text-stone-400 group-hover:text-red-600'}`} />
                  <span>
                    <span className={`block text-sm font-black ${itemActive ? 'text-red-700' : 'text-stone-800'}`}>{item.label}</span>
                    <span className="mt-0.5 block text-xs leading-4 text-stone-500">{item.description}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function MobileMenu({ menu, pathname, open, onToggle, onNavigate }: { menu: MenuGroup; pathname: string; open: boolean; onToggle: () => void; onNavigate: () => void }) {
  const active = menuIsActive(pathname, menu)
  const Icon = menu.icon
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className={`mobile-nav-row w-full ${active ? 'mobile-nav-row-active' : ''}`}>
        <Icon size={18} />
        <span className="flex-1 text-left">{menu.label}</span>
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="grid gap-1 border-t border-white/10 bg-black/10 p-2 sm:grid-cols-2">
          {menu.items.map((item) => {
            const ItemIcon = item.icon
            return <Link key={item.href} href={item.href} onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold text-stone-300 transition hover:bg-white/10 hover:text-white"><ItemIcon size={16} />{item.label}</Link>
          })}
        </div>
      ) : null}
    </div>
  )
}
