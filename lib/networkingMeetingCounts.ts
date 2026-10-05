export type MeetingAttendeeIdentity = {
  event_id: string
  contact_id?: string | null
  raw_email?: string | null
  raw_name?: string | null
  raw_company?: string | null
}

export type MeetingContactIdentity = {
  id: string
  email?: string | null
  name?: string | null
  companyName?: string | null
}

export function networkingMeetingPersonKey(
  attendee: MeetingAttendeeIdentity,
  contacts: MeetingContactIdentity[],
) {
  if (attendee.contact_id) return `contact:${attendee.contact_id}`

  const email = normalise(attendee.raw_email)
  if (email) {
    const contact = contacts.find((candidate) => normalise(candidate.email) === email)
    if (contact) return `contact:${contact.id}`
  }

  const name = normalise(attendee.raw_name)
  const company = normalise(attendee.raw_company)
  if (name) {
    const matchingContacts = contacts.filter((candidate) => normalise(candidate.name) === name)
    const contact = company
      ? matchingContacts.find((candidate) => normalise(candidate.companyName) === company)
      : matchingContacts.length === 1
        ? matchingContacts[0]
        : undefined

    if (contact) return `contact:${contact.id}`
  }

  if (email) return `email:${email}`
  return `name:${name}|company:${company}`
}

export function buildMeetingCounts(
  attendees: MeetingAttendeeIdentity[],
  contacts: MeetingContactIdentity[],
) {
  const eventsByPerson = new Map<string, Set<string>>()

  attendees.forEach((attendee) => {
    const key = networkingMeetingPersonKey(attendee, contacts)
    const events = eventsByPerson.get(key) ?? new Set<string>()
    events.add(attendee.event_id)
    eventsByPerson.set(key, events)
  })

  return new Map(
    Array.from(eventsByPerson, ([key, eventIds]) => [key, eventIds.size]),
  )
}

function normalise(value?: string | null) {
  return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
}
