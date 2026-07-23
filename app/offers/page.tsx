'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'

type OfferStatus = 'draft' | 'active' | 'paused' | 'ended'

type Offer = {
  id: string
  name: string
  description: string | null
  lead_source: string
  status: OfferStatus
  starts_on: string | null
  ends_on: string | null
  is_limited: boolean
  total_available: number | null
  claimed_count: number
  created_at: string
  updated_at: string
}

type OfferClaim = {
  id: string
  offer_id: string
  claimant_name: string
  company_name: string | null
  email: string | null
  telephone: string | null
  lead_source: string
  claimed_on: string
  notes: string | null
  created_at: string
}

type OfferForm = {
  name: string
  description: string
  leadSource: string
  status: OfferStatus
  startsOn: string
  endsOn: string
  isLimited: boolean
  totalAvailable: string
}

type ClaimForm = {
  claimantName: string
  companyName: string
  email: string
  telephone: string
  leadSource: string
  claimedOn: string
  notes: string
}

const EMPTY_FORM: OfferForm = {
  name: '',
  description: '',
  leadSource: '',
  status: 'active',
  startsOn: '',
  endsOn: '',
  isLimited: false,
  totalAvailable: '',
}

function todayInputValue() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

const EMPTY_CLAIM_FORM: ClaimForm = {
  claimantName: '',
  companyName: '',
  email: '',
  telephone: '',
  leadSource: '',
  claimedOn: todayInputValue(),
  notes: '',
}

