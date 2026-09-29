'use client'

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react'
import AppHeader from '@/app/components/AppHeader'
import { supabase } from '@/lib/supabaseClient'
import {
  blankAttendeeDraft,
  parseAttendeeText,
  parseNetworkingGroupName,
  type NetworkingAttendeeDraft,
} from '@/lib/networkingImportHelpers'

type NetworkingGroup = {
  id: string
  name: string
  location: string | null
  website: string | null
  notes: string | null
}

type NetworkingEvent = {
  id: string
  group_id: string
  event_name: string
  event_date: string
  venue: string | null
  source_file_name: string | null
}

type NetworkingAttendee = {
  id: string
  event_id: string
  contact_id: string | null
  company_id: string | null
  deal_id: string | null
  raw_name: string
  raw_company: string | null
  raw_role: string | null
  raw_email: string | null
  raw_phone: string | null
  notes: string | null
  relationship_temperature: 'new' | 'warm' | 'strong'
  follow_up_action: string | null
  follow_up_due: string | null
}

type Company = { id: string; company_name: string }
type Contact = {
  id: string
  company_id: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  companies: { company_name: string | null } | { company_name: string | null }[] | null
}
type Deal = {
  id: string
  company_id: string
  name: string
  stage: string
  companies: { company_name: string | null } | { company_name: string | null }[] | null
}

const TODAY = new Date().toISOString().slice(0, 10)

