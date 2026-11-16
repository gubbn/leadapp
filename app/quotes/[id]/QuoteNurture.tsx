'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabaseClient'

const steps = [
  { key: '1', label: 'First follow-up' },
  { key: '2', label: 'Second follow-up' },
  { key: '3', label: 'Third follow-up' },
  { key: 'lost', label: 'Lost quote' },
] as const

type Step = { days: number; subject: string; body: string }
type Settings = Partial<Record<(typeof steps)[number]['key'], Step>>
type Attempt = { step: string; status: string }

export default function QuoteNurture({
  quoteId, enabled, settings, status, lostAt,
}: {
  quoteId: string
  enabled: boolean
  settings: Settings
  status: string
  lostAt: string | null
}) {
  const [active, setActive] = useState(enabled)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void supabase.from('quote_nurture_attempts').select('step,status').eq('quote_id', quoteId).then(({ data, error }) => {
      if (cancelled) return
      if (error) setMessage(error.message)
      else setAttempts(data ?? [])
    })
    return () => { cancelled = true }
  }, [quoteId])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const nurtureSteps: Settings = {}
    for (const { key, label } of steps) {
      const days = String(form.get(`days-${key}`) ?? '')
      const subject = String(form.get(`subject-${key}`) ?? '').trim()
      const body = String(form.get(`body-${key}`) ?? '').trim()
      if (!days && !subject && !body) continue
      if (!days || !subject || !body) {
        setMessage(`Enter the delay, subject and message for ${label.toLowerCase()}.`)
        return
      }
      nurtureSteps[key] = { days: Number(days), subject, body }
    }
    if ((nurtureSteps['2'] && (!nurtureSteps['1'] || nurtureSteps['2'].days <= nurtureSteps['1'].days))
      || (nurtureSteps['3'] && (!nurtureSteps['2'] || nurtureSteps['3'].days <= nurtureSteps['2'].days))) {
      setMessage('Configure follow-ups in order with increasing delays.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('quotes')
      .update({ nurture_enabled: active, nurture_steps: nurtureSteps })
      .eq('id', quoteId).select('id').single()
    setMessage(error?.message ?? 'Nurture settings saved.')
    setSaving(false)
  }

  async function pause() {
    setSaving(true)
    const { error } = await supabase.from('quotes')
      .update({ nurture_enabled: false }).eq('id', quoteId).select('id').single()
    if (!error) setActive(false)
    setMessage(error?.message ?? 'Nurture paused.')
    setSaving(false)
  }

  return <form onSubmit={save} className="mt-6 space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
    <h2 className="text-2xl font-black text-stone-950">Email nurture</h2>
    <p className="text-sm text-stone-600">Follow-up delays are calendar days after issue. The lost quote delay starts when the quote is marked lost. Pause nurture when the contact replies.</p>
    {status === 'lost' && !lostAt ? <p className="text-sm text-amber-800">This quote was marked lost before nurture was installed and has no recorded loss date.</p> : null}
    <label className="flex items-center gap-2 text-sm font-bold">
      <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
      Enable automatic email for this quote
    </label>
    <div className="grid gap-4 md:grid-cols-2">
      {steps.map(({ key, label }) => {
        const attempt = attempts.find((item) => item.step === key)
        return <fieldset key={key} className="space-y-3 rounded-xl border border-stone-200 p-4">
          <legend className="px-1 text-sm font-black">{label}</legend>
          {attempt ? <p className="text-sm text-stone-600">Delivery status: {attempt.status === 'accepted' ? 'Accepted by Microsoft 365' : 'Needs review'}</p> : null}
          <label className="block text-sm">Delay in days
            <input name={`days-${key}`} className="form-input" type="number" min={0} max={999} step={1} defaultValue={settings[key]?.days} />
          </label>
          <label className="block text-sm">Subject
            <input name={`subject-${key}`} className="form-input" maxLength={200} defaultValue={settings[key]?.subject} />
          </label>
          <label className="block text-sm">Message
            <textarea name={`body-${key}`} className="form-input" rows={4} maxLength={10000} defaultValue={settings[key]?.body} />
          </label>
        </fieldset>
      })}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={saving} className="rounded-xl bg-stone-950 px-5 py-2.5 text-sm font-black text-white">Save nurture settings</button>
      <button type="button" disabled={saving} onClick={() => void pause()} className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-black">Pause nurture</button>
      {message ? <p role="status" className="text-sm text-stone-700">{message}</p> : null}
    </div>
  </form>
}
