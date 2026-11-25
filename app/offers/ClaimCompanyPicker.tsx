import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type ClaimCompany = { id: string; company_name: string; location: string | null }

export default function ClaimCompanyPicker({ company, disabled, onChange }: {
  company: ClaimCompany | null
  disabled: boolean
  onChange: (company: ClaimCompany | null) => void
}) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ query: string; companies: ClaimCompany[]; error: string } | null>(null)
  const search = query.trim()

  useEffect(() => {
    if (company || search.length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const pattern = search.replace(/[\\%_]/g, '\\$&')
      const { data, error } = await supabase.from('companies').select('id,company_name,location')
        .ilike('company_name', `%${pattern}%`).order('company_name').order('id').limit(25)
        .abortSignal(controller.signal)
      if (!controller.signal.aborted) setResult({ query: search, companies: data ?? [], error: error?.message ?? '' })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [company, search])

  if (company) return (
    <div>
      <p className="mb-2 text-sm font-black text-stone-700">Linked company</p>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
        <span className="text-sm font-bold text-stone-900">{company.company_name}</span>
        <button type="button" disabled={disabled} onClick={() => onChange(null)} className="text-xs font-black text-red-600 hover:underline disabled:opacity-50">Change</button>
      </div>
    </div>
  )

  const matches = result?.query === search ? result : null
  return (
    <div>
      <label className="block">
        <span className="mb-2 block text-sm font-black text-stone-700">Find company</span>
        <input type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.currentTarget.value)} className="form-input" placeholder="Search by company name" />
      </label>
      {search.length >= 2 ? (
        <div className="mt-2">
          {matches?.error ? <p role="alert" className="text-xs text-red-700">{matches.error}</p> : matches?.companies.length ? (
            <ul aria-label="Matching companies" className="max-h-52 divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200">
              {matches.companies.map((option) => (
                <li key={option.id}>
                  <button type="button" disabled={disabled} onClick={() => onChange(option)} className="w-full px-3 py-2 text-left text-sm font-bold text-stone-800 hover:bg-stone-100 disabled:opacity-50">
                    {option.company_name}{option.location ? <span className="ml-2 font-normal text-stone-500">{option.location}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : <p role="status" className="text-xs text-stone-600">{matches ? 'No matching companies.' : 'Searching for companies…'}</p>}
        </div>
      ) : null}
    </div>
  )
}
