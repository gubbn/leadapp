'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'

type DbRow = Record<string, unknown>

const ukCounties = {
  England: [
    'Bedfordshire', 'Berkshire', 'Bristol', 'Buckinghamshire', 'Cambridgeshire',
    'Cheshire', 'City of London', 'Cornwall', 'County Durham', 'Cumbria',
    'Derbyshire', 'Devon', 'Dorset', 'East Riding of Yorkshire', 'East Sussex',
    'Essex', 'Gloucestershire', 'Greater London', 'Greater Manchester', 'Hampshire',
    'Herefordshire', 'Hertfordshire', 'Isle of Wight', 'Kent', 'Lancashire',
    'Leicestershire', 'Lincolnshire', 'Merseyside', 'Norfolk', 'North Yorkshire',
    'Northamptonshire', 'Northumberland', 'Nottinghamshire', 'Oxfordshire',
    'Rutland', 'Shropshire', 'Somerset', 'South Yorkshire', 'Staffordshire',
    'Suffolk', 'Surrey', 'Tyne and Wear', 'Warwickshire', 'West Midlands',
    'West Sussex', 'West Yorkshire', 'Wiltshire', 'Worcestershire',
  ],
  Wales: [
    'Blaenau Gwent', 'Bridgend', 'Caerphilly', 'Cardiff', 'Carmarthenshire',
    'Ceredigion', 'Conwy', 'Denbighshire', 'Flintshire', 'Gwynedd',
    'Isle of Anglesey', 'Merthyr Tydfil', 'Monmouthshire', 'Neath Port Talbot',
    'Newport', 'Pembrokeshire', 'Powys', 'Rhondda Cynon Taf', 'Swansea',
    'Torfaen', 'Vale of Glamorgan', 'Wrexham',
  ],
  Scotland: [
    'Aberdeen City', 'Aberdeenshire', 'Angus', 'Argyll and Bute',
    'City of Edinburgh', 'Clackmannanshire', 'Dumfries and Galloway',
    'Dundee City', 'East Ayrshire', 'East Dunbartonshire', 'East Lothian',
    'East Renfrewshire', 'Falkirk', 'Fife', 'Glasgow City', 'Highland',
    'Inverclyde', 'Midlothian', 'Moray', 'Na h-Eileanan Siar',
    'North Ayrshire', 'North Lanarkshire', 'Orkney Islands',
    'Perth and Kinross', 'Renfrewshire', 'Scottish Borders',
    'Shetland Islands', 'South Ayrshire', 'South Lanarkshire', 'Stirling',
    'West Dunbartonshire', 'West Lothian',
  ],
  'Northern Ireland': [
    'Antrim and Newtownabbey', 'Ards and North Down', 'Armagh City, Banbridge and Craigavon',
    'Belfast', 'Causeway Coast and Glens', 'Derry City and Strabane',
    'Fermanagh and Omagh', 'Lisburn and Castlereagh', 'Mid and East Antrim',
    'Mid Ulster', 'Newry, Mourne and Down',
  ],
} as const

const allUkCounties: string[] = Object.values(ukCounties).flatMap((counties) => [...counties])

