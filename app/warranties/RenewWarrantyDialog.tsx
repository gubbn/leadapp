import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatShortDate } from '@/lib/crm'
import { supabase } from '@/lib/supabaseClient'
import { parseWarrantyDate, type WarrantyStatus } from '@/lib/warrantyImportHelpers'

export default function RenewWarrantyDialog({ warranty, onCancel, onSaved }: {
  warranty: {
    id: string
    customer_name: string
    product_name: string
    expiry_date: string
    action_status: WarrantyStatus
  }
  onCancel: () => void
  onSaved: (expiryDate: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const [newExpiry, setNewExpiry] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    dateInput.current?.focus()
    return () => element.close()
  }, [])

  function cancel() {
    if (saving) return
    dialog.current?.close()
    onCancel()
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const expiryDate = parseWarrantyDate(newExpiry)
    if (!expiryDate || expiryDate === warranty.expiry_date) {
      setError('Enter a date different from the current expiry.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { data, error: saveError } = await supabase.from('warranties')
        .update({ expiry_date: expiryDate, action_status: 'not_started', updated_at: new Date().toISOString() })
        .eq('id', warranty.id)
        .eq('expiry_date', warranty.expiry_date)
        .eq('action_status', warranty.action_status)
        .select('expiry_date')
        .maybeSingle()

      if (saveError) setError(saveError.message)
      else if (!data) setError('This warranty may have changed. Refresh the page and try again.')
      else {
        dialog.current?.close()
        onSaved(data.expiry_date)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The new expiry date could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <dialog ref={dialog} aria-labelledby="renew-warranty-title"
      onCancel={(event) => { event.preventDefault(); cancel() }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-2xl border border-stone-200 bg-white p-0 shadow-2xl backdrop:bg-stone-950/45 backdrop:backdrop-blur-sm">
      <form onSubmit={save} className="p-6">
        <h2 id="renew-warranty-title" className="text-xl font-black text-stone-950">Renew warranty</h2>
        <p className="mt-1 text-sm font-semibold text-stone-700">{warranty.customer_name} · {warranty.product_name}</p>
        <p className="mt-3 text-sm text-stone-600">Current expiry {formatShortDate(warranty.expiry_date)}</p>
        <label className="mt-4 block text-sm font-bold text-stone-700">
          New expiry date
          <input ref={dateInput} type="date" required value={newExpiry} disabled={saving}
            onChange={(event) => { setNewExpiry(event.currentTarget.value); setError('') }} className="form-input mt-2" />
        </label>
        <p className="mt-3 text-sm text-stone-600">Saving the new date resets the action to Not started.</p>
        {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={cancel} disabled={saving} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-black text-stone-700 hover:bg-stone-100 disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save new expiry'}</button>
        </div>
      </form>
    </dialog>
  )
}
