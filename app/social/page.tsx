'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'

type SourceKey =
  | 'support_ticket'
  | 'site_visit'
  | 'repeated_question'
  | 'team_chat'
  | 'renewal_review'
  | 'client_onboarding'
  | 'industry_news'
  | 'team_moment'

type PillarKey = 'save' | 'explainer' | 'local_face' | 'proof'
type Permission = 'yes' | 'no' | 'not_asked'
type ContentStatus = 'idea' | 'review' | 'ready' | 'used'

type ContentIdea = {
  id: string
  title: string | null
  source: SourceKey
  contact_permission: Permission
  contact_name: string | null
  what_happened: string
  pillar: PillarKey | null
  status: ContentStatus
  captured_on: string
  created_at: string
  updated_at: string
}

type ContentForm = {
  title: string
  source: SourceKey
  contactPermission: Permission
  contactName: string
  whatHappened: string
  pillar: '' | PillarKey
  status: ContentStatus
  capturedOn: string
}

type SourceDefinition = {
  key: SourceKey
  label: string
  shortPrompt: string
  description: string
  example: string
  suggestedPillar: PillarKey
}

const sources: SourceDefinition[] = [
  {
    key: 'support_ticket',
    label: 'Support ticket',
    shortPrompt: 'A routine call revealed something bigger.',
    description:
      'Look for closed tickets where the team prevented a risk, found a hidden cause, or produced a useful lesson—not ordinary password resets.',
    example:
      'A slow laptop turned out to have a failing drive with three years of data at risk.',
    suggestedPillar: 'save',
  },
  {
    key: 'site_visit',
    label: 'Site visit',
    shortPrompt: 'Show useful work happening locally.',
    description:
      'A photo and one line from the engineer is enough. Network audits, installations, or even the van outside a client site build familiarity.',
    example: 'On site today checking Wi-Fi coverage before a team expansion.',
    suggestedPillar: 'local_face',
  },
  {
    key: 'repeated_question',
    label: 'Repeated client question',
    shortPrompt: 'Publish the answer you keep giving.',
    description:
      'When several clients ask the same thing, capture the question and the plain-English answer. Repetition proves the topic is relevant.',
    example: 'Do we really need MFA if everyone already has a strong password?',
    suggestedPillar: 'explainer',
  },
  {
    key: 'team_chat',
    label: 'Team chat / Teams',
    shortPrompt: 'Lift a useful win from the team conversation.',
    description:
      'Scan internal wins or interesting fixes once a week. The engineers already produced the insight; the bank simply captures it.',
    example: 'The team spotted an unusual login rule before it became an incident.',
    suggestedPillar: 'save',
  },
  {
    key: 'renewal_review',
    label: 'Renewal or quarterly review',
    shortPrompt: 'Turn review outcomes into evidence.',
    description:
      'Capture savings, risks removed, improvements made, or the next strategic step. Anonymise the client when permission is unavailable.',
    example: 'Removed unused licences and reduced annual software spend by 20%.',
    suggestedPillar: 'proof',
  },
  {
    key: 'client_onboarding',
    label: 'New client onboarding',
    shortPrompt: 'Capture the before and after.',
    description:
      'Record what was broken or risky when the client arrived, what changed, and what the new situation means for their team.',
    example: 'From shared passwords and no tested backup to managed access and recovery.',
    suggestedPillar: 'proof',
  },
  {
    key: 'industry_news',
    label: 'Industry news reaction',
    shortPrompt: 'Explain what today’s news means locally.',
    description:
      'React to a breach, outage, scam, or technology change with a practical explanation for businesses, charities, or schools of your audience’s size.',
    example: 'What the cloud outage means—and the continuity checks worth doing today.',
    suggestedPillar: 'explainer',
  },
  {
    key: 'team_moment',
    label: 'Team moment',
    shortPrompt: 'Show the humans behind the service.',
    description:
      'Birthdays, anniversaries, new starters, charity days, learning, or the office dog all make the brand more familiar and approachable.',
    example: 'Celebrating five years with the engineer clients know by name.',
    suggestedPillar: 'local_face',
  },
]