export default function NetworkingPage() {
  const [groups, setGroups] = useState<NetworkingGroup[]>([])
  const [events, setEvents] = useState<NetworkingEvent[]>([])
  const [attendees, setAttendees] = useState<NetworkingAttendee[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [setupRequired, setSetupRequired] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setSetupRequired(false)

    const [groupResult, eventResult, attendeeResult, companyResult, contactResult, dealResult] = await Promise.all([
      supabase.from('networking_groups').select('id,name,location,website,notes').order('name'),
      supabase.from('networking_events').select('id,group_id,event_name,event_date,venue,source_file_name').order('event_date', { ascending: false }),
      supabase.from('networking_attendees').select('id,event_id,contact_id,company_id,deal_id,raw_name,raw_company,raw_role,raw_email,raw_phone,notes,relationship_temperature,follow_up_action,follow_up_due').order('created_at', { ascending: false }),
      supabase.from('companies').select('id,company_name').order('company_name'),
      supabase.from('contacts').select('id,company_id,first_name,last_name,email,companies(company_name)').eq('is_active', true).order('last_name'),
      supabase.from('deals').select('id,company_id,name,stage,companies(company_name)').order('updated_at', { ascending: false }),
    ])

    const networkingError = groupResult.error || eventResult.error || attendeeResult.error
    if (networkingError) {
      const message = networkingError.message.toLowerCase()
      setSetupRequired(networkingError.code === '42P01' || message.includes('networking_'))
      setError(networkingError.message)
    } else {
      setGroups((groupResult.data ?? []) as NetworkingGroup[])
      setEvents((eventResult.data ?? []) as NetworkingEvent[])
      setAttendees((attendeeResult.data ?? []) as NetworkingAttendee[])
    }

    if (companyResult.error || contactResult.error || dealResult.error) {
      setError((companyResult.error || contactResult.error || dealResult.error)?.message ?? 'CRM records could not be loaded.')
    }
    setCompanies((companyResult.data ?? []) as Company[])
    setContacts((contactResult.data ?? []) as Contact[])
    setDeals((dealResult.data ?? []) as Deal[])
    setLoading(false)
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups])
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events])
  const contactById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts])
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies])
  const dealById = useMemo(() => new Map(deals.map((deal) => [deal.id, deal])), [deals])
  const attendeeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    attendees.forEach((attendee) => counts.set(attendee.event_id, (counts.get(attendee.event_id) ?? 0) + 1))
    return counts
  }, [attendees])
  const linkedOpportunityCount = attendees.filter((attendee) => attendee.deal_id).length
  const recentAttendees = selectedEventId
    ? attendees.filter((attendee) => attendee.event_id === selectedEventId)
    : attendees.slice(0, 8)

  return (
    <main className="min-h-screen bg-[#eeeae3] text-stone-900">
      <AppHeader />

      <section className="border-b border-stone-800 bg-stone-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-11 md:py-14">
          <div className="grid gap-9 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-red-400">Little black book</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Remember the person, the room and the opportunity.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-stone-300">Turn every attendee list into useful context: where you met, who they work for, and which live opportunity the relationship could help.</p>
            </div>
            <button onClick={() => setImportOpen(true)} className="rounded-2xl bg-red-600 px-6 py-4 text-left shadow-[0_14px_40px_rgba(0,0,0,0.3)] transition hover:bg-red-500">
              <span className="block text-xs font-black uppercase tracking-widest text-red-100">After your next event</span>
              <span className="mt-1 block text-lg font-black">+ Add attendee list</span>
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8">
        {setupRequired ? <SetupCard /> : null}
        {!setupRequired && error ? <p className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Networking groups" value={groups.length} note="Your regular rooms" />
          <Metric label="Events remembered" value={events.length} note="With useful context" />
          <Metric label="People met" value={attendees.length} note="Across every event" />
          <Metric label="Opportunity links" value={linkedOpportunityCount} note="Introductions with purpose" accent />
        </div>

        {importOpen ? (
          <ImportEventPanel
            groups={groups}
            companies={companies}
            contacts={contacts}
            deals={deals}
            onClose={() => setImportOpen(false)}
            onSaved={async () => {
              setImportOpen(false)
              await load()
            }}
          />
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <section className="rounded-3xl border border-stone-300 bg-[#f8f5ef] p-5 shadow-sm">
            <div className="flex items-end justify-between gap-4 border-b border-stone-300 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-600">The regular rooms</p>
                <h2 className="mt-2 text-2xl font-black text-stone-950">Your groups</h2>
              </div>
              <span className="text-sm font-bold text-stone-400">{groups.length}</span>
            </div>
            {loading ? <LoadingLine /> : groups.length ? (
              <div className="mt-3 divide-y divide-stone-200">
                {groups.map((group) => {
                  const groupEvents = events.filter((event) => event.group_id === group.id)
                  const people = groupEvents.reduce((total, event) => total + (attendeeCounts.get(event.id) ?? 0), 0)
                  return <article key={group.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-950 text-sm font-black text-white">{initials(group.name)}</span>
                    <div><h3 className="font-black text-stone-950">{group.name}</h3><p className="mt-1 text-xs font-bold text-stone-500">{group.location || 'Location not recorded'} · {groupEvents.length} events</p></div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-600">{people} met</span>
                  </article>
                })}
              </div>
            ) : <EmptyState title="No groups yet" text="Your first attendee upload will create one." />}
          </section>

          <section className="rounded-3xl border border-stone-300 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-stone-200 pb-4 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-600">Where you met</p>
                <h2 className="mt-2 text-2xl font-black text-stone-950">Recent events</h2>
              </div>
              <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)} className="form-input sm:max-w-xs" aria-label="Choose an event">
                <option value="">Latest people across all events</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.event_name} · {formatDate(event.event_date)}</option>)}
              </select>
            </div>

            {loading ? <LoadingLine /> : events.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {events.slice(0, 4).map((event) => <button key={event.id} onClick={() => setSelectedEventId(event.id)} className={`rounded-2xl border p-4 text-left transition ${selectedEventId === event.id ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-stone-50 hover:border-stone-400'}`}>
                  <p className="text-xs font-black uppercase tracking-wide text-red-600">{groupById.get(event.group_id)?.name ?? 'Networking group'}</p>
                  <h3 className="mt-2 font-black text-stone-950">{event.event_name}</h3>
                  <p className="mt-2 text-xs font-bold text-stone-500">{formatDate(event.event_date)} · {attendeeCounts.get(event.id) ?? 0} people</p>
                </button>)}
              </div>
            ) : <EmptyState title="No events remembered yet" text="Upload a PDF or add attendees by hand to begin." />}
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-stone-300 bg-white shadow-sm">
          <div className="flex items-end justify-between gap-4 border-b border-stone-200 p-5">
            <div><p className="text-xs font-black uppercase tracking-widest text-red-600">Names with context</p><h2 className="mt-2 text-2xl font-black text-stone-950">{selectedEventId ? eventById.get(selectedEventId)?.event_name : 'Recently added'}</h2></div>
            {selectedEventId ? <button onClick={() => setSelectedEventId('')} className="text-sm font-black text-stone-500 hover:text-red-600">Clear filter</button> : null}
          </div>
          {recentAttendees.length ? <div className="divide-y divide-stone-200">{recentAttendees.map((attendee) => {
            const event = eventById.get(attendee.event_id)
            const linkedContact = attendee.contact_id ? contactById.get(attendee.contact_id) : null
            const linkedCompany = attendee.company_id ? companyById.get(attendee.company_id) : null
            const linkedDeal = attendee.deal_id ? dealById.get(attendee.deal_id) : null
            return <article key={attendee.id} className="grid gap-3 p-5 md:grid-cols-[1.15fr_1fr_1fr_auto] md:items-center">
              <div><h3 className="font-black text-stone-950">{attendee.raw_name}</h3><p className="mt-1 text-sm text-stone-500">{attendee.raw_role || 'Role not recorded'}{attendee.raw_company ? ` · ${attendee.raw_company}` : ''}</p></div>
              <div><p className="text-xs font-black uppercase tracking-wide text-stone-400">Met at</p><p className="mt-1 text-sm font-bold">{event ? `${groupById.get(event.group_id)?.name ?? 'Group'} · ${formatDate(event.event_date)}` : 'Event'}</p></div>
              <div><p className="text-xs font-black uppercase tracking-wide text-stone-400">CRM connection</p><p className="mt-1 text-sm font-bold">{linkedDeal?.name || linkedContact && contactName(linkedContact) || linkedCompany?.company_name || 'Not linked yet'}</p></div>
              <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${linkedDeal ? 'bg-red-100 text-red-700' : linkedContact || linkedCompany ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}>{linkedDeal ? 'Opportunity' : linkedContact || linkedCompany ? 'CRM match' : 'Black book only'}</span>
            </article>
          })}</div> : <EmptyState title="No people to show" text="Choose another event or add a new attendee list." />}
        </section>
      </section>
    </main>
  )
}

