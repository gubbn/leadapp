'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import AppHeader from '@/app/components/AppHeader'

type GuideSection = {
  id: string
  title: string
  summary: string
  keywords: string
  content: ReactNode
}

const sections: GuideSection[] = [
  {
    id: 'overview',
    title: '1. CRM overview',
    summary: 'What the Fixing IT CRM is designed to achieve.',
    keywords: 'overview purpose mission pipeline leads marketing sales',
    content: (
      <>
        <p>
          The CRM is the working system for turning local organisations into long-term Fixing IT
          clients. It combines lead data, relationship history, marketing activity, opportunities
          and the six-month marketing playbook.
        </p>
        <GuideList items={[
          'Companies are the main account records. Contacts, tasks, activities, campaigns and opportunities connect to them.',
          'Every active prospect should have a known status and a specific next action.',
          'The preferred customer is an organisation with 15 or more users in Nottinghamshire, Lincolnshire, Yorkshire or Derbyshire.',
          'The primary commercial focus is managed IT support, supported by cybersecurity, Microsoft 365, digital strategy and projects.',
          'The introductory offer is the free 30-minute IT Resilience Check with a PDF report.',
        ]} />
        <Note>Keep the system human: record useful context, agreed timing and the person involved—not just a generic sales status.</Note>
      </>
    ),
  },
  {
    id: 'daily',
    title: '2. The Today workspace',
    summary: 'Your starting point every working day.',
    keywords: 'today dashboard tasks overdue stalled activity daily',
    content: (
      <>
        <p>Open <LinkText href="/">Today</LinkText> first. It brings together the work that needs attention now.</p>
        <GuideList items={[
          'Due now shows open tasks due today, overdue tasks and tasks with no date.',
          'Overdue identifies commitments that should be resolved or rescheduled immediately.',
          'Open pipeline and weighted forecast show current opportunity value.',
          'Stalled opportunities highlights deals without a clear next action, due date or recent movement.',
          'Recent Activity confirms what has happened across calls, emails, meetings, proposals and company updates.',
          'The Prospecting Queue banner shows companies still needing research and those already qualified.',
        ]} />
        <Workflow steps={['Complete or reschedule overdue tasks', 'Work today’s calls and emails', 'Review stalled deals', 'Research prospects', 'Log outcomes and next actions']} />
      </>
    ),
  },
  {
    id: 'lead-entry',
    title: '3. Adding and importing leads',
    summary: 'How new records enter the CRM.',
    keywords: 'add lead import spreadsheet csv upload leads',
    content: (
      <>
        <h3>Manual entry</h3>
        <p>Use <LinkText href="/add">Add lead</LinkText> for one-off leads from networking, referrals, events or direct enquiries.</p>
        <h3>Spreadsheet import</h3>
        <p>Use <LinkText href="/import">Import leads</LinkText> for lists. Imported rows enter a staging area before they become live companies and contacts.</p>
        <GuideList items={[
          'Do not import the same file repeatedly unless the previous batch has been reviewed.',
          'Include company name, contact name, email, telephone, industry, location, size and domain whenever available.',
          'Imported data is not campaign-ready until Cleanup has been completed and the row approved.',
          'Use DNC fields whenever a record must not receive outreach.',
        ]} />
      </>
    ),
  },
  {
    id: 'cleanup',
    title: '4. Cleanup and approval',
    summary: 'Convert imported rows into reliable CRM records.',
    keywords: 'cleanup approval duplicate email contact search missing validation import',
    content: (
      <>
        <p><LinkText href="/cleanup">Data Cleanup</LinkText> is the quality-control gate between an import and the live CRM.</p>
        <Workflow steps={['Review flagged fields', 'Fix company and contact details', 'Check duplicates and existing matches', 'Submit for approval', 'Approve into CRM']} />
        <GuideList items={[
          'Name cleanup means the contact name is missing or cannot be split reliably.',
          'Email cleanup means the address is malformed or requires review.',
          'DNC review must be resolved before approval.',
          'Existing company and existing contact indicators prevent accidental duplicate creation.',
          'Contact Search opens Google. With a known name it searches “Company, Contact email address”; without a name it searches for a company manager.',
          'Bulk duplicate removal keeps the first usable row and removes repeated import records.',
        ]} />
        <Note>Approval creates or matches the company first, then creates only the contacts that do not already exist.</Note>
      </>
    ),
  },
  {
    id: 'companies',
    title: '5. Companies and contacts',
    summary: 'Maintain the account record and relationship history.',
    keywords: 'companies contacts edit filters location website domain activity details dnc',
    content: (
      <>
        <p><LinkText href="/companies">Companies</LinkText> is the master account list. Search and filter by relationship, DNC, industry and location, including Unknown.</p>
        <GuideList items={[
          'Open a company to see contacts, campaign history, opportunities, tasks and the activity timeline.',
          'Use “Add contact” on an open company record to create a linked decision-maker. The addition is recorded in recent activity.',
          'Add Lead checks a contact email against existing contacts before saving it to the standard contact email field.',
          'Use Edit on the company list or Edit details on the company record to update core information.',
          'Enable “Add to recent activity” when an edit is meaningful. The CRM records the old and new values.',
          'One-click research links open the website, Google, Maps, Companies House and focused address or telephone searches.',
          'Company names, addresses and village, town or city information are maintained in Companies—not Location Categories.',
          'Location Categories lists each known village, town or city once and provides the full UK county and administrative-area list.',
          'Assigning a county to a location updates every company sharing that village, town or city. This avoids categorising the same place repeatedly.',
          'Contacts should contain the real decision-maker name, role, email and telephone where possible.',
        ]} />
        <h3>Automatic website rule</h3>
        <p>
          If a company website is blank and a linked contact has a business email, the email domain
          becomes the website. For example, <code>hello@test.com</code> fills <code>test.com</code>.
          Personal providers such as Gmail, Outlook and Yahoo are ignored, and an existing website is never overwritten.
        </p>
        <h3>County reporting workflow</h3>
        <p>
          Open <LinkText href="/location-research">Location Categories</LinkText>, work through
          “Unclassified only”, then check County Coverage in Reports. Nottinghamshire, Derbyshire
          and Lincolnshire remain separate; North, South, West and East Riding variants are combined
          into Yorkshire in the report.
        </p>
      </>
    ),
  },
  {
    id: 'prospecting',
    title: '6. Prospecting and qualification',
    summary: 'Turn clean company records into actionable prospects.',
    keywords: 'prospecting research qualified nurture disqualified enrichment decision maker next action',
    content: (
      <>
        <p>Use the <LinkText href="/prospecting">Prospecting Queue</LinkText> as the daily research and qualification workspace.</p>
        <StatusTable />
        <h3>Minimum qualification evidence</h3>
        <GuideList items={[
          'A suitable organisation, normally with at least 15 users.',
          'A named decision-maker or credible route to one.',
          'A valid business email or telephone number.',
          'Location within the preferred operating area, unless there is a strong strategic reason.',
          'Known provider or renewal timing where it can be discovered.',
          'No evidence of consistently poor online reviews.',
          'A recorded next action with a due date.',
        ]} />
        <h3>Available actions</h3>
        <GuideList items={[
          'Enrich records user count, current provider, renewal date, lead source and research notes.',
          'Add Contact creates a linked decision-maker. A business email may also populate a missing company website.',
          'Task creates the next call, email, LinkedIn action or networking follow-up.',
          'Campaign adds a named contact to an existing campaign.',
          'Opportunity creates a new deal in the Sales pipeline.',
        ]} />
      </>
    ),
  },
  {
    id: 'sales',
    title: '7. Sales pipeline',
    summary: 'Move qualified interest toward a 36-month contract.',
    keywords: 'sales deal pipeline opportunity stages health check proposal contract won lost nurture',
    content: (
      <>
        <p><LinkText href="/sales">Deal Pipeline</LinkText> is for genuine commercial opportunities, not every company in the database.</p>
        <Workflow steps={['New', 'Conversation', 'Discovery', 'Health check', 'Report sent', 'Solution agreed', 'Proposal', 'Decision', 'Contract sent', 'Won']} />
        <GuideList items={[
          'Create an opportunity only when there is enough fit or engagement to justify active sales work.',
          'Record annual value, users, source, current provider, renewal date, next action and next-action due date.',
          'Every open opportunity must have a concrete next action. “Follow up” is too vague; state what will be discussed and with whom.',
          'Use Nurture when the organisation is suitable but timing is not active.',
          'When marking Lost, record the real loss reason so future marketing can improve.',
        ]} />
        <h3>IT Resilience Check</h3>
        <p>The free 30-minute check covers IT basics, backups and antivirus and produces a PDF report. Use it to create value and evidence before proposing managed support.</p>
        <h3>Proposal workflow</h3>
        <p>Record annual value, 36-month term, services, issue date, decision date and document link. The CRM creates structured follow-up dates after issue.</p>
      </>
    ),
  },
  {
    id: 'marketing',
    title: '8. Campaigns and outreach',
    summary: 'Build targeted lists and measure campaign outcomes.',
    keywords: 'marketing campaigns builder history email tracking automation offers outreach',
    content: (
      <>
        <GuideList items={[
          'Campaign Home shows current marketing activity.',
          'Campaign Builder filters companies and contacts by size, sector, timing, email quality and relationship status.',
          '“Last campaign” filters by the most recent saved campaign containing that company. Use 30+, 60+, 90+ or 180+ days to control mailing frequency, or “Never included” to find untouched companies.',
          '“Last contacted” and “Last campaign” are separate: the first includes wider relationship activity, while the second only measures saved marketing campaigns.',
          'Exclude customers, quoted companies, DNC records and invalid emails unless there is an explicit reason not to.',
          'Save a campaign before exporting or sending so its audience and outcomes are recorded.',
          'Campaign History shows previous sends and allows outcomes to be reviewed.',
          'Open and click tracking update campaign activity when configured.',
          'Automation contains Microsoft 365 sending and tracking configuration.',
          'Offers records lead magnets or introductory offers and the people who claim them.',
        ]} />
        <Note>A campaign list is not a substitute for qualification. Target a specific problem, role, sector or timing signal.</Note>
      </>
    ),
  },
  {
    id: 'content',
    title: '9. Social content workflow',
    summary: 'Turn real client-facing knowledge into regular content.',
    keywords: 'social content bank planner facebook linkedin posts blog newsletter',
    content: (
      <>
        <Workflow steps={['Capture a useful story', 'Choose a content pillar', 'Draft the post', 'Review permission and accuracy', 'Schedule or publish', 'Mark used']} />
        <GuideList items={[
          'Content Bank captures support lessons, site visits, common questions, industry news and team moments.',
          'The Social Planner links back to the Content Bank: review saved ideas first, then move the strongest material into the appropriate weekday notes.',
          'Never identify a client without permission. Anonymise examples when consent has not been obtained.',
          'Social Planner uses a fixed five-day rhythm: Make It Happen Monday, Testimonial Tuesday, What’s Happening Wednesday, Cyber Threat Thursday and Fixing IT Friday.',
          'Monday covers the work driving the week; Tuesday uses customer proof; Wednesday draws from tickets, FAQs, business news or company updates; Thursday is cyber news and advice; Friday recaps the week.',
          'Facebook Groups tracks local groups, the last posting date and the script used.',
          'Reuse one strong idea across LinkedIn, a newsletter and a blog rather than inventing three unrelated topics.',
          'Keep the Fixing IT tone personal, practical, reassuring and free of unnecessary jargon.',
        ]} />
      </>
    ),
  },
  {
    id: 'playbook',
    title: '10. Marketing playbook and reporting',
    summary: 'Hold the six-month growth plan accountable.',
    keywords: 'playbook strategy monthly weekly scorecard reports kpi targets',
    content: (
      <>
        <p>The <LinkText href="/playbook">Marketing Playbook</LinkText> contains the six-month strategy, monthly actions, weekly rhythm and scorecard.</p>
        <GuideList items={[
          'Complete weekly actions rather than treating the Playbook as reference material only.',
          'Record monthly leads, qualified opportunities, meetings, proposals, wins and revenue.',
          'Target accounts, qualified opportunities and signed clients are filled automatically from the current live company records. These Live CRM fields are read-only snapshots rather than manually entered monthly figures.',
          'The Named targets card shows the current total number of companies in the CRM automatically.',
          'Use Reports to review funnel movement and marketing performance.',
          'The This Week report runs Monday to Sunday and automatically counts companies, contacts, qualification changes, opportunities, campaign targets, completed tasks, logged activities, completed health checks, issued proposals and wins.',
          'Weekly figures depend on dates recorded in the CRM. Complete tasks rather than deleting them, issue proposals through the proposal workflow, and log calls, emails and meetings so the report reflects the work completed.',
          'Investigate weak stages: poor lead quality, slow follow-up, weak meeting conversion or proposals without decisions.',
          'The six-month objective is 10–15 signed clients and sufficient revenue capacity to fund accounts and marketing support.',
        ]} />
      </>
    ),
  },
  {
    id: 'routines',
    title: '11. Operating routines',
    summary: 'The repeatable daily, weekly and monthly process.',
    keywords: 'routine daily weekly monthly checklist accountability',
    content: (
      <>
        <Routine title="Daily — 20 to 45 minutes" items={[
          'Open Today and clear overdue actions.',
          'Complete due calls and emails, then log the outcome.',
          'Research at least one company in the Prospecting Queue.',
          'Ensure every conversation creates a dated next action.',
        ]} />
        <Routine title="Weekly — approximately 5 hours" items={[
          'Qualify and enrich a focused batch of prospects.',
          'Create and send one targeted campaign or nurture activity.',
          'Publish three social posts from the Content Bank.',
          'Prepare or publish one blog/newsletter theme.',
          'Review stalled deals, proposals and upcoming renewal dates.',
          'Update the Playbook checklist.',
        ]} />
        <Routine title="Monthly" items={[
          'Update the Playbook scorecard and Reports.',
          'Compare leads, meetings, proposals, wins and revenue against target.',
          'Review campaign response and unsubscribe/bounce quality.',
          'Choose the next month’s sector, message and introductory offer.',
          'Remove or nurture records that no longer justify active attention.',
        ]} />
      </>
    ),
  },
  {
    id: 'rules',
    title: '12. CRM rules and troubleshooting',
    summary: 'Standards that keep the system useful.',
    keywords: 'rules troubleshooting duplicates errors save rls login dnc quality',
    content: (
      <>
        <h3>Non-negotiable rules</h3>
        <GuideList items={[
          'No active prospect without a next action and due date.',
          'Do not create duplicate companies when an existing match is available.',
          'Do not send outreach to DNC records.',
          'Do not guess personal details; record the source or uncertainty in research notes.',
          'Do not mark a company Qualified solely because an email address exists.',
          'Record meaningful relationship changes in Recent Activity.',
        ]} />
        <h3>Common problems</h3>
        <Trouble problem="A save appears to do nothing" answer="Refresh the record and check for an error banner. The signed-in user must have permission to select and update the row." />
        <Trouble problem="A company is missing from a campaign" answer="Check DNC, email validity, customer/quoted exclusions and the current Campaign Builder filters." />
        <Trouble problem="A contact has no website link" answer="Confirm the email uses a business domain and the contact is linked to the correct company. Personal email providers are intentionally ignored." />
        <Trouble problem="The queue feels too large" answer="Work a defined sector or location batch, qualify quickly and move unsuitable records to Disqualified or Nurture." />
        <Trouble problem="The pipeline looks healthy but nothing closes" answer="Review next actions, renewal timing, proposal decision dates and stalled opportunities. Pipeline value without scheduled decisions is not a forecast." />
      </>
    ),
  },
]