const pillars: Record<
  PillarKey,
  { label: string; promise: string; description: string; test: string; style: string }
> = {
  save: {
    label: 'Save',
    promise: 'Useful enough to keep',
    description:
      'A practical lesson, warning, checklist, or real incident that helps someone avoid a problem later.',
    test: 'Would a reader save this so they can act on it?',
    style: 'bg-blue-100 text-blue-700',
  },
  explainer: {
    label: 'Explainer',
    promise: 'Makes IT easier to understand',
    description:
      'Answer a common question in plain English: what it is, why it matters, and what a sensible next step looks like.',
    test: 'Does this remove confusion without drowning people in jargon?',
    style: 'bg-violet-100 text-violet-700',
  },
  local_face: {
    label: 'Local Face',
    promise: 'Shows the people doing the work',
    description:
      'Human, local, behind-the-scenes content that builds recognition and trust before a prospect needs help.',
    test: 'Does this make Fixing IT feel familiar and approachable?',
    style: 'bg-amber-100 text-amber-800',
  },
  proof: {
    label: 'Proof',
    promise: 'Shows a credible result',
    description:
      'A before-and-after story, measurable improvement, testimonial, or outcome that demonstrates the value of the work.',
    test: 'Does this give evidence rather than simply claiming we are good?',
    style: 'bg-emerald-100 text-emerald-700',
  },
}

const statusLabels: Record<ContentStatus, string> = {
  idea: 'Idea',
  review: 'Needs review',
  ready: 'Ready to write',
  used: 'Used',
}

function today() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

const emptyForm: ContentForm = {
  title: '',
  source: 'support_ticket',
  contactPermission: 'not_asked',
  contactName: '',
  whatHappened: '',
  pillar: '',
  status: 'idea',
  capturedOn: today(),
}

