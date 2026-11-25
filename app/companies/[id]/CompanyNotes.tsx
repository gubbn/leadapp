import { useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function CompanyNotes({ companyId, notes, onSaved }: {
  companyId: string
  notes: string | null | undefined
  onSaved: (notes: string | null) => void
}) {
  const [draft, setDraft] = useState<{ original: string | null; value: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    setSaving(true)
    setError('')
    const nextNotes = draft.value.trim() || null
    try {
      const update = supabase.from('companies').update({ account_notes: nextNotes }).eq('id', companyId)
      const pending = draft.original === null ? update.is('account_notes', null) : update.eq('account_notes', draft.original)
      const { data, error: saveError } = await pending.select('account_notes').maybeSingle()
      if (saveError) setError(saveError.message)
      else if (!data) setError('These notes changed in another session. Reload the company to view the latest notes before editing again.')
      else {
        onSaved(data.account_notes)
        setDraft(null)
        setSaved(true)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="notes" aria-labelledby="company-notes-title" className="mt-6 scroll-mt-28 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 id="company-notes-title" className="text-xl font-black text-stone-950">Notes</h2>
        {draft === null && notes !== undefined ? (
          <button type="button" onClick={() => {
            setSaved(false)
            setDraft({ original: notes, value: notes ?? '' })
          }} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50">
            {notes ? 'Edit notes' : 'Add notes'}
          </button>
        ) : null}
      </div>
      {notes === undefined ? (
        <p className="mt-3 text-sm text-amber-800">Apply docs/crm-operating-system.sql in Supabase to enable company notes.</p>
      ) : draft ? (
        <form onSubmit={save} className="mt-4">
          <textarea aria-label="Company notes" value={draft.value} disabled={saving} rows={5} className="form-input resize-y"
            onChange={(event) => setDraft({ ...draft, value: event.currentTarget.value })} />
          {error ? <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" disabled={saving} onClick={() => { setDraft(null); setError('') }} className="rounded-lg border border-stone-200 px-3 py-2 text-xs font-black text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving || (draft.value.trim() || null) === draft.original} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save notes'}</button>
          </div>
        </form>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-600">{notes || 'No notes yet.'}</p>
      )}
      {saved ? <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">Notes saved.</p> : null}
    </section>
  )
}
