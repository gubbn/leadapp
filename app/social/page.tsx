'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'

type ThemeKey = 'work' | 'personal' | 'testimonial' | 'it-now' | 'recap'

type Theme = {
  key: ThemeKey
  label: string
  shortLabel: string
  helper: string
}

type PlannerInputs = Record<ThemeKey, string>

type GeneratedPost = {
  day: string
  date: Date
  theme: Theme
  content: string
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

export default function SocialPlannerPage() {
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
        content: generatePost({
          theme,
          platform,
          tone,
          audience,
          cta,
          input: inputs[theme.key],
        }),
      }
    })
  }, [audience, cta, inputs, platform, rotatedThemes, tone, weekDate])

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
              Social planner
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-stone-950 md:text-5xl">
              Plan the week and generate post drafts.
            </h1>

            <p className="mt-5 text-base leading-7 text-stone-600">
              Rotate your five social themes by one weekday each week, then turn
              simple notes into ready-to-edit posts.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
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
              Add one useful detail for each content type. The posts update as
              you type.
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

        <section className="mt-6 rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 p-5">
            <h2 className="text-xl font-black text-stone-950">
              Generated posts
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Use these as first drafts, then add any client-specific detail
              before posting.
            </p>
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
                  readOnly
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
      </section>
    </main>
  )
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
  const note = input.trim() || 'Add a specific detail here.'
  const audienceLine = audience.trim()
  const ctaLine = cta.trim()

  const intro =
    tone === 'Direct'
      ? 'A quick note for'
      : tone === 'Warm'
        ? 'Something worth sharing with'
        : 'A useful reminder for'

  const platformTail =
    platform === 'Instagram'
      ? '\n\n#SmallBusinessIT #CyberSecurity #BusinessSupport'
      : ''

  if (theme.key === 'work') {
    return `${intro} ${audienceLine}.\n\nThis week, we are working on: ${note}\n\nThe useful bit is this: IT support is not just about fixing things when they break. It is about spotting the small friction points that quietly cost people time every week.\n\nOne question worth asking in your own business: where does your team lose time because a system, process or device is harder than it needs to be?\n\n${ctaLine}${platformTail}`
  }

  if (theme.key === 'personal') {
    return `A small behind-the-scenes thought.\n\n${note}\n\nRunning a business is full of reminders that simple is usually better. Clear communication, tidy systems and honest expectations make a bigger difference than most complicated tools.\n\nThat is how we try to approach IT support too: keep it understandable, useful and calm.\n\n${ctaLine}${platformTail}`
  }

  if (theme.key === 'testimonial') {
    return `It is always good to hear this kind of feedback from a customer:\n\n"${note}"\n\nFor us, that is the goal. Not just fixing the immediate issue, but helping people feel that their IT is under control and that they know who to call when something feels off.\n\nGood support should remove stress, not add another thing to manage.\n\n${ctaLine}${platformTail}`
  }

  if (theme.key === 'it-now') {
    return `Something to keep an eye on in IT right now:\n\n${note}\n\nThe practical takeaway is to avoid treating IT risks as abstract. Most problems start with everyday things: weak passwords, missed updates, unclear backup checks, or a message that looks just convincing enough.\n\nA good next step is to pick one area this week and check it properly.\n\n${ctaLine}${platformTail}`
  }

  return `Friday recap.\n\n${note}\n\nThe pattern this week: small improvements add up. A cleaner process, a safer setup, a quicker fix, or a clearer answer can make the working day feel much less frustrating.\n\nIf your IT has been sitting in the "we should probably sort that" pile, this is your nudge to move it up the list.\n\n${ctaLine}${platformTail}`
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