export default function ContentBankPage() {
  const [ideas, setIdeas] = useState<ContentIdea[]>([])
  const [form, setForm] = useState<ContentForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | ContentStatus>('all')
  const [pillarFilter, setPillarFilter] = useState<'all' | 'unassigned' | PillarKey>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | SourceKey>('all')
  const [search, setSearch] = useState('')

  const loadIdeas = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('social_content_bank')
      .select('*')
      .order('captured_on', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) setErrorMessage(error.message)
    else setIdeas((data ?? []) as ContentIdea[])
    setLoading(false)
  }, [])

  useEffect(() => {
    // Supabase is the external data source synchronized by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIdeas()
  }, [loadIdeas])

  const filteredIdeas = useMemo(() => {
    const query = search.trim().toLowerCase()
    return ideas.filter((idea) => {
      const matchesStatus = statusFilter === 'all' || idea.status === statusFilter
      const matchesPillar =
        pillarFilter === 'all' ||
        (pillarFilter === 'unassigned' && idea.pillar === null) ||
        idea.pillar === pillarFilter
      const matchesSource = sourceFilter === 'all' || idea.source === sourceFilter
      const matchesSearch =
        !query ||
        [idea.title, idea.what_happened, idea.contact_name, sourceFor(idea.source).label]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      return matchesStatus && matchesPillar && matchesSource && matchesSearch
    })
  }, [ideas, pillarFilter, search, sourceFilter, statusFilter])

  const unassignedCount = ideas.filter((idea) => !idea.pillar).length
  const readyCount = ideas.filter((idea) => idea.status === 'ready').length
  const unusedCount = ideas.filter((idea) => idea.status !== 'used').length

  function openCreate() {
    setEditingId(null)
    setForm({ ...emptyForm, capturedOn: today() })
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
  }

  function openEdit(idea: ContentIdea) {
    setEditingId(idea.id)
    setForm({
      title: idea.title ?? '',
      source: idea.source,
      contactPermission: idea.contact_permission,
      contactName: idea.contact_name ?? '',
      whatHappened: idea.what_happened,
      pillar: idea.pillar ?? '',
      status: idea.status,
      capturedOn: idea.captured_on,
    })
    setShowForm(true)
    setErrorMessage('')
    setSuccessMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function changeSource(source: SourceKey) {
    setForm((current) => ({
      ...current,
      source,
      pillar: current.pillar || sourceFor(source).suggestedPillar,
    }))
  }

  async function saveIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.whatHappened.trim()) {
      setErrorMessage('Describe what happened before saving the idea.')
      return
    }
    if (form.contactPermission === 'yes' && !form.contactName.trim()) {
      setErrorMessage('Add the contact name, or change the naming permission.')
      return
    }

    setSaving(true)
    setErrorMessage('')
    const payload = {
      title: form.title.trim() || null,
      source: form.source,
      contact_permission: form.contactPermission,
      contact_name:
        form.contactPermission === 'yes' ? form.contactName.trim() : null,
      what_happened: form.whatHappened.trim(),
      pillar: form.pillar || null,
      status: form.status,
      captured_on: form.capturedOn,
      updated_at: new Date().toISOString(),
    }
    const result = editingId
      ? await supabase.from('social_content_bank').update(payload).eq('id', editingId)
      : await supabase.from('social_content_bank').insert(payload)

    if (result.error) {
      setErrorMessage(result.error.message)
      setSaving(false)
      return
    }

    setSuccessMessage(editingId ? 'Content idea updated.' : 'Content idea added.')
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    await loadIdeas()
    setSaving(false)
  }

  async function changeStatus(idea: ContentIdea, status: ContentStatus) {
    setErrorMessage('')
    const { error } = await supabase
      .from('social_content_bank')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', idea.id)
    if (error) setErrorMessage(error.message)
    else await loadIdeas()
  }

  async function deleteIdea(idea: ContentIdea) {
    if (!window.confirm(`Delete “${displayTitle(idea)}”?`)) return
    const { error } = await supabase.from('social_content_bank').delete().eq('id', idea.id)
    if (error) setErrorMessage(error.message)
    else {
      setSuccessMessage('Content idea deleted.')
      await loadIdeas()
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-red-700">
                Social content bank
              </p>
              <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
                Capture real stories while they are fresh.
              </h1>
              <p className="mt-5 text-base leading-7 text-stone-600">
                Turn work already happening across Fixing IT into useful,
                credible social content. Capture the raw story now; a director
                can review the permissions and pillar later.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-red-700"
            >
              + Capture an idea
            </button>
          </div>

          {showForm ? (
            <form onSubmit={saveIdea} className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-lg">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">
                    {editingId ? 'Edit idea' : 'New content idea'}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-stone-950">
                    Capture the story, not the finished post.
                  </h2>
                </div>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100">
                  Close
                </button>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="space-y-5">
                  <Field label="Source" required>
                    <select value={form.source} onChange={(event) => changeSource(event.target.value as SourceKey)} className="form-input">
                      {sources.map((source) => (
                        <option key={source.key} value={source.key}>{source.label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                    <p className="text-sm font-black text-red-800">{sourceFor(form.source).shortPrompt}</p>
                    <p className="mt-2 text-sm leading-6 text-red-700">{sourceFor(form.source).description}</p>
                    <p className="mt-3 text-xs font-semibold italic text-red-500">Example: {sourceFor(form.source).example}</p>
                  </div>

                  <Field label="Working title">
                    <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="form-input" placeholder="A short label to find this idea later" />
                  </Field>

                  <Field label="Captured on" required>
                    <input required type="date" value={form.capturedOn} onChange={(event) => setForm({ ...form, capturedOn: event.target.value })} className="form-input" />
                  </Field>
                </div>

                <div className="space-y-5">
                  <Field label="What happened?" required>
                    <textarea required rows={7} maxLength={10000} value={form.whatHappened} onChange={(event) => setForm({ ...form, whatHappened: event.target.value })} className="form-input resize-y" placeholder="What was the situation? What did we notice or do? What changed, and why would a client care?" />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Can we name the contact?" required>
                      <select value={form.contactPermission} onChange={(event) => setForm({ ...form, contactPermission: event.target.value as Permission, contactName: event.target.value === 'yes' ? form.contactName : '' })} className="form-input">
                        <option value="not_asked">Not asked yet</option>
                        <option value="yes">Yes — permission confirmed</option>
                        <option value="no">No — anonymise this</option>
                      </select>
                    </Field>
                    {form.contactPermission === 'yes' ? (
                      <Field label="Contact name" required>
                        <input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} className="form-input" placeholder="Name or approved business name" />
                      </Field>
                    ) : (
                      <div className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">
                        {form.contactPermission === 'no'
                          ? 'The story will be treated as anonymous.'
                          : 'A director can confirm permission during review.'}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Content pillar">
                      <select value={form.pillar} onChange={(event) => setForm({ ...form, pillar: event.target.value as '' | PillarKey })} className="form-input">
                        <option value="">Leave for director to review</option>
                        {(Object.keys(pillars) as PillarKey[]).map((pillar) => (
                          <option key={pillar} value={pillar}>{pillars[pillar].label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Workflow status">
                      <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ContentStatus })} className="form-input">
                        {(Object.keys(statusLabels) as ContentStatus[]).map((status) => (
                          <option key={status} value={status}>{statusLabels[status]}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3 border-t border-stone-100 pt-5">
                <button type="button" onClick={() => setShowForm(false)} className="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-700 hover:bg-stone-50">Cancel</button>
                <button disabled={saving} className="rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50">
                  {saving ? 'Saving...' : editingId ? 'Save changes' : 'Add to content bank'}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {errorMessage ? <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">{errorMessage}</p> : null}
        {successMessage ? <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{successMessage}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="All ideas" value={ideas.length} />
          <Summary label="Unused ideas" value={unusedCount} />
          <Summary label="Ready to write" value={readyCount} accent />
          <Summary label="Pillar not assigned" value={unassignedCount} warning={unassignedCount > 0} />
        </div>

        <PillarGuide />
        <SourceGuide />

        <div className="mt-8 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="form-input" placeholder="Search stories, contacts or titles..." />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | ContentStatus)} className="form-input lg:w-44">
              <option value="all">All statuses</option>
              {(Object.keys(statusLabels) as ContentStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
            </select>
            <select value={pillarFilter} onChange={(event) => setPillarFilter(event.target.value as 'all' | 'unassigned' | PillarKey)} className="form-input lg:w-44">
              <option value="all">All pillars</option>
              <option value="unassigned">Not assigned</option>
              {(Object.keys(pillars) as PillarKey[]).map((pillar) => <option key={pillar} value={pillar}>{pillars[pillar].label}</option>)}
            </select>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as 'all' | SourceKey)} className="form-input lg:w-56">
              <option value="all">All sources</option>
              {sources.map((source) => <option key={source.key} value={source.key}>{source.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-8 text-sm text-stone-500">Loading content bank...</div>
        ) : filteredIdeas.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
            <h2 className="text-xl font-black text-stone-900">{ideas.length ? 'No ideas match these filters.' : 'The content bank is ready.'}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-stone-500">
              {ideas.length ? 'Try clearing a filter.' : 'Start with one useful support ticket, repeated client question, or team win from this week.'}
            </p>
            {!ideas.length ? <button type="button" onClick={openCreate} className="mt-5 rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white">Capture the first idea</button> : null}
          </div>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {filteredIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} onEdit={() => openEdit(idea)} onDelete={() => void deleteIdea(idea)} onStatus={(status) => void changeStatus(idea, status)} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

function PillarGuide() {
  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">What the pillars mean</p>
        <h2 className="mt-1 text-2xl font-black text-stone-950">Choose the job the post needs to do.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">The pillar is not the topic. It is the reason the post deserves to exist for the reader. If the answer is unclear, leave it unassigned for a director to review.</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(pillars) as PillarKey[]).map((key) => {
          const pillar = pillars[key]
          return (
            <article key={key} className="rounded-xl border border-stone-200 p-4">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${pillar.style}`}>{pillar.label}</span>
              <h3 className="mt-3 font-black text-stone-900">{pillar.promise}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{pillar.description}</p>
              <p className="mt-3 border-t border-stone-100 pt-3 text-xs font-bold leading-5 text-stone-500">{pillar.test}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function SourceGuide() {
  return (
    <details className="mt-5 rounded-2xl border border-stone-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-6 py-5 [&::-webkit-details-marker]:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Idea prompts</p>
            <h2 className="mt-1 text-xl font-black text-stone-950">Where content comes from</h2>
          </div>
          <span className="rounded-lg bg-stone-100 px-3 py-2 text-xs font-black text-stone-600">Show 8 sources ▾</span>
        </div>
      </summary>
      <div className="grid gap-3 border-t border-stone-100 p-6 md:grid-cols-2">
        {sources.map((source) => (
          <div key={source.key} className="rounded-xl bg-stone-50 p-4">
            <h3 className="font-black text-stone-900">{source.label}</h3>
            <p className="mt-1 text-sm leading-6 text-stone-600">{source.description}</p>
            <p className="mt-2 text-xs font-bold text-red-600">Often fits: {pillars[source.suggestedPillar].label}</p>
          </div>
        ))}
      </div>
    </details>
  )
}

function IdeaCard({ idea, onEdit, onDelete, onStatus }: { idea: ContentIdea; onEdit: () => void; onDelete: () => void; onStatus: (status: ContentStatus) => void }) {
  const source = sourceFor(idea.source)
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-600">{source.label}</span>
            {idea.pillar ? <span className={`rounded-full px-2.5 py-1 text-xs font-black ${pillars[idea.pillar].style}`}>{pillars[idea.pillar].label}</span> : <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-black text-red-600">Pillar needed</span>}
          </div>
          <h2 className="mt-3 text-xl font-black text-stone-950">{displayTitle(idea)}</h2>
        </div>
        <button type="button" onClick={onEdit} className="rounded-lg px-3 py-2 text-sm font-bold text-stone-500 hover:bg-stone-100">Edit</button>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-600">{idea.what_happened}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Info label="Contact naming" value={idea.contact_permission === 'yes' ? `Approved: ${idea.contact_name}` : idea.contact_permission === 'no' ? 'Anonymise' : 'Permission not asked'} />
        <Info label="Captured" value={formatDate(idea.captured_on)} />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
        <select value={idea.status} onChange={(event) => onStatus(event.target.value as ContentStatus)} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-black text-stone-700">
          {(Object.keys(statusLabels) as ContentStatus[]).map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
        <button type="button" onClick={onDelete} className="rounded-lg px-3 py-2 text-xs font-bold text-stone-400 hover:bg-red-50 hover:text-red-600">Delete</button>
      </div>
    </article>
  )
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-black text-stone-700">{label}{required ? <span className="text-red-600"> *</span> : null}</span>{children}</label>
}

function Summary({ label, value, accent = false, warning = false }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  return <div className={`rounded-2xl border bg-white p-5 shadow-sm ${accent ? 'border-emerald-200 ring-4 ring-emerald-50' : warning ? 'border-amber-200' : 'border-stone-200'}`}><p className="text-sm font-bold text-stone-500">{label}</p><p className={`mt-3 text-4xl font-black ${accent ? 'text-emerald-600' : warning ? 'text-amber-700' : 'text-stone-950'}`}>{value}</p></div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-stone-50 p-3"><p className="text-[10px] font-black uppercase tracking-wide text-stone-400">{label}</p><p className="mt-1 text-sm font-bold text-stone-700">{value}</p></div>
}

function sourceFor(key: SourceKey) {
  return sources.find((source) => source.key === key) ?? sources[0]
}

function displayTitle(idea: ContentIdea) {
  return idea.title?.trim() || `${sourceFor(idea.source).label} idea`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