const STATUS_STYLES: Record<OfferStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-stone-100 text-stone-600',
  paused: 'bg-amber-100 text-amber-700',
  ended: 'bg-red-100 text-red-700',
}

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [claims, setClaims] = useState<OfferClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [claimingOffer, setClaimingOffer] = useState<Offer | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | OfferStatus>('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM)
  const [claimForm, setClaimForm] = useState<ClaimForm>(EMPTY_CLAIM_FORM)

  const loadOffers = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')

    const [offersResult, claimsResult] = await Promise.all([
      supabase.from('offers').select('*').order('created_at', { ascending: false }),
      supabase
        .from('offer_claims')
        .select('*')
        .order('claimed_on', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    if (offersResult.error || claimsResult.error) {
      setErrorMessage(
        offersResult.error?.message ??
          claimsResult.error?.message ??
          'Unable to load offers.',
      )
    } else {
      setOffers((offersResult.data ?? []) as Offer[])
      setClaims((claimsResult.data ?? []) as OfferClaim[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    // Supabase is the external data source being synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadOffers()
  }, [loadOffers])

  const sources = useMemo(
    () =>
      Array.from(new Set(offers.map((offer) => offer.lead_source))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [offers],
  )

  const visibleOffers = useMemo(
    () =>
      offers.filter(
        (offer) =>
          (statusFilter === 'all' || offer.status === statusFilter) &&
          (sourceFilter === 'all' || offer.lead_source === sourceFilter),
      ),
    [offers, sourceFilter, statusFilter],
  )

  const activeCount = offers.filter((offer) => offer.status === 'active').length
  const limitedOffers = offers.filter((offer) => offer.is_limited)
  const remainingTotal = limitedOffers.reduce(
    (sum, offer) =>
      sum + Math.max(0, (offer.total_available ?? 0) - offer.claimed_count),
    0,
  )
  const runningLowCount = limitedOffers.filter((offer) => {
    const remaining = (offer.total_available ?? 0) - offer.claimed_count
    return offer.status === 'active' && remaining > 0 && remaining <= 5
  }).length

  function openCreateForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrorMessage('')
    setSuccessMessage('')
    setShowForm(true)
  }

  function openEditForm(offer: Offer) {
    setEditingId(offer.id)
    setForm({
      name: offer.name,
      description: offer.description ?? '',
      leadSource: offer.lead_source,
      status: offer.status,
      startsOn: offer.starts_on ?? '',
      endsOn: offer.ends_on ?? '',
      isLimited: offer.is_limited,
      totalAvailable: offer.total_available?.toString() ?? '',
    })
    setErrorMessage('')
    setSuccessMessage('')
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function saveOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    const totalAvailable = form.isLimited
      ? Number.parseInt(form.totalAvailable, 10)
      : null
    if (!form.name.trim() || !form.leadSource.trim()) {
      setErrorMessage('Offer name and lead source are required.')
      return
    }

    if (
      form.isLimited &&
      (!Number.isInteger(totalAvailable) ||
        totalAvailable === null ||
        totalAvailable < 0 ||
        (editingId !== null &&
          offers.find((offer) => offer.id === editingId)!.claimed_count >
            totalAvailable))
    ) {
      setErrorMessage(
        'Total availability cannot be lower than the number already claimed.',
      )
      return
    }

    if (form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
      setErrorMessage('The end date cannot be before the start date.')
      return
    }

    setSaving(true)
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      lead_source: form.leadSource.trim(),
      status: form.status,
      starts_on: form.startsOn || null,
      ends_on: form.endsOn || null,
      is_limited: form.isLimited,
      total_available: totalAvailable,
      claimed_count: editingId
        ? offers.find((offer) => offer.id === editingId)?.claimed_count ?? 0
        : 0,
      updated_at: new Date().toISOString(),
    }

    const result = editingId
      ? await supabase.from('offers').update(payload).eq('id', editingId)
      : await supabase.from('offers').insert(payload)

    if (result.error) {
      setErrorMessage(result.error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingId ? 'Offer updated.' : 'Offer created.')
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    await loadOffers()
    setSaving(false)
  }

  function openClaimForm(offer: Offer) {
    setClaimingOffer(offer)
    setClaimForm({
      ...EMPTY_CLAIM_FORM,
      claimedOn: todayInputValue(),
      leadSource: offer.lead_source,
    })
    setErrorMessage('')
    setSuccessMessage('')
  }

  async function saveClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!claimingOffer) return

    if (!claimForm.claimantName.trim() || !claimForm.leadSource.trim()) {
      setErrorMessage('Claimant name and lead source are required.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    const { error } = await supabase.from('offer_claims').insert({
      offer_id: claimingOffer.id,
      claimant_name: claimForm.claimantName.trim(),
      company_name: claimForm.companyName.trim() || null,
      email: claimForm.email.trim() || null,
      telephone: claimForm.telephone.trim() || null,
      lead_source: claimForm.leadSource.trim(),
      claimed_on: claimForm.claimedOn,
      notes: claimForm.notes.trim() || null,
    })

    if (error) {
      setErrorMessage(
        error.message.includes('offers_inventory_valid')
          ? 'This offer has no availability remaining.'
          : error.message,
      )
      setSaving(false)
      return
    }

    setClaimingOffer(null)
    setClaimForm(EMPTY_CLAIM_FORM)
    setSuccessMessage('Claim recorded.')
    await loadOffers()
    setSaving(false)
  }

  async function deleteClaim(claim: OfferClaim) {
    if (!window.confirm(`Remove the claim for “${claim.claimant_name}”?`)) return

    setErrorMessage('')
    const { error } = await supabase
      .from('offer_claims')
      .delete()
      .eq('id', claim.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Claim removed.')
    await loadOffers()
  }

  async function deleteOffer(offer: Offer) {
    if (!window.confirm(`Delete “${offer.name}”? This cannot be undone.`)) return

    setErrorMessage('')
    const { error } = await supabase.from('offers').delete().eq('id', offer.id)

    if (error) {
      setErrorMessage(error.message)
      return
    }

    setSuccessMessage('Offer deleted.')
    await loadOffers()
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <Link href="/" className="text-sm font-bold text-red-600">
                ← Back to dashboard
              </Link>
              <p className="mt-6 inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
                Offers
              </p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
                Track every offer in one place.
              </h1>
              <p className="mt-5 text-base leading-7 text-stone-600">
                See what is live, which source brought the leads in, and how
                much limited inventory is still available.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-red-700"
            >
              + New offer
            </button>
          </div>

          {showForm ? (
            <form
              onSubmit={saveOffer}
              className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">
                    {editingId ? 'Edit offer' : 'New offer'}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-stone-950">
                    {editingId ? 'Update offer details' : 'Add an offer'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field label="Offer name" required>
                  <input
                    required
                    maxLength={160}
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                    className="form-input"
                    placeholder="e.g. Free IT health check"
                  />
                </Field>

                <Field label="Lead source" required>
                  <input
                    required
                    maxLength={120}
                    list="offer-source-options"
                    value={form.leadSource}
                    onChange={(event) =>
                      setForm({ ...form, leadSource: event.target.value })
                    }
                    className="form-input"
                    placeholder="e.g. LinkedIn, referral, Facebook"
                  />
                  <datalist id="offer-source-options">
                    {sources.map((source) => (
                      <option key={source} value={source} />
                    ))}
                  </datalist>
                </Field>

                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        status: event.target.value as OfferStatus,
                      })
                    }
                    className="form-input"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </Field>

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Starts">
                    <input
                      type="date"
                      value={form.startsOn}
                      onChange={(event) =>
                        setForm({ ...form, startsOn: event.target.value })
                      }
                      className="form-input"
                    />
                  </Field>
                  <Field label="Ends">
                    <input
                      type="date"
                      value={form.endsOn}
                      onChange={(event) =>
                        setForm({ ...form, endsOn: event.target.value })
                      }
                      className="form-input"
                    />
                  </Field>
                </div>

                <Field label="Description">
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                    className="form-input resize-y"
                    placeholder="What the offer includes..."
                  />
                </Field>

                <div>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <input
                      type="checkbox"
                      checked={form.isLimited}
                      onChange={(event) =>
                        setForm({ ...form, isLimited: event.target.checked })
                      }
                      className="h-4 w-4 accent-red-600"
                    />
                    <span>
                      <span className="block text-sm font-black text-stone-800">
                        Limited availability
                      </span>
                      <span className="text-xs text-stone-500">
                        Track the number claimed and remaining.
                      </span>
                    </span>
                  </label>

                  {form.isLimited ? (
                    <div className="mt-4">
                      <Field label="Total available" required>
                        <input
                          required
                          type="number"
                          min="0"
                          value={form.totalAvailable}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              totalAvailable: event.target.value,
                            })
                          }
                          className="form-input"
                        />
                      </Field>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create offer'}
                </button>
              </div>
            </form>
          ) : null}

          {claimingOffer ? (
            <form
              onSubmit={saveClaim}
              className="mt-8 rounded-2xl border border-red-200 bg-white p-6 shadow-lg ring-4 ring-red-50"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">
                    Record a claim
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-stone-950">
                    {claimingOffer.name}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    Add who claimed and the source that brought them in.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClaimingOffer(null)}
                  className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100"
                >
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-5 md:grid-cols-2">
                <Field label="Claimant name" required>
                  <input
                    required
                    maxLength={160}
                    value={claimForm.claimantName}
                    onChange={(event) =>
                      setClaimForm({
                        ...claimForm,
                        claimantName: event.target.value,
                      })
                    }
                    className="form-input"
                    placeholder="Full name"
                  />
                </Field>

                <Field label="Company">
                  <input
                    value={claimForm.companyName}
                    onChange={(event) =>
                      setClaimForm({
                        ...claimForm,
                        companyName: event.target.value,
                      })
                    }
                    className="form-input"
                    placeholder="Company name"
                  />
                </Field>

                <Field label="Email">
                  <input
                    type="email"
                    value={claimForm.email}
                    onChange={(event) =>
                      setClaimForm({ ...claimForm, email: event.target.value })
                    }
                    className="form-input"
                    placeholder="name@company.co.uk"
                  />
                </Field>

                <Field label="Telephone">
                  <input
                    type="tel"
                    value={claimForm.telephone}
                    onChange={(event) =>
                      setClaimForm({
                        ...claimForm,
                        telephone: event.target.value,
                      })
                    }
                    className="form-input"
                    placeholder="Contact number"
                  />
                </Field>

                <Field label="Lead source" required>
                  <input
                    required
                    maxLength={120}
                    list="claim-source-options"
                    value={claimForm.leadSource}
                    onChange={(event) =>
                      setClaimForm({
                        ...claimForm,
                        leadSource: event.target.value,
                      })
                    }
                    className="form-input"
                    placeholder="e.g. LinkedIn, referral, Facebook"
                  />
                  <datalist id="claim-source-options">
                    {Array.from(
                      new Set([
                        ...sources,
                        ...claims.map((claim) => claim.lead_source),
                      ]),
                    ).map((source) => (
                      <option key={source} value={source} />
                    ))}
                  </datalist>
                </Field>

                <Field label="Claimed on" required>
                  <input
                    required
                    type="date"
                    value={claimForm.claimedOn}
                    onChange={(event) =>
                      setClaimForm({
                        ...claimForm,
                        claimedOn: event.target.value,
                      })
                    }
                    className="form-input"
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      rows={3}
                      value={claimForm.notes}
                      onChange={(event) =>
                        setClaimForm({ ...claimForm, notes: event.target.value })
                      }
                      className="form-input resize-y"
                      placeholder="Anything useful about this claim..."
                    />
                  </Field>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setClaimingOffer(null)}
                  className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Record claim'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {errorMessage ? (
          <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total offers" value={offers.length} />
          <SummaryCard label="Active now" value={activeCount} accent />
          <SummaryCard label="Limited offers" value={limitedOffers.length} />
          <SummaryCard
            label="Remaining inventory"
            value={remainingTotal}
            note={runningLowCount ? `${runningLowCount} running low` : undefined}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'draft', 'paused', 'ended'] as const).map(
              (status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-2 text-sm font-bold capitalize ${
                    statusFilter === status
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {status}
                </button>
              ),
            )}
          </div>

          <select
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 outline-none focus:border-red-400"
          >
            <option value="all">All lead sources</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-8 text-sm text-stone-500 shadow-sm">
            Loading offers...
          </div>
        ) : visibleOffers.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <p className="text-xl font-black text-stone-900">
              {offers.length ? 'No offers match these filters.' : 'No offers yet.'}
            </p>
            <p className="mt-2 text-sm text-stone-500">
              {offers.length
                ? 'Try another status or lead source.'
                : 'Add the first one to start tracking performance and availability.'}
            </p>
            {!offers.length ? (
              <button
                type="button"
                onClick={openCreateForm}
                className="mt-5 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white"
              >
                Create first offer
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {visibleOffers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                claims={claims.filter((claim) => claim.offer_id === offer.id)}
                onEdit={() => openEditForm(offer)}
                onClaim={() => openClaimForm(offer)}
                onDeleteClaim={(claim) => void deleteClaim(claim)}
                onDelete={() => void deleteOffer(offer)}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function OfferCard({
  offer,
  claims,
  onEdit,
  onClaim,
  onDeleteClaim,
  onDelete,
}: {
  offer: Offer
  claims: OfferClaim[]
  onEdit: () => void
  onClaim: () => void
  onDeleteClaim: (claim: OfferClaim) => void
  onDelete: () => void
}) {
  const remaining = offer.is_limited
    ? Math.max(0, (offer.total_available ?? 0) - offer.claimed_count)
    : null
  const percentage =
    offer.is_limited && offer.total_available
      ? Math.min(100, Math.round((offer.claimed_count / offer.total_available) * 100))
      : 0
  const soldOut = remaining === 0 && offer.is_limited
  const runningLow = remaining !== null && remaining > 0 && remaining <= 5

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black capitalize ${STATUS_STYLES[offer.status]}`}
            >
              {offer.status}
            </span>
            <h2 className="mt-3 text-2xl font-black text-stone-950">
              {offer.name}
            </h2>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg px-3 py-2 text-sm font-bold text-stone-600 hover:bg-stone-100"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg px-3 py-2 text-sm font-bold text-stone-400 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>

        {offer.description ? (
          <p className="mt-3 text-sm leading-6 text-stone-600">
            {offer.description}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Info label="Lead source" value={offer.lead_source} />
          <Info
            label="Dates"
            value={formatDateRange(offer.starts_on, offer.ends_on)}
          />
        </div>

        {offer.is_limited ? (
          <div
            className={`mt-5 rounded-xl border p-4 ${
              soldOut
                ? 'border-red-200 bg-red-50'
                : runningLow
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-stone-200 bg-stone-50'
            }`}
          >
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                  Remaining
                </p>
                <p
                  className={`mt-1 text-3xl font-black ${
                    soldOut
                      ? 'text-red-600'
                      : runningLow
                        ? 'text-amber-700'
                        : 'text-stone-950'
                  }`}
                >
                  {remaining}
                  <span className="ml-1 text-base font-bold text-stone-400">
                    / {offer.total_available}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onClaim}
                disabled={soldOut}
                className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-black text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                {soldOut ? 'Sold out' : '+ Record claim'}
              </button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full ${soldOut ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-semibold text-stone-500">
              {offer.claimed_count} claimed
            </p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm font-black text-stone-700">
              Unlimited availability
            </p>
            <p className="mt-1 text-xs text-stone-500">
              No inventory limit is set for this offer.
            </p>
          </div>
        )}

        <div className="mt-5 border-t border-stone-100 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-stone-900">
                Claim history
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {claims.length
                  ? `${claims.length} recorded ${claims.length === 1 ? 'claim' : 'claims'}`
                  : 'No claimant details recorded yet.'}
              </p>
            </div>
            {!offer.is_limited || !soldOut ? (
              <button
                type="button"
                onClick={onClaim}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-700"
              >
                + Add claimant
              </button>
            ) : null}
          </div>

          {claims.length ? (
            <div className="mt-4 space-y-3">
              {claims.map((claim) => (
                <div
                  key={claim.id}
                  className="rounded-xl border border-stone-200 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-stone-900">
                        {claim.claimant_name}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-red-600">
                        {claim.lead_source}
                        <span className="font-medium text-stone-400">
                          {' '}
                          · {formatDate(claim.claimed_on)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onDeleteClaim(claim)}
                      className="rounded-lg px-2 py-1 text-xs font-bold text-stone-400 hover:bg-red-50 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>

                  {claim.company_name ||
                  claim.email ||
                  claim.telephone ||
                  claim.notes ? (
                    <div className="mt-2 text-xs leading-5 text-stone-600">
                      {claim.company_name ? (
                        <p className="font-bold">{claim.company_name}</p>
                      ) : null}
                      {claim.email ? <p>{claim.email}</p> : null}
                      {claim.telephone ? <p>{claim.telephone}</p> : null}
                      {claim.notes ? (
                        <p className="mt-1 text-stone-500">{claim.notes}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-stone-700">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  )
}

function SummaryCard({
  label,
  value,
  note,
  accent = false,
}: {
  label: string
  value: number
  note?: string
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${
        accent ? 'border-red-200 ring-4 ring-red-50' : 'border-stone-200'
      }`}
    >
      <p className="text-sm font-bold text-stone-500">{label}</p>
      <p
        className={`mt-3 text-4xl font-black tracking-tight ${
          accent ? 'text-red-600' : 'text-stone-950'
        }`}
      >
        {value}
      </p>
      {note ? (
        <p className="mt-2 text-xs font-bold text-amber-700">{note}</p>
      ) : null}
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3">
      <p className="text-xs font-black uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-stone-800">{value}</p>
    </div>
  )
}

function formatDateRange(startsOn: string | null, endsOn: string | null) {
  if (!startsOn && !endsOn) return 'No dates set'
  if (startsOn && endsOn) return `${formatDate(startsOn)} – ${formatDate(endsOn)}`
  if (startsOn) return `From ${formatDate(startsOn)}`
  return `Until ${formatDate(endsOn as string)}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
