'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'

type ThemeKey = 'work' | 'personal' | 'testimonial' | 'it-now' | 'recap'

type Theme = {
  key: ThemeKey
  label: string
  shortLabel: string
  helper: string
}

type PlannerInputs = Record<ThemeKey, string>

type SocialView = 'posts' | 'planner' | 'facebook'

type StoredPlanner = {
  weekStart: string
  platform: string
  tone: string
  audience: string
  cta: string
  inputs: PlannerInputs
}

type GeneratedPost = {
  day: string
  date: Date
  theme: Theme
  content: string
}

type FacebookGroup = {
  id: string
  name: string
  lastPosted: string
  lastScript: string
}

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

const baseThemes: Theme[] = [
  {
    key: 'work',
    label: "Something we're working on this week",
    shortLabel: 'This week',
    helper: 'Show useful work in progress, without oversharing client details.',
  },
  {
    key: 'personal',
    label: 'Personal post',
    shortLabel: 'Personal',
    helper: 'A human post that helps people know, like and trust you.',
  },
  {
    key: 'testimonial',
    label: 'Customer testimonial',
    shortLabel: 'Testimonial',
    helper: 'Turn proof into a short story about the problem and result.',
  },
  {
    key: 'it-now',
    label: 'Something happening in IT right now',
    shortLabel: 'IT now',
    helper: 'Make a current IT issue understandable and relevant.',
  },
  {
    key: 'recap',
    label: 'Recap',
    shortLabel: 'Recap',
    helper: 'Summarise the week and give people a simple next step.',
  },
]

const defaultInputs: PlannerInputs = {
  work:
    'Improving response time for a client and reviewing where their systems slow the team down.',
  personal: 'A small lesson from running a business this week.',
  testimonial:
    'A client said they finally feel confident that their IT is being looked after properly.',
  'it-now':
    'Cyber security, backups, Microsoft 365, AI tools, or common scams affecting small businesses.',
  recap:
    'The main thing we helped clients with this week, plus one useful reminder.',
}

const platformOptions = ['LinkedIn', 'Facebook', 'Instagram']
const toneOptions = ['Helpful', 'Plain English', 'Warm', 'Direct']
const facebookGroupsStorageKey = 'social-planner-facebook-groups'
const plannerStorageKey = 'social-planner-settings'