function ImportEventPanel({ groups, companies, contacts, deals, onClose, onSaved }: { groups: NetworkingGroup[]; companies: Company[]; contacts: Contact[]; deals: Deal[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '__new__')
  const [newGroupName, setNewGroupName] = useState('')
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState(TODAY)
  const [venue, setVenue] = useState('')
  const [fileName, setFileName] = useState('')
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<NetworkingAttendeeDraft[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const contactNames = useMemo(() => new Map(contacts.map((contact) => [contact.id, normalise(contactName(contact))])), [contacts])

  async function handlePdf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setReading(true)
    setError('')
    setFileName(file.name)
    const body = new FormData()
    body.set('file', file)

    try {
      const response = await fetch('/api/networking/extract', { method: 'POST', body })
      const result = await response.json() as { text?: string; pageCount?: number; error?: string }
      if (!response.ok || !result.text) throw new Error(result.error || 'The PDF could not be read.')
      const parsed = parseAttendeeText(result.text)
      if (!parsed.length) throw new Error('Text was found, but no attendee rows were recognised. Add a row manually and copy the details across.')
      setDrafts(parsed.map((draft) => suggestMatches(draft, contacts, companies)))
      const detectedGroupName = parseNetworkingGroupName(result.text, file.name)
      if (detectedGroupName) {
        const matchingGroup = groups.find((group) => normalise(group.name) === normalise(detectedGroupName))
        setGroupId(matchingGroup?.id ?? '__new__')
        setNewGroupName(matchingGroup ? '' : detectedGroupName)
      }
      setPageCount(result.pageCount ?? null)
      if (!eventName) setEventName(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The PDF could not be read.')
    } finally {
      setReading(false)
      event.target.value = ''
    }
  }

  function updateDraft(draftId: string, field: keyof NetworkingAttendeeDraft, value: string) {
    setDrafts((current) => current.map((draft) => {
      if (draft.draftId !== draftId) return draft
      const updated = { ...draft, [field]: value }
      if (field === 'contactId') {
        const contact = contacts.find((item) => item.id === value)
        updated.companyId = contact?.company_id ?? updated.companyId
        if (updated.dealId && deals.find((deal) => deal.id === updated.dealId)?.company_id !== updated.companyId) updated.dealId = ''
      }
      if (field === 'companyId' && updated.dealId && deals.find((deal) => deal.id === updated.dealId)?.company_id !== value) updated.dealId = ''
      return updated
    }))
  }

  async function saveEvent() {
    setError('')
    const cleanEventName = eventName.trim()
    const usableDrafts = drafts.filter((draft) => draft.name.trim())
    if (!cleanEventName || !eventDate) { setError('Add the event name and date.'); return }
    if (groupId === '__new__' && !newGroupName.trim()) { setError('Name the networking group.'); return }
    if (!usableDrafts.length) { setError('Add at least one attendee.'); return }
    setSaving(true)

    try {
      let savedGroupId = groupId
      if (savedGroupId === '__new__') {
        const { data, error: groupError } = await supabase.from('networking_groups').insert({ name: newGroupName.trim() }).select('id').single()
        if (groupError) throw groupError
        savedGroupId = data.id
      }

      const { data: savedEvent, error: eventError } = await supabase.from('networking_events').insert({
        group_id: savedGroupId,
        event_name: cleanEventName,
        event_date: eventDate,
        venue: venue.trim() || null,
        source_file_name: fileName || null,
        source_page_count: pageCount,
      }).select('id').single()
      if (eventError) throw eventError

      const { error: attendeeError } = await supabase.from('networking_attendees').insert(usableDrafts.map((draft) => ({
        event_id: savedEvent.id,
        contact_id: draft.contactId || null,
        company_id: draft.companyId || null,
        deal_id: draft.dealId || null,
        raw_name: draft.name.trim(),
        raw_company: draft.company.trim() || null,
        raw_role: draft.role.trim() || null,
        raw_email: draft.email.trim().toLowerCase() || null,
        raw_phone: draft.phone.trim() || null,
        notes: [draft.website.trim() ? `Website: ${draft.website.trim()}` : '', draft.notes.trim()].filter(Boolean).join(' · ') || null,
        match_status: draft.contactId || draft.companyId || draft.dealId ? 'linked' : 'unmatched',
      })))
      if (attendeeError) throw attendeeError
      await onSaved()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The event could not be saved.')
      setSaving(false)
    }
  }

  return <section className="mt-8 overflow-hidden rounded-3xl border border-stone-700 bg-stone-950 text-white shadow-2xl">
    <div className="flex items-start justify-between gap-6 border-b border-stone-800 p-6"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-red-400">New memory</p><h2 className="mt-2 text-3xl font-black">Who was in the room?</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">Upload the list, check what was read, then choose any CRM and opportunity links before saving.</p></div><button onClick={onClose} className="rounded-xl border border-stone-700 px-3 py-2 text-sm font-black text-stone-300 hover:bg-stone-800">Close</button></div>
    <div className="grid gap-4 border-b border-stone-800 p-6 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-black uppercase tracking-wide text-stone-400">Group<select value={groupId} onChange={(event) => setGroupId(event.target.value)} className="form-input mt-2 normal-case"><option value="__new__">+ New networking group</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      {groupId === '__new__' ? <label className="text-xs font-black uppercase tracking-wide text-stone-400">New group name<input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} className="form-input mt-2 normal-case" placeholder="e.g. BNI Chester" /></label> : null}
      <label className="text-xs font-black uppercase tracking-wide text-stone-400">Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} className="form-input mt-2 normal-case" placeholder="August breakfast" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-stone-400">Date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="form-input mt-2 normal-case" /></label>
      <label className="text-xs font-black uppercase tracking-wide text-stone-400">Venue<input value={venue} onChange={(event) => setVenue(event.target.value)} className="form-input mt-2 normal-case" placeholder="Optional" /></label>
    </div>
    <div className="border-b border-stone-800 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center"><label className="cursor-pointer rounded-xl bg-red-600 px-5 py-3 text-center text-sm font-black hover:bg-red-500">{reading ? 'Reading PDF…' : 'Upload attendee PDF'}<input type="file" accept="application/pdf,.pdf" onChange={handlePdf} disabled={reading} className="sr-only" /></label><button onClick={() => setDrafts((current) => [...current, blankAttendeeDraft(current.length)])} className="rounded-xl border border-stone-600 px-5 py-3 text-sm font-black text-stone-200 hover:bg-stone-800">+ Add person manually</button>{fileName ? <p className="text-sm font-bold text-stone-400">{fileName}{pageCount ? ` · ${pageCount} pages` : ''}</p> : null}</div>
      {error ? <p className="mt-4 rounded-xl border border-red-900 bg-red-950/60 p-4 text-sm font-bold text-red-200">{error}</p> : null}
    </div>
    {drafts.length ? <div className="p-6"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wide text-red-400">Review before saving</p><h3 className="mt-1 text-xl font-black">{drafts.length} people found</h3></div><p className="hidden text-xs text-stone-500 md:block">PDF layouts vary. Correct anything that landed in the wrong box.</p></div><div className="space-y-3">{drafts.map((draft, index) => {
      const visibleDeals = draft.companyId ? deals.filter((deal) => deal.company_id === draft.companyId) : deals
      const suggested = Boolean(draft.contactId || draft.companyId)
      return <article key={draft.draftId} className="rounded-2xl border border-stone-700 bg-stone-900 p-4"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-black uppercase tracking-wide text-stone-500">Person {index + 1}{suggested ? <span className="ml-2 text-amber-400">Possible CRM match</span> : null}</p><button onClick={() => setDrafts((current) => current.filter((item) => item.draftId !== draft.draftId))} className="text-xs font-black text-stone-500 hover:text-red-400">Remove</button></div><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3"><input value={draft.name} onChange={(event) => updateDraft(draft.draftId, 'name', event.target.value)} className="form-input" placeholder="Full name" aria-label={`Person ${index + 1} full name`} /><input value={draft.company} onChange={(event) => updateDraft(draft.draftId, 'company', event.target.value)} className="form-input" placeholder="Company" aria-label={`Person ${index + 1} company`} /><input value={draft.email} onChange={(event) => updateDraft(draft.draftId, 'email', event.target.value)} className="form-input" placeholder="Email" aria-label={`Person ${index + 1} email`} /><input value={draft.website} onChange={(event) => updateDraft(draft.draftId, 'website', event.target.value)} className="form-input" placeholder="Website" aria-label={`Person ${index + 1} website`} /><input value={draft.role} onChange={(event) => updateDraft(draft.draftId, 'role', event.target.value)} className="form-input" placeholder="Role (optional)" aria-label={`Person ${index + 1} role`} /><input value={draft.phone} onChange={(event) => updateDraft(draft.draftId, 'phone', event.target.value)} className="form-input" placeholder="Phone (optional)" aria-label={`Person ${index + 1} phone`} /></div><div className="mt-3 grid gap-3 md:grid-cols-3"><select value={draft.contactId} onChange={(event) => updateDraft(draft.draftId, 'contactId', event.target.value)} className="form-input"><option value="">No existing contact link</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contactName(contact)}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select><select value={draft.companyId} onChange={(event) => updateDraft(draft.draftId, 'companyId', event.target.value)} className="form-input"><option value="">No existing company link</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.company_name}</option>)}</select><select value={draft.dealId} onChange={(event) => updateDraft(draft.draftId, 'dealId', event.target.value)} className="form-input"><option value="">No opportunity link</option>{visibleDeals.map((deal) => <option key={deal.id} value={deal.id}>{deal.name} · {deal.stage}</option>)}</select></div>{draft.contactId && contactNames.get(draft.contactId) !== normalise(draft.name) ? <p className="mt-2 text-xs font-bold text-amber-300">Check this contact link: the names are not an exact match.</p> : null}</article>
    })}</div><div className="mt-6 flex flex-col justify-end gap-3 sm:flex-row"><button onClick={onClose} className="rounded-xl px-5 py-3 text-sm font-black text-stone-400">Cancel</button><button onClick={() => void saveEvent()} disabled={saving} className="rounded-xl bg-red-600 px-6 py-3 text-sm font-black text-white hover:bg-red-500 disabled:opacity-50">{saving ? 'Saving the room…' : `Save event and ${drafts.filter((draft) => draft.name.trim()).length} people`}</button></div></div> : <div className="p-10 text-center"><p className="text-lg font-black">Start with the attendee list.</p><p className="mt-2 text-sm text-stone-500">You can also add people one at a time if there is no PDF.</p></div>}
  </section>
}