function value(row: DbRow, keys: string[]) {
  for (const key of keys) {
    const candidate = row[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return ''
}

export default function LocationResearchPage() {
  const [companies, setCompanies] = useState<DbRow[]>([])
  const [countyDrafts, setCountyDrafts] = useState<Record<string, string>>({})
  const [savingCounty, setSavingCounty] = useState('')
  const [countyFilter, setCountyFilter] = useState<'all' | 'unknown'>('unknown')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const companyResult = await supabase
        .from('companies')
        .select('id, company_name, location, town, county')
        .order('location')

      if (companyResult.error) setMessage(companyResult.error.message)
      setCompanies((companyResult.data ?? []) as DbRow[])
      setLoading(false)
    }
    load()
  }, [])

  const locationGroups = useMemo(() => {
    const grouped = new Map<string, { label: string; companies: DbRow[] }>()
    companies.forEach((company) => {
      const location = value(company, ['location', 'town'])
      if (!location) return
      const key = location.toLocaleLowerCase()
      const current = grouped.get(key) ?? { label: location, companies: [] }
      current.companies.push(company)
      grouped.set(key, current)
    })
    return [...grouped.entries()]
      .map(([key, group]) => {
        const counties = [...new Set(group.companies.map((company) => value(company, ['county'])).filter(Boolean))]
        return {
          key,
          ...group,
          county: counties.length === 1 ? counties[0] : counties.length > 1 ? 'Mixed' : '',
        }
      })
      .filter((group) => countyFilter === 'all' || !group.county)
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [companies, countyFilter])

  const countyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    companies.forEach((company) => {
      const county = value(company, ['county'])
      const label = county
        ? county.toLocaleLowerCase().includes('yorkshire') ? 'Yorkshire' : county
        : 'Unclassified'
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [companies])

  async function saveCounty(group: (typeof locationGroups)[number]) {
    const county = (countyDrafts[group.key] ?? group.county).trim()
    if (!county || county === 'Mixed') return
    const companyIds = group.companies.map((company) => value(company, ['id'])).filter(Boolean)
    setSavingCounty(group.key)
    setMessage('')
    const { error } = await supabase
      .from('companies')
      .update({ county })
      .in('id', companyIds)

    if (error) {
      setMessage(error.message)
    } else {
      const idSet = new Set(companyIds)
      setCompanies((current) =>
        current.map((company) =>
          idSet.has(value(company, ['id'])) ? { ...company, county } : company,
        ),
      )
      setMessage(`${group.label} categorised as ${county} for ${companyIds.length} companies.`)
    }
    setSavingCounty('')
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <AppHeader />
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Data quality</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-stone-950">
            Location categories
          </h1>
          <p className="mt-3 max-w-3xl text-stone-600">
            Categorise the towns, villages and cities already held in the CRM by UK county or
            administrative area. Company information is maintained in Companies.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="font-bold text-stone-700">
            {loading ? 'Loading…' : `${locationGroups.length} location categories shown`}
          </p>
          <Link href="/companies" className="text-sm font-bold text-red-600">
            View all companies →
          </Link>
        </div>

        {message ? (
          <p className="mb-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            {message}
          </p>
        ) : null}

        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Territory data</p>
              <h2 className="mt-2 text-2xl font-black text-stone-950">Categorise locations by county</h2>
              <p className="mt-2 max-w-3xl text-sm text-stone-600">
                Each village, town or city appears once. Saving a county updates every company with that location.
              </p>
            </div>
            <select
              value={countyFilter}
              onChange={(event) => setCountyFilter(event.target.value as 'all' | 'unknown')}
              className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-bold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
            >
              <option value="unknown">Unclassified only</option>
              <option value="all">All locations</option>
            </select>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {countyCounts.slice(0, 5).map(([county, count]) => (
              <div key={county} className="rounded-2xl bg-stone-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-stone-500">{county}</p>
                <p className="mt-2 text-2xl font-black text-stone-950">{count}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 divide-y divide-stone-100">
            {locationGroups.map((group) => (
              <div key={group.key} className="grid gap-4 py-4 md:grid-cols-[1fr_auto_1.2fr_auto] md:items-center">
                <div>
                  <p className="font-black text-stone-950">{group.label}</p>
                  <p className="text-sm text-stone-500">{group.companies.length} {group.companies.length === 1 ? 'company' : 'companies'}</p>
                </div>
                <span className="w-fit rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-600">
                  {group.county || 'Unclassified'}
                </span>
                <select
                  value={countyDrafts[group.key] ?? (group.county === 'Mixed' ? '' : group.county)}
                  onChange={(event) => setCountyDrafts((current) => ({ ...current, [group.key]: event.target.value }))}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-red-400 focus:ring-4 focus:ring-red-100"
                >
                  <option value="">Choose county or area</option>
                  {group.county && group.county !== 'Mixed' && !allUkCounties.includes(group.county) ? (
                    <option value={group.county}>{group.county}</option>
                  ) : null}
                  {Object.entries(ukCounties).map(([nation, counties]) => (
                    <optgroup key={nation} label={nation}>
                      {counties.map((county) => (
                        <option key={county} value={county}>{county}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => saveCounty(group)}
                  disabled={savingCounty === group.key || !(countyDrafts[group.key] ?? (group.county === 'Mixed' ? '' : group.county)).trim()}
                  className="rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingCounty === group.key ? 'Saving…' : 'Apply'}
                </button>
              </div>
            ))}
            {!loading && locationGroups.length === 0 ? (
              <p className="py-8 text-center text-sm font-semibold text-stone-500">
                {countyFilter === 'unknown' ? 'Every known location has a county.' : 'No saved locations yet.'}
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  )
}
