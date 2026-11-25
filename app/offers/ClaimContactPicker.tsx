import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export type ClaimContact = {
  id: string
  name: string
  email: string | null
  telephone: string | null
}

export default function ClaimContactPicker({ companyId, contactId, disabled, onChange }: {
  companyId: string
  contactId: string
  disabled: boolean
  onChange: (contact: ClaimContact | null) => void
}) {
  const [contacts, setContacts] = useState<ClaimContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadContacts() {
      const results: ClaimContact[] = []
      const pageSize = 500
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('contacts').select('id,first_name,last_name,email,telephone')
          .eq('company_id', companyId).order('last_name').order('first_name').order('id')
          .range(offset, offset + pageSize - 1).abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error) {
          setError(error.message)
          break
        }

        results.push(...data.map(({ id, first_name, last_name, email, telephone }) => ({
          id,
          name: [first_name?.trim(), last_name?.trim()].filter(Boolean).join(' '),
          email,
          telephone,
        })))
        if (data.length < pageSize) break
      }
      setContacts(results)
      setLoading(false)
    }

    void loadContacts()
    return () => controller.abort()
  }, [companyId])

  return (
    <div className="md:col-span-2">
      <label htmlFor="claim-contact" className="mb-2 block text-sm font-black text-stone-700">Contact</label>
      <select id="claim-contact" value={contactId} disabled={loading || disabled} className="form-input"
        onChange={(event) => onChange(contacts.find((contact) => contact.id === event.currentTarget.value) ?? null)}>
        <option value="">Enter claimant manually</option>
        {contacts.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {[contact.name, contact.email || contact.telephone].filter(Boolean).join(' · ') || 'Unnamed contact'}
          </option>
        ))}
      </select>
      {loading ? <p role="status" className="mt-2 text-xs text-stone-600">Loading contacts…</p> : null}
      {error ? <p role="alert" className="mt-2 text-xs text-red-700">Contacts could not be loaded. {error}</p> : null}
      {!loading && !error && !contacts.length ? <p className="mt-2 text-xs text-stone-600">This company has no saved contacts.</p> : null}
    </div>
  )
}
