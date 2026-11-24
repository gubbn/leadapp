import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { validateWarrantyValues, WARRANTY_FIELDS, type WarrantyValues } from '@/lib/warrantyImportHelpers'

export function readWarrantyForm(form: HTMLFormElement): WarrantyValues {
  const data = new FormData(form)
  return Object.fromEntries(
    WARRANTY_FIELDS.map(({ key }) => [key, String(data.get(key) ?? '').trim()]),
  ) as WarrantyValues
}

export function WarrantyFields({
  values,
  correcting = false,
  disabled = false,
}: {
  values?: WarrantyValues
  correcting?: boolean
  disabled?: boolean
}) {
  const fieldsRef = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    fieldsRef.current?.querySelector('input')?.focus()
  }, [])

  return (
    <fieldset ref={fieldsRef} disabled={disabled} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {WARRANTY_FIELDS.filter(({ key }) => correcting || key !== 'sharepoint_id').map(({ key, label, required }) => (
        <label key={key} className={key === 'notes' ? 'sm:col-span-full' : undefined}>
          <span className="mb-1.5 block text-xs font-black text-stone-700">
            {label}{required ? ' *' : ''}
          </span>
          {key === 'notes' ? (
            <textarea name={key} defaultValue={values?.[key]} rows={2} className="form-input" />
          ) : (
            <input
              name={key}
              type={!correcting && key === 'expiry_date' ? 'date' : !correcting && key === 'owner_email' ? 'email' : 'text'}
              defaultValue={values?.[key]}
              placeholder={correcting && key === 'expiry_date' ? 'DD/MM/YYYY or YYYY-MM-DD' : undefined}
              required={required}
              className="form-input"
            />
          )}
        </label>
      ))}
    </fieldset>
  )
}

export function AddWarrantyForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const sourceKey = useRef<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const { data, issues } = validateWarrantyValues(readWarrantyForm(event.currentTarget))
    if (issues.length) {
      setError(issues.join(' '))
      return
    }

    setSaving(true)
    setError('')
    try {
      sourceKey.current ??= `manual:${crypto.randomUUID()}`
      const { error: saveError } = await supabase.from('warranties').upsert(
        { ...data, source_key: sourceKey.current, updated_at: new Date().toISOString() },
        { onConflict: 'source_key' },
      )
      if (saveError) setError(saveError.message)
      else onSaved()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The warranty could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mb-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="mb-5 text-xl font-black text-stone-950">Add warranty</h2>
      <WarrantyFields disabled={saving} />
      {error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-black text-stone-700 hover:bg-stone-100 disabled:opacity-50">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save warranty'}
        </button>
      </div>
    </form>
  )
}
