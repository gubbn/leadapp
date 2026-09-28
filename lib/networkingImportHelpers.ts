export type NetworkingAttendeeDraft = {
  draftId: string
  name: string
  company: string
  role: string
  email: string
  phone: string
  notes: string
  contactId: string
  companyId: string
  dealId: string
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_PATTERN = /(?:\+44\s?\(?(?:0\)?\s?)?|\(?0)(?:\d[\s().-]?){8,12}\d/
const HEADING_PATTERN = /^(attendees?|delegates?|guest list|member list|networking event|name|company|business|organisation|organization|role|job title|email|phone|telephone|mobile)$/i
const PAGE_MARKER_PATTERN = /^--\s*\d+\s+of\s+\d+\s*--$/i

export function blankAttendeeDraft(index = 0): NetworkingAttendeeDraft {
  return {
    draftId: `manual-${Date.now()}-${index}`,
    name: '',
    company: '',
    role: '',
    email: '',
    phone: '',
    notes: '',
    contactId: '',
    companyId: '',
    dealId: '',
  }
}

export function parseAttendeeText(text: string): NetworkingAttendeeDraft[] {
  const lines = text
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line.length > 400) return false
      if (HEADING_PATTERN.test(line) || PAGE_MARKER_PATTERN.test(line)) return false
      return !/^page\s+\d+(?:\s+of\s+\d+)?$/i.test(line)
    })

  return dedupeDrafts(lines.map(parseAttendeeLine).filter(isUsefulDraft))
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

  return {
    draftId: `pdf-${index}-${simpleHash(line)}`,
    name: columns[0] ?? '',
    company: columns[1] ?? '',
    role: columns[2] ?? '',
    email,
    phone,
    notes: columns.slice(3).join(' · '),
    contactId: '',
    companyId: '',
    dealId: '',
  }
}

function cleanCell(value: string) {
  return value.replace(/^[|,;:·•\s]+|[|,;:·•\s]+$/g, '').trim()
}

function isUsefulDraft(draft: NetworkingAttendeeDraft) {
  if (draft.email) return true
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
