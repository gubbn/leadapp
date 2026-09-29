export type NetworkingAttendeeDraft = {
  draftId: string
  name: string
  company: string
  role: string
  email: string
  website: string
  phone: string
  notes: string
  contactId: string
  companyId: string
  dealId: string
}

type NetworkingPersonIdentity = {
  contactId?: string | null
  email?: string | null
  name?: string | null
  company?: string | null
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_PATTERN = /(?:\+44\s?\(?(?:0\)?\s?)?|\(?0)(?:\d[\s().-]?){8,12}\d/
const WEBSITE_PATTERN = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/\S*)?$/i
const HEADING_PATTERN = /^(attendees?|delegates?|guest list|member list|members|visiting members|visitors|networking event|name|company|business|organisation|organization|role|job title|email|website|phone|telephone|mobile)$/i
const PAGE_MARKER_PATTERN = /^--\s*\d+\s+of\s+\d+\s*--$/i
const FOOTER_PATTERN = /^(?:screenpop networking|address|telephone\b.*\bemail\b.*)$/i
const END_SECTION_PATTERN = /^(?:group presenters?|future presentations?)$/i
const PRESENTER_PATTERN = /^presenting$/i

export function blankAttendeeDraft(index = 0): NetworkingAttendeeDraft {
  return {
    draftId: `manual-${Date.now()}-${index}`,
    name: '',
    company: '',
    role: '',
    email: '',
    website: '',
    phone: '',
    notes: '',
    contactId: '',
    companyId: '',
    dealId: '',
  }
}

export function networkingPersonKey(person: NetworkingPersonIdentity) {
  if (person.contactId) return `contact:${person.contactId}`

  const email = person.email?.trim().toLowerCase()
  if (email) return `email:${email}`

  const name = normaliseIdentity(person.name)
  const company = normaliseIdentity(person.company)
  return `name:${name}|company:${company}`
}

export function networkingRostersMatch(left: string[], right: string[]) {
  const leftRoster = new Set(left)
  const rightRoster = new Set(right)

  return leftRoster.size > 0
    && leftRoster.size === rightRoster.size
    && Array.from(leftRoster).every((personKey) => rightRoster.has(personKey))
}

export function parseAttendeeText(text: string): NetworkingAttendeeDraft[] {
  const rawLines = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())

  const attendeeHeadingIndex = rawLines.findIndex((line) => /^(?:screenpop\s+)?members$/i.test(line))
  const relevantLines = attendeeHeadingIndex >= 0 ? rawLines.slice(attendeeHeadingIndex + 1) : rawLines
  const lines: string[] = []

  for (const rawLine of relevantLines) {
    if (END_SECTION_PATTERN.test(rawLine)) break
    if (!rawLine || rawLine.length > 400) continue
    if (HEADING_PATTERN.test(rawLine) || PAGE_MARKER_PATTERN.test(rawLine) || FOOTER_PATTERN.test(rawLine)) continue
    if (/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(rawLine)) continue

    const presentingMatch = rawLine.match(/^(.*?)\s+presenting$/i)
    if (presentingMatch?.[1]) {
      lines.push(presentingMatch[1].trim(), 'Presenting')
    } else {
      lines.push(rawLine)
    }
  }

  const blockDrafts = parseMultilineBlocks(lines)
  const inlineDrafts = lines
    .filter((line) => EMAIL_PATTERN.test(line) && line.replace(EMAIL_PATTERN, '').trim())
    .map(parseAttendeeLine)
    .filter(isUsefulDraft)

  return dedupeDrafts([...blockDrafts, ...inlineDrafts])
}

