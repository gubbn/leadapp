import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ClaimCompany = { id: string; company_name: string; location: string | null }

export type ClaimCompanySelection =
  | { kind: 'existing'; company: ClaimCompany }
  | { kind: 'new' | 'claim-only' }
  | null

export default function ClaimCompanyPicker({ selection, disabled, allowClaimOnly, onChange }: {
  selection: ClaimCompanySelection
  disabled: boolean
  allowClaimOnly: boolean
  onChange: (selection: ClaimCompanySelection) => void
}) {
  const [companies, setCompanies] = useState<ClaimCompany[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadCompanies() {
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('companies').select('id,company_name,location')
          .order('company_name').order('id').range(offset, offset + pageSize - 1)
          .abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) {
          setError(error.message)
          break
        }
        setCompanies((current) => [...current, ...data])
        if (data.length < pageSize) break
      }
      setLoading(false)
    }

    void loadCompanies()
    return () => controller.abort()
  }, [])

  const selectedId = selection?.kind === 'existing' ? selection.company.id : selection?.kind ?? ''
  const search = filter.trim().toLowerCase()
  const visible = companies.filter((company) => company.id === selectedId ||
    `${company.company_name} ${company.location ?? ''}`.toLowerCase().includes(search))

  function selectCompany(value: string) {
    if (value === 'new' || value === 'claim-only') {
      onChange({ kind: value })
    } else {
      const company = companies.find((option) => option.id === value)
      onChange(company ? { kind: 'existing', company } : null)
    }
  }

  return (
    <div className="md:col-span-2">
      <label htmlFor="claim-company" className="mb-2 block text-sm font-black text-stone-700">Company</label>
      {companies.length > 25 ? (
        <input type="search" aria-label="Filter companies" value={filter} disabled={disabled}
          onChange={(event) => setFilter(event.currentTarget.value)} className="form-input mb-2" placeholder="Filter by company name or location" />
      ) : null}
      <select id="claim-company" required value={selectedId} disabled={disabled}
        onChange={(event) => selectCompany(event.currentTarget.value)} className="form-input">
        <option value="" disabled>Choose a company or create new</option>
        {visible.length ? (
          <optgroup label="Existing companies">
            {visible.map((company) => (
              <option key={company.id} value={company.id}>
                {company.company_name}{company.location ? ` · ${company.location}` : ''}
              </option>
            ))}
          </optgroup>
        ) : null}
        <option value="new">Create new claimant in Leads</option>
        {allowClaimOnly ? <option value="claim-only">Record claim only</option> : null}
      </select>
      {loading ? <p role="status" className="mt-2 text-xs text-stone-600">Loading companies…</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">Companies could not be loaded. {error}</p> : null}
      {!loading && !error && search && !visible.length ? <p role="status" className="mt-2 text-xs text-stone-600">No matching companies.</p> : null}
    </div>
  )
}