function suggestMatches(draft: NetworkingAttendeeDraft, contacts: Contact[], companies: Company[]) {
  const byEmail = draft.email ? contacts.find((contact) => contact.email?.toLowerCase() === draft.email.toLowerCase()) : null
  const byName = contacts.find((contact) => normalise(contactName(contact)) === normalise(draft.name))
  const contact = byEmail || byName
  const company = contact?.company_id
    ? companies.find((item) => item.id === contact.company_id)
    : companies.find((item) => normalise(item.company_name) === normalise(draft.company))
  return { ...draft, contactId: contact?.id ?? '', companyId: company?.id ?? '' }
}

function contactName(contact: Contact) { return [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || 'Unnamed contact' }
function normalise(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ') }
function initials(value: string) { return value.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'NB' }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`)) }
function Metric({ label, value, note, accent = false }: { label: string; value: number; note: string; accent?: boolean }) { return <div className={`rounded-2xl border p-5 shadow-sm ${accent ? 'border-red-300 bg-red-600 text-white' : 'border-stone-300 bg-white'}`}><p className={`text-xs font-black uppercase tracking-widest ${accent ? 'text-red-100' : 'text-stone-400'}`}>{label}</p><p className="mt-3 text-4xl font-black">{value}</p><p className={`mt-2 text-xs font-bold ${accent ? 'text-red-100' : 'text-stone-500'}`}>{note}</p></div> }
function LoadingLine() { return <p className="mt-4 rounded-2xl bg-stone-100 p-6 text-sm font-bold text-stone-400">Opening the black book…</p> }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="m-5 rounded-2xl border border-dashed border-stone-300 p-7 text-center"><p className="font-black text-stone-700">{title}</p><p className="mt-2 text-sm text-stone-500">{text}</p></div> }
function SetupCard() { return <section className="mb-6 rounded-3xl border border-amber-300 bg-amber-50 p-6"><p className="text-xs font-black uppercase tracking-widest text-amber-700">One-time setup</p><h2 className="mt-2 text-2xl font-black text-stone-950">Create the networking tables in Supabase.</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">Run <code className="rounded bg-white px-1.5 py-1 font-mono text-xs font-bold">docs/networking-black-book.sql</code> in the Supabase SQL editor, then refresh this page. The script protects the records with the same authenticated-user rules as the rest of the CRM.</p></section> }