export function parseNetworkingGroupName(text: string, sourceFileName = '') {
  const lines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines.slice(0, 20)) {
    const titleMatch = line.match(/\bnetworking\b(?:\s+(?:group|at))?\s+(.+)$/i)
    const candidate = titleMatch?.[1]?.trim()
    if (candidate && candidate.length <= 100 && !/^(?:event|members?)$/i.test(candidate)) return candidate
  }

  return sourceFileName
    .replace(/\.pdf$/i, '')
    .replace(/(?:19|20)\d{6}$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function parseMultilineBlocks(lines: string[]) {
  const drafts: NetworkingAttendeeDraft[] = []
  let identityLines: string[] = []
  let awaitingWebsite: NetworkingAttendeeDraft | null = null

  for (const line of lines) {
    const email = line.match(EMAIL_PATTERN)?.[0]?.toLowerCase()
    if (email) {
      const secondaryCompany = identityLines.length === 1 && drafts.length > 0 && !drafts.at(-1)?.website
      if (secondaryCompany) {
        const previous = drafts.at(-1)!
        previous.notes = appendNote(previous.notes, `${identityLines[0]}: ${email}`)
        identityLines = []
        awaitingWebsite = previous
        continue
      }

      const draft = draftFromIdentity(identityLines, email, drafts.length)
      identityLines = []
      if (draft) {
        drafts.push(draft)
        awaitingWebsite = draft
      }
      continue
    }

    if (isWebsiteLine(line)) {
      if (awaitingWebsite) awaitingWebsite.website = normaliseWebsite(line)
      continue
    }

    const phone = line.match(PHONE_PATTERN)?.[0]?.trim()
    if (phone && identityLines.length && !EMAIL_PATTERN.test(line)) {
      const draft = draftFromIdentity(identityLines, '', drafts.length)
      identityLines = []
      if (draft) {
        draft.phone = phone
        drafts.push(draft)
      }
      awaitingWebsite = null
      continue
    }

    identityLines.push(line)
    awaitingWebsite = null
  }

  return drafts.filter(isUsefulDraft)
}

function draftFromIdentity(identityLines: string[], email: string, index: number) {
  const cells = identityLines.map(cleanCell).filter(Boolean)
  if (!cells.length) return null

  const presentingIndex = cells.findIndex((cell) => PRESENTER_PATTERN.test(cell))
  const nameParts = presentingIndex >= 0 ? cells.slice(0, presentingIndex) : cells.slice(0, 1)
  const companyParts = presentingIndex >= 0 ? cells.slice(presentingIndex + 1) : cells.slice(1)
  const rawName = nameParts.join(' ').replace(/\s+-\s+HOST$/i, '').trim()
  const company = companyParts.join(' ').trim()

  return {
    ...blankAttendeeDraft(index),
    draftId: `pdf-${index}-${simpleHash([...cells, email].join('|'))}`,
    name: rawName,
    company,
    role: /\s+-\s+HOST$/i.test(nameParts.join(' ')) ? 'Host' : '',
    email,
  }
}

function parseAttendeeLine(line: string, index: number): NetworkingAttendeeDraft {
  const email = line.match(EMAIL_PATTERN)?.[0]?.toLowerCase() ?? ''
  const withoutEmail = email ? line.replace(email, ' ') : line
  const phone = withoutEmail.match(PHONE_PATTERN)?.[0]?.trim() ?? ''
  const remaining = phone ? withoutEmail.replace(phone, ' ') : withoutEmail

  const columns = remaining
    .split(/\t+|\s{2,}|\s+[|•·]\s+|\s+[–—-]\s+|\s*,\s*/)
    .map(cleanCell)
    .filter(Boolean)

  const websiteIndex = columns.findIndex(isWebsiteLine)
  const website = websiteIndex >= 0 ? normaliseWebsite(columns.splice(websiteIndex, 1)[0]) : ''

  return {
    ...blankAttendeeDraft(index),
    draftId: `pdf-inline-${index}-${simpleHash(line)}`,
    name: columns[0] ?? '',
    company: columns[1] ?? '',
    role: columns[2] ?? '',
    email,
    website,
    phone,
    notes: columns.slice(3).join(' · '),
  }
}

function normaliseWebsite(value: string) {
  const repaired = value.replace(/,/g, '.').replace(/[.,;:]+$/, '')
  return repaired.replace(/^https?:\/\//i, '')
}

function isWebsiteLine(value: string) {
  return WEBSITE_PATTERN.test(value.replace(/,/g, '.').replace(/[.,;:]+$/, ''))
}

function appendNote(current: string, note: string) {
  return [current.trim(), note.trim()].filter(Boolean).join(' · ')
}

function cleanCell(value: string) {
  return value.replace(/^[|,;:·•\s]+|[|,;:·•\s]+$/g, '').trim()
}

function isUsefulDraft(draft: NetworkingAttendeeDraft) {
  if (draft.email && draft.name) return true
  if (draft.name.length < 3 || draft.name.length > 120) return false
  if (HEADING_PATTERN.test(draft.name)) return false
  return /[a-z]/i.test(draft.name)
}

function dedupeDrafts(drafts: NetworkingAttendeeDraft[]) {
  const seen = new Set<string>()
  return drafts.filter((draft) => {
    const key = draft.email || [draft.name, draft.company].join('|').toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function simpleHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

function normaliseIdentity(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ') ?? ''
}
