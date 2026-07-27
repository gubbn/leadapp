export type PlaybookMonth = {
  key: string
  label: string
  shortLabel: string
  theme: string
  objective: string
  target: string
  tasks: string[]
}

export const playbookMonths: PlaybookMonth[] = [
  {
    key: '2026-08',
    label: 'August 2026',
    shortLabel: 'Aug',
    theme: 'Build the engine',
    objective:
      'Create the foundations required to generate and measure demand.',
    target:
      '100 targets | landing page live | CRM ready | 2 case studies prepared',
    tasks: [
      'Create the first 100-account Nottinghamshire target list.',
      'Set CRM stages, next-action dates and lead-source fields.',
      'Create the IT Resilience Check landing page.',
      'Create the health-check PDF report template.',
      'Prepare two case studies from available material.',
      'Draft LinkedIn, email and follow-up message templates.',
      'Add 98% SLA and historic retention proof to sales material.',
      'Establish the Friday scoreboard and baseline numbers.',
    ],
  },
  {
    key: '2026-09',
    label: 'September 2026',
    shortLabel: 'Sep',
    theme: 'Are the basics covered?',
    objective:
      'Launch the IT Resilience Check through personal outreach and local relationships.',
    target:
      '60 first contacts | 4 checks | 5 partner conversations | 4 qualified opportunities',
    tasks: [
      'Make 15-20 personalised first contacts each week.',
      'Complete 15-20 prospect follow-ups each week.',
      'Publish an IT basics checklist.',
      'Publish a backup and recovery post.',
      'Attend one suitable Nottinghamshire networking event.',
      'Approach five referral partners.',
      'Complete at least four IT Resilience Checks.',
      'Record every renewal date or timing trigger discovered.',
    ],
  },
  {
    key: '2026-10',
    label: 'October 2026',
    shortLabel: 'Oct',
    theme: 'Human cybersecurity',
    objective:
      'Use Cybersecurity Awareness Month to make security practical, human and jargon-free.',
    target:
      '8 qualified opportunities | 6 checks | 3 proposals | 1 speaking opportunity',
    tasks: [
      'Publish a phishing-focused leadership post.',
      'Publish a practical MFA explainer.',
      'Create a one-page staff security checklist.',
      'Reference authoritative NCSC guidance.',
      'Invite target accounts to a security-focused Resilience Check.',
      'Offer one short partner or networking presentation.',
      'Complete at least six IT Resilience Checks.',
      'Revisit every September prospect with a dated next step.',
    ],
  },
  {
    key: '2026-11',
    label: 'November 2026',
    shortLabel: 'Nov',
    theme: 'Plan before it breaks',
    objective:
      'Reach leadership teams while they are setting priorities and budgets for 2027.',
    target:
      '8 qualified opportunities | 6 checks | 4 proposals | 5 partner conversations',
    tasks: [
      'Create a 2027 IT priorities worksheet.',
      'Publish a guide to hidden IT costs.',
      'Post about continuity and replacement planning.',
      'Contact finance and operations leaders in target accounts.',
      'Ask every active prospect about 2027 plans and renewal dates.',
      'Approach five more referral partners.',
      'Complete at least six IT Resilience Checks.',
      'Issue proposals only where need, fit, timing and authority are understood.',
    ],
  },
  {
    key: '2026-12',
    label: 'December 2026',
    shortLabel: 'Dec',
    theme: 'The quiet Christmas test',
    objective:
      'Create urgency around holiday resilience without using fear-based marketing.',
    target:
      '100% pipeline has next action | all proposals followed up | January diary seeded',
    tasks: [
      'Publish a holiday continuity checklist.',
      'Cover backup testing, alerts, access and emergency contacts.',
      'Send one useful December email to the database.',
      'Personally follow up every open proposal.',
      'Set January dates for prospects not ready to decide.',
      'Thank and reconnect with referral partners.',
      'Clean every open CRM record.',
      'Prepare January switching-provider content.',
    ],
  },
  {
    key: '2027-01',
    label: 'January 2027',
    shortLabel: 'Jan',
    theme: 'A simpler IT year',
    objective:
      'Convert nurtured demand and position switching as safe, planned and people-first.',
    target:
      '10 qualified opportunities | 6 checks | 5+ proposals | six-month review complete',
    tasks: [
      'Publish: How to switch IT provider without disruption.',
      'Publish a 90-day IT priorities guide.',
      'Recontact every qualified prospect from the six months.',
      'Offer the IT Resilience Check to January decision-makers.',
      'Run a local breakfast, webinar or partner session.',
      'Complete at least six health checks.',
      'Request decisions or firm next dates on all proposals.',
      'Complete the six-month review and next-quarter plan.',
    ],
  },
]

export const weeklyCommitments = [
  {
    key: 'research',
    label: 'Target research',
    commitment: 'Add 10-15 suitable organisations and two contacts per account.',
    time: '60 min',
  },
  {
    key: 'outreach',
    label: 'Personal outreach',
    commitment: 'Send 15-20 relevant, individually written first contacts.',
    time: '90 min',
  },
  {
    key: 'follow-up',
    label: 'Follow-up and CRM',
    commitment: 'Complete 15-20 follow-ups; update stage, timing and next action.',
    time: '60 min',
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    commitment: 'Publish twice and engage thoughtfully with target contacts.',
    time: '60 min',
  },
  {
    key: 'content',
    label: 'Content asset',
    commitment: 'Progress the monthly article, checklist, guide or case study.',
    time: '60 min',
  },
  {
    key: 'scoreboard',
    label: 'Friday scoreboard',
    commitment: 'Review metrics, stalled opportunities and next week’s priorities.',
    time: '30 min',
  },
]

export const scorecardFields = [
  { key: 'targets', label: 'Target accounts in CRM' },
  { key: 'contacts', label: 'First contacts' },
  { key: 'followUps', label: 'Follow-ups' },
  { key: 'conversations', label: 'Meaningful conversations' },
  { key: 'checks', label: 'Health checks completed' },
  { key: 'opportunities', label: 'Qualified opportunities' },
  { key: 'proposals', label: 'Proposals issued' },
  { key: 'wins', label: 'Signed clients' },
  { key: 'contractValue', label: 'Annual contract value (£)' },
]

export const strategicTargets = [
  { label: 'Signed clients', core: '5-8', stretch: '10-15' },
  { label: 'Named targets', core: '200', stretch: '300' },
  { label: 'Health checks', core: '24', stretch: '36' },
  { label: 'Qualified opportunities', core: '30', stretch: '50' },
  { label: 'Proposal conversion', core: '30%', stretch: '40%' },
]

export const brandGuardrails = [
  'Make every message useful before asking for a meeting.',
  'Use plain English and explain why a recommendation matters.',
  'Show people, service and outcomes - not generic pictures of servers.',
  'Never use fear, jargon or inflated security promises.',
  'Leave prospects feeling understood, reassured, confident and unpressured.',
]