export function SocialWorkspace({ view }: { view: SocialView }) {
  const [weekStart, setWeekStart] = useState(getMonday(new Date()))
  const [platform, setPlatform] = useState(platformOptions[0])
  const [tone, setTone] = useState(toneOptions[1])
  const [audience, setAudience] = useState(
    'owners and managers of small businesses who want IT to be simpler and safer',
  )
  const [cta, setCta] = useState(
    'If this sounds familiar, message us and we can point you in the right direction.',
  )
  const [inputs, setInputs] = useState<PlannerInputs>(defaultInputs)
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [generatedContent, setGeneratedContent] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [facebookGroups, setFacebookGroups] = useState<FacebookGroup[]>([])
  const [facebookGroupsLoading, setFacebookGroupsLoading] = useState(view === 'facebook')
  const [facebookGroupsError, setFacebookGroupsError] = useState('')
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null)
  const [copiedGroupId, setCopiedGroupId] = useState<string | null>(null)
  const [plannerLoaded, setPlannerLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadPlanner() {
      await Promise.resolve()
      if (cancelled) return

      try {
        const stored: unknown = JSON.parse(window.localStorage.getItem(plannerStorageKey) || 'null')
        if (isStoredPlanner(stored)) {
          setWeekStart(stored.weekStart)
          setPlatform(stored.platform)
          setTone(stored.tone)
          setAudience(stored.audience)
          setCta(stored.cta)
          setInputs(stored.inputs)
        }
      } catch {
        // Use the defaults when saved planner settings are unavailable.
      } finally {
        setPlannerLoaded(true)
      }
    }

    void loadPlanner()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!plannerLoaded) return

    try {
      window.localStorage.setItem(plannerStorageKey, JSON.stringify({
        weekStart,
        platform,
        tone,
        audience,
        cta,
        inputs,
      } satisfies StoredPlanner))
    } catch {
      // Keep the planner usable when browser storage is unavailable.
    }
  }, [audience, cta, inputs, plannerLoaded, platform, tone, weekStart])

  useEffect(() => {
    if (view !== 'facebook') return

    let cancelled = false

    async function loadFacebookGroups() {
      try {
        const { data, error } = await supabase
          .from('facebook_groups')
          .select('id, group_name, last_posted, last_script')
          .order('created_at', { ascending: true })

        if (error) throw error
        if (cancelled) return

        const groups = (data || []).map((group) => ({
          id: group.id,
          name: group.group_name,
          lastPosted: group.last_posted || '',
          lastScript: group.last_script,
        }))

        if (groups.length) {
          setFacebookGroups(groups)
          window.localStorage.removeItem(facebookGroupsStorageKey)
          return
        }

        const savedGroups = window.localStorage.getItem(facebookGroupsStorageKey)
        const parsedGroups: unknown = savedGroups ? JSON.parse(savedGroups) : []
        if (Array.isArray(parsedGroups)) {
          const validGroups = parsedGroups.filter(isFacebookGroup)
          if (validGroups.length) {
            const { data: migrated, error: migrationError } = await supabase
              .from('facebook_groups')
              .insert(validGroups.map((group) => ({
                group_name: group.name,
                last_posted: group.lastPosted || null,
                last_script: group.lastScript,
              })))
              .select('id, group_name, last_posted, last_script')

            if (migrationError) throw migrationError
            if (cancelled) return

            setFacebookGroups((migrated || []).map((group) => ({
              id: group.id,
              name: group.group_name,
              lastPosted: group.last_posted || '',
              lastScript: group.last_script,
            })))
            window.localStorage.removeItem(facebookGroupsStorageKey)
          }
        }
      } catch (error) {
        if (!cancelled) {
          setFacebookGroupsError(
            error instanceof Error ? error.message : 'Facebook groups could not be loaded.',
          )
        }
      } finally {
        if (!cancelled) setFacebookGroupsLoading(false)
      }
    }

    void loadFacebookGroups()

    return () => {
      cancelled = true
    }
  }, [view])

  const weekDate = useMemo(() => parseDateInput(weekStart), [weekStart])

  const rotatedThemes = useMemo(() => {
    const offset = getWeekRotationOffset(weekDate)
    return weekdays.map(
      (_, index) =>
        baseThemes[(index - offset + baseThemes.length) % baseThemes.length],
    )
  }, [weekDate])

  const posts = useMemo(() => {
    return rotatedThemes.map((theme, index) => {
      const date = addDays(weekDate, index)

      return {
        day: weekdays[index],
        date,
        theme,
        content: generatedContent[toDateInput(date)] || generatePost({
          theme,
          platform,
          tone,
          audience,
          cta,
          input: inputs[theme.key],
        }),
      }
    })
  }, [audience, cta, generatedContent, inputs, platform, rotatedThemes, tone, weekDate])

  function updateInput(key: ThemeKey, value: string) {
    setInputs((current) => ({
      ...current,
      [key]: value,
    }))
  }

  async function copyPost(post: GeneratedPost, index: number) {
    await navigator.clipboard.writeText(post.content)
    setCopiedIndex(index)
    window.setTimeout(() => setCopiedIndex(null), 1800)
  }

  async function generateWithAI() {
    setIsGenerating(true)
    setGenerationError('')

    try {
      const response = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          tone,
          audience,
          callToAction: cta,
          posts: posts.map((post) => ({
            day: post.day,
            date: post.date.toISOString().slice(0, 10),
            theme: post.theme.label,
            notes: inputs[post.theme.key],
          })),
        }),
      })
      const result = await response.json().catch(() => null) as {
        posts?: Array<{ day: string; content: string }>
        error?: string
      } | null

      if (!response.ok || !result?.posts) {
        throw new Error(result?.error || 'The posts could not be generated.')
      }

      setGeneratedContent(Object.fromEntries(
        result.posts.map((post, index) => [
          toDateInput(posts[index].date),
          post.content,
        ]),
      ))
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : 'The posts could not be generated.',
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function updateGeneratedPost(date: Date, content: string) {
    setGeneratedContent((current) => ({
      ...current,
      [toDateInput(date)]: content,
    }))
  }

  function updateFacebookGroup(
    id: string,
    field: keyof Omit<FacebookGroup, 'id'>,
    value: string,
  ) {
    setFacebookGroups((current) => current.map((group) => (
      group.id === id ? { ...group, [field]: value } : group
    )))
  }

  async function addFacebookGroup() {
    setFacebookGroupsError('')
    const { data, error } = await supabase
      .from('facebook_groups')
      .insert({ group_name: '', last_script: '' })
      .select('id, group_name, last_posted, last_script')
      .single()

    if (error) {
      setFacebookGroupsError(error.message)
      return
    }

    setFacebookGroups((current) => [...current, {
      id: data.id,
      name: data.group_name,
      lastPosted: data.last_posted || '',
      lastScript: data.last_script,
    }])
  }

  async function saveFacebookGroup(group: FacebookGroup) {
    setSavingGroupId(group.id)
    setFacebookGroupsError('')
    const { error } = await supabase
      .from('facebook_groups')
      .update({
        group_name: group.name,
        last_posted: group.lastPosted || null,
        last_script: group.lastScript,
        updated_at: new Date().toISOString(),
      })
      .eq('id', group.id)

    if (error) setFacebookGroupsError(error.message)
    setSavingGroupId(null)
  }

  async function removeFacebookGroup(group: FacebookGroup) {
    setSavingGroupId(group.id)
    setFacebookGroupsError('')
    const { error } = await supabase
      .from('facebook_groups')
      .delete()
      .eq('id', group.id)

    if (error) {
      setFacebookGroupsError(error.message)
      setSavingGroupId(null)
      return
    }

    setFacebookGroups((current) => current.filter((item) => item.id !== group.id))
    setSavingGroupId(null)
  }

  async function copyGroupScript(group: FacebookGroup) {
    if (!group.lastScript.trim()) return
    await navigator.clipboard.writeText(group.lastScript)
    setCopiedGroupId(group.id)
    window.setTimeout(() => setCopiedGroupId(null), 1800)
  }

  const pageCopy = {
    posts: {
      eyebrow: 'Social',
      title: 'Generate and review social posts.',
      description: 'Create this week\'s drafts from the notes and preferences saved in Planner Setup.',
    },
    planner: {
      eyebrow: 'Planner setup',
      title: 'Set up the week and content themes.',
      description: 'Choose the platform, tone and audience, then add the notes used to build each post.',
    },
    facebook: {
      eyebrow: 'Facebook groups',
      title: 'Manage Facebook group outreach.',
      description: 'Track the groups you belong to, when you last posted and the script you used.',
    },
  }[view]

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-200 bg-gradient-to-br from-white via-stone-50 to-red-50">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <Link href="/" className="text-sm font-bold text-red-600">
            Back to dashboard
          </Link>

          <div className="mt-6 max-w-4xl">
            <p className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700">
              {pageCopy.eyebrow}
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              {pageCopy.title}
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              {pageCopy.description}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {view === 'planner' ? (
          <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-stone-950">
              Planner setup
            </h2>

            <div className="mt-5 grid gap-4">
              <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                  Week starting
                </span>
                <input
                  type="date"
                  value={weekStart}
                  onChange={(event) => setWeekStart(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Platform"
                  value={platform}
                  options={platformOptions}
                  onChange={setPlatform}
                />

                <Select
                  label="Tone"
                  value={tone}
                  options={toneOptions}
                  onChange={setTone}
                />
              </div>

              <Textarea
                label="Audience"
                value={audience}
                onChange={setAudience}
                rows={3}
              />

              <Textarea
                label="Default call to action"
                value={cta}
                onChange={setCta}
                rows={3}
              />
            </div>

            <div className="mt-6 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-stone-500">
                This week&apos;s rotation
              </p>

              <div className="mt-3 space-y-2">
                {rotatedThemes.map((theme, index) => (
                  <div
                    key={`${theme.key}-${weekdays[index]}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-black text-stone-950">
                      {weekdays[index]}
                    </span>
                    <span className="text-right font-semibold text-stone-600">
                      {theme.shortLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black text-stone-950">
              Content notes
            </h2>

            <p className="mt-1 text-sm text-stone-500">
              Add the subject and any useful details for each content type.
              Each post is rebuilt around your notes as you type.
            </p>

            <div className="mt-5 grid gap-4">
              {baseThemes.map((theme) => (
                <Textarea
                  key={theme.key}
                  label={theme.label}
                  helper={theme.helper}
                  value={inputs[theme.key]}
                  onChange={(value) => updateInput(theme.key, value)}
                  rows={3}
                />
              ))}
            </div>
          </section>
          </div>
        ) : null}

        {view === 'facebook' ? (
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-blue-700">
                Facebook outreach
              </p>
              <h2 className="mt-1 text-xl font-black text-stone-950">
                Groups we&apos;re members of
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Keep track of where you post, when you last posted and the script you used.
              </p>
            </div>

            <button
              type="button"
              onClick={addFacebookGroup}
              disabled={facebookGroupsLoading}
              className="shrink-0 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-50"
            >
              Add Facebook group
            </button>
          </div>

          <div className="p-5">
            {facebookGroupsError ? (
              <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {facebookGroupsError}
              </p>
            ) : null}

            {facebookGroupsLoading ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center">
                <p className="font-bold text-stone-700">Loading Facebook groups…</p>
              </div>
            ) : facebookGroups.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {facebookGroups.map((group, index) => (
                  <article
                    key={group.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-black text-stone-950">
                        {group.name.trim() || 'Untitled Facebook group'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => removeFacebookGroup(group)}
                        disabled={savingGroupId === group.id}
                        className="text-sm font-bold text-stone-500 transition hover:text-red-700"
                        aria-label={`Remove ${group.name || `Facebook group ${index + 1}`}`}
                      >
                        {savingGroupId === group.id ? 'Saving…' : 'Remove'}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                          Group name
                        </span>
                        <input
                          type="text"
                          value={group.name}
                          onChange={(event) => updateFacebookGroup(group.id, 'name', event.target.value)}
                          onBlur={() => saveFacebookGroup(group)}
                          placeholder="e.g. Local Business Network"
                          className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                          Last posted
                        </span>
                        <input
                          type="date"
                          value={group.lastPosted}
                          onChange={(event) => updateFacebookGroup(group.id, 'lastPosted', event.target.value)}
                          onBlur={() => saveFacebookGroup(group)}
                          className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50"
                        />
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
                        Last used script
                      </span>
                      <textarea
                        value={group.lastScript}
                        onChange={(event) => updateFacebookGroup(group.id, 'lastScript', event.target.value)}
                        onBlur={() => saveFacebookGroup(group)}
                        rows={6}
                        placeholder="Paste the last script you posted in this group…"
                        className="mt-1 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-50"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => copyGroupScript(group)}
                      disabled={!group.lastScript.trim()}
                      className="mt-3 rounded-xl bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copiedGroupId === group.id ? 'Copied' : 'Copy last script'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center">
                <p className="font-bold text-stone-700">No Facebook groups added yet.</p>
                <p className="mt-1 text-sm text-stone-500">
                  Add your first group to start tracking your posts.
                </p>
              </div>
            )}
          </div>
          </section>
        ) : null}

        {view === 'posts' ? (
          <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-stone-950">
                  Generated posts
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  Generate with AI, then review and edit every post before publishing.
                </p>
              </div>

              <button
                type="button"
                onClick={generateWithAI}
                disabled={isGenerating}
                className="rounded-xl bg-stone-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60"
              >
                {isGenerating ? 'Generating five posts…' : 'Generate with AI'}
              </button>
            </div>

            {generationError ? (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {generationError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 p-5 lg:grid-cols-5">
            {posts.map((post, index) => (
              <article
                key={`${post.day}-${post.theme.key}`}
                className="flex min-h-full flex-col rounded-2xl border border-stone-200 bg-stone-50 p-4"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">
                    {post.day} · {formatDate(post.date)}
                  </p>
                  <h3 className="mt-2 text-lg font-black text-stone-950">
                    {post.theme.shortLabel}
                  </h3>
                </div>

                <textarea
                  value={post.content}
                  onChange={(event) => updateGeneratedPost(post.date, event.target.value)}
                  rows={13}
                  className="mt-4 min-h-80 w-full flex-1 resize-none rounded-xl border border-stone-200 bg-white px-3 py-3 text-sm leading-6 text-stone-800 outline-none"
                />

                <button
                  type="button"
                  onClick={() => copyPost(post, index)}
                  className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
                >
                  {copiedIndex === index ? 'Copied' : 'Copy post'}
                </button>
              </article>
            ))}
          </div>
          </section>
        ) : null}
      </section>
    </main>
  )
}

function isFacebookGroup(value: unknown): value is FacebookGroup {
  if (!value || typeof value !== 'object') return false

  const group = value as Record<string, unknown>
  return typeof group.id === 'string'
    && typeof group.name === 'string'
    && typeof group.lastPosted === 'string'
    && typeof group.lastScript === 'string'
}

function isStoredPlanner(value: unknown): value is StoredPlanner {
  if (!value || typeof value !== 'object') return false

  const planner = value as Record<string, unknown>
  const storedInputs = planner.inputs

  return typeof planner.weekStart === 'string'
    && typeof planner.platform === 'string'
    && typeof planner.tone === 'string'
    && typeof planner.audience === 'string'
    && typeof planner.cta === 'string'
    && !!storedInputs
    && typeof storedInputs === 'object'
    && baseThemes.every((theme) => (
      typeof (storedInputs as Record<string, unknown>)[theme.key] === 'string'
    ))
}

function generatePost({
  theme,
  platform,
  tone,
  audience,
  cta,
  input,
}: {
  theme: Theme
  platform: string
  tone: string
  audience: string
  cta: string
  input: string
}) {
  const note = formatNotes(input)
  const audienceLine = audience.trim() || 'small business owners and managers'
  const ctaLine = cta.trim()

  if (!note) {
    return 'Add your content notes above and this post will be recreated around that subject.'
  }

  const opening = getOpening(theme.key, tone)
  const subject = buildSubject(note)
  const insight = getKeywordInsight(note, theme.key)
  const callToAction = ctaLine ? `\n\n${ctaLine}` : ''
  const platformTail = platform === 'Instagram'
    ? `\n\n${buildHashtags(note)}`
    : ''

  if (theme.key === 'work') {
    return `${opening}\n\n${subject}\n\n${insight}\n\nFor ${audienceLine}, this kind of work can make the day-to-day experience simpler, more reliable and less frustrating.\n\nCould the same issue be quietly costing your team time or confidence?${callToAction}${platformTail}`
  }

  if (theme.key === 'personal') {
    return `${opening}\n\n${subject}\n\n${insight}\n\nIt has been a useful reminder that the way we work matters just as much as the tools we use. For ${audienceLine}, a clear and practical approach can make a complicated situation feel much more manageable.${callToAction}${platformTail}`
  }

  if (theme.key === 'testimonial') {
    return `${opening}\n\n“${note}”\n\n${insight}\n\nFeedback like this matters because it shows the difference the right support can make. The result is not only a solved problem; it is more clarity, confidence and breathing room for the people running the business.${callToAction}${platformTail}`
  }

  if (theme.key === 'it-now') {
    return `${opening}\n\n${subject}\n\n${insight}\n\nFor ${audienceLine}, the important thing is not to treat this as background noise. Understanding how it could affect the business makes it much easier to decide what needs attention now and what can wait.\n\nA sensible next step is to review how this applies to your own systems and team.${callToAction}${platformTail}`
  }

  return `${opening}\n\n${subject}\n\n${insight}\n\nThe thread running through it all is that small, well-chosen improvements can make work feel safer, smoother and easier to manage. That is a useful thought for ${audienceLine} to carry into next week.${callToAction}${platformTail}`
}

function buildSubject(note: string) {
  const compact = note.replace(/\s+/g, ' ').trim()

  if (compact.split(/\s+/).length > 8 || /[.!?]$/.test(compact)) {
    return compact
  }

  const topics = compact
    .split(/\s*(?:,|;|\/|\||\band\b)\s*/i)
    .map((topic) => topic.trim())
    .filter(Boolean)

  if (topics.length === 1) return `The focus is ${lowerFirst(topics[0])}.`

  const last = lowerFirst(topics.at(-1) || '')
  return `The focus is ${topics.slice(0, -1).map(lowerFirst).join(', ')} and ${last}.`
}

function lowerFirst(value: string) {
  return value.charAt(0).toLocaleLowerCase('en-GB') + value.slice(1)
}

function getKeywordInsight(note: string, theme: ThemeKey) {
  const insights: Array<[RegExp, string]> = [
    [/\b(cyber(?:security| security)?|security|ransomware)\b/i, 'Good cyber security is built from protected accounts, updated devices, reliable backups and a team that knows what to look out for.'],
    [/\b(phishing|scam|fraud|suspicious email)\b/i, 'A quick pause before clicking, sharing details or approving a payment can prevent a convincing message from becoming a costly incident.'],
    [/\b(backup|backups|business continuity|disaster recovery)\b/i, 'A backup only provides peace of mind when it is protected, checked regularly and can be restored quickly.'],
    [/\b(microsoft 365|m365|teams|sharepoint|onedrive)\b/i, 'The biggest gains from Microsoft 365 come from configuring everyday tools properly and helping the team use them consistently.'],
    [/\b(ai|artificial intelligence|copilot|automation)\b/i, 'AI is most useful when it solves a clear problem and includes sensible checks around data and accuracy.'],
    [/\b(password|passwords|mfa|2fa|multi-factor|multifactor)\b/i, 'Strong, unique passwords and multi-factor authentication are two simple ways to reduce account risk.'],
    [/\b(slow|speed|performance|response time|downtime|reliability)\b/i, 'Small delays add up across a team, so finding the cause can recover useful time and reduce frustration.'],
    [/\b(cloud|cloud migration|remote work|hybrid work)\b/i, 'Cloud tools work best when access, security and day-to-day usability are planned together.'],
  ]
  const matched = insights.filter(([pattern]) => pattern.test(note)).slice(0, 2)
  if (matched.length) return matched.map(([, insight]) => insight).join(' ')

  const fallbacks: Record<ThemeKey, string> = {
    work: 'The aim is to understand the real cause, make a practical improvement and leave things easier to manage afterwards.',
    personal: 'The useful lessons are often simple: be clear about the goal, listen carefully and keep the next step practical.',
    testimonial: 'The strongest results are the ones people notice: less uncertainty, less interruption and more confidence.',
    'it-now': 'The useful question is what this means in practice and whether the business needs to act.',
    recap: 'Looking back helps turn a busy week into a useful lesson and a clear priority for what comes next.',
  }
  return fallbacks[theme]
}

function buildHashtags(note: string) {
  const tags: Array<[RegExp, string]> = [
    [/\b(cyber|security|ransomware)\b/i, '#CyberSecurity'],
    [/\b(phishing|scam|fraud)\b/i, '#PhishingAwareness'],
    [/\b(backup|continuity|recovery)\b/i, '#BusinessContinuity'],
    [/\b(microsoft 365|m365|teams|sharepoint|onedrive)\b/i, '#Microsoft365'],
    [/\b(ai|copilot|automation)\b/i, '#BusinessAI'],
    [/\b(cloud|remote work|hybrid work)\b/i, '#CloudComputing'],
  ]
  const topicTags = tags
    .filter(([pattern]) => pattern.test(note))
    .map(([, tag]) => tag)
    .slice(0, 2)
  return [...topicTags, '#SmallBusinessIT', '#BusinessSupport'].join(' ')
}
function getOpening(theme: ThemeKey, tone: string) {
  const openings: Record<ThemeKey, Record<string, string>> = {
    work: {
      Helpful: 'Here is a look at something we are working on this week.',
      'Plain English': 'This week, we are working on something practical.',
      Warm: 'A little look behind the scenes at what we are working on this week.',
      Direct: 'This is what we are working on this week.',
    },
    personal: {
      Helpful: 'A lesson from behind the scenes this week.',
      'Plain English': 'A thought from running the business this week.',
      Warm: 'A small behind-the-scenes thought from this week.',
      Direct: 'One thing stood out to me this week.',
    },
    testimonial: {
      Helpful: 'This customer feedback captures the result we aim for.',
      'Plain English': 'A customer shared this with us.',
      Warm: 'It is always lovely to receive feedback like this.',
      Direct: 'This is what good support should deliver.',
    },
    'it-now': {
      Helpful: 'Here is something worth knowing about in IT right now.',
      'Plain English': 'Something important is happening in IT right now.',
      Warm: 'A friendly heads-up about something happening in IT right now.',
      Direct: 'This IT issue deserves attention now.',
    },
    recap: {
      Helpful: 'A useful recap from this week.',
      'Plain English': 'Here is what stood out this week.',
      Warm: 'A quick Friday look back at the week.',
      Direct: 'This week in brief.',
    },
  }

  return openings[theme][tone] || openings[theme]['Plain English']
}

function formatNotes(value: string) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n')
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  )
}

function Textarea({
  label,
  helper,
  value,
  onChange,
  rows,
}: {
  label: string
  helper?: string
  value: string
  onChange: (value: string) => void
  rows: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="mt-1 w-full resize-y rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-red-500 focus:ring-4 focus:ring-red-50"
      />
      {helper ? (
        <span className="mt-1 block text-xs text-stone-500">{helper}</span>
      ) : null}
    </label>
  )
}

function getMonday(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return toDateInput(copy)
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date()
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function getWeekRotationOffset(date: Date) {
  const start = new Date(date.getFullYear(), 0, 1)
  const diffMs = date.getTime() - start.getTime()
  const weekNumber = Math.floor(diffMs / 1000 / 60 / 60 / 24 / 7)
  return weekNumber % baseThemes.length
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10)
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  })
}