export default function KnowledgeBasePage() {
  const [search, setSearch] = useState('')
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return sections
    return sections.filter((section) =>
      `${section.title} ${section.summary} ${section.keywords}`.toLowerCase().includes(term),
    )
  }, [search])

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <AppHeader />
      <section className="border-b border-stone-200 bg-gradient-to-br from-stone-950 via-stone-900 to-red-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Fixing IT operating manual</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">CRM Knowledge Base</h1>
          <p className="mt-4 max-w-3xl leading-7 text-stone-300">
            The complete guide to managing data, prospecting, marketing activity and sales
            opportunities—from first import to signed client.
          </p>
          <label className="mt-7 block max-w-2xl">
            <span className="sr-only">Search the knowledge base</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search workflows, campaigns, cleanup, pipeline…"
              className="w-full rounded-2xl border border-white/20 bg-white px-4 py-3 text-stone-950 shadow-xl outline-none focus:border-red-300 focus:ring-4 focus:ring-red-500/20"
            />
          </label>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <p className="px-2 text-xs font-black uppercase tracking-[0.18em] text-red-600">In this guide</p>
            <nav className="mt-3 space-y-1" aria-label="Knowledge base sections">
              {visible.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="block rounded-xl px-3 py-2 text-sm font-bold text-stone-600 hover:bg-red-50 hover:text-red-700">
                  {section.title}
                </a>
              ))}
            </nav>
            <div className="mt-4 border-t border-stone-100 pt-4">
              <Link href="/playbook" className="block rounded-xl bg-stone-950 px-3 py-2.5 text-center text-sm font-black text-white">
                Open marketing playbook
              </Link>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {!visible.length ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
              <p className="font-black text-stone-800">No guide sections match “{search}”.</p>
              <button type="button" onClick={() => setSearch('')} className="mt-3 text-sm font-bold text-red-600">Clear search</button>
            </div>
          ) : null}
          {visible.map((section) => (
            <article id={section.id} key={section.id} className="scroll-mt-28 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Knowledge Base</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">{section.title}</h2>
              <p className="mt-2 text-base font-semibold text-stone-500">{section.summary}</p>
              <div className="prose-guide mt-6 space-y-4 text-sm leading-7 text-stone-700">{section.content}</div>
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}

function GuideList({ items }: { items: string[] }) {
  return <ul className="space-y-2">{items.map((item) => <li key={item} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" /><span>{item}</span></li>)}</ul>
}
function Workflow({ steps }: { steps: string[] }) {
  return <ol className="grid gap-2 md:grid-cols-2">{steps.map((step, index) => <li key={step} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">{index + 1}</span><span className="font-bold text-stone-800">{step}</span></li>)}</ol>
}
function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4 font-semibold text-amber-950">{children}</div>
}
function LinkText({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="font-black text-red-600 hover:underline">{children}</Link>
}
function Routine({ title, items }: { title: string; items: string[] }) {
  return <section className="rounded-2xl border border-stone-200 p-5"><h3 className="font-black text-stone-950">{title}</h3><div className="mt-3"><GuideList items={items} /></div></section>
}
function Trouble({ problem, answer }: { problem: string; answer: string }) {
  return <div className="rounded-xl bg-stone-50 p-4"><p className="font-black text-stone-900">{problem}</p><p className="mt-1 text-stone-600">{answer}</p></div>
}
function StatusTable() {
  const rows = [
    ['Research incomplete', 'More evidence is needed before deciding fit or timing.'],
    ['Qualified', 'Fits the ideal profile and has a credible next step.'],
    ['Nurture', 'Suitable organisation, but the timing is not currently active.'],
    ['Disqualified', 'Too small, unsuitable, poor reputation, DNC or otherwise not worth pursuing.'],
  ]
  return <div className="overflow-hidden rounded-xl border border-stone-200">{rows.map(([status, meaning]) => <div key={status} className="grid border-t border-stone-100 first:border-0 sm:grid-cols-[12rem_1fr]"><div className="bg-stone-50 px-4 py-3 font-black text-stone-900">{status}</div><div className="px-4 py-3">{meaning}</div></div>)}</div>
}
