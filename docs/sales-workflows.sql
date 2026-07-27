alter table public.companies
  add column if not exists customer_contract_start date,
  add column if not exists customer_contract_end date,
  add column if not exists account_health text
    check (account_health is null or account_health in ('healthy', 'watch', 'at_risk'));

create table if not exists public.it_health_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  status text not null default 'offered'
    check (status in (
      'offered',
      'booked',
      'completed',
      'report_drafting',
      'report_sent',
      'review_booked',
      'converted',
      'closed'
    )),
  scheduled_at timestamptz,
  completed_at timestamptz,
  review_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  backups_status text,
  endpoint_protection_status text,
  mfa_status text,
  microsoft_365_status text,
  device_updates_status text,
  continuity_status text,
  key_findings text,
  recommendations text,
  report_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  status text not null default 'draft'
    check (status in (
      'draft',
      'sent',
      'viewed',
      'negotiation',
      'accepted',
      'rejected',
      'expired'
    )),
  annual_value numeric(12,2) not null
    check (annual_value >= 0),
  contract_months integer not null default 36
    check (contract_months between 1 and 120),
  services text[] not null default '{}',
  issued_on date,
  decision_due date,
  document_url text,
  follow_up_2_on date,
  follow_up_7_on date,
  follow_up_14_on date,
  accepted_at timestamptz,
  lost_reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.it_health_checks enable row level security;
alter table public.proposals enable row level security;

grant select, insert, update, delete on table public.it_health_checks to authenticated;
grant select, insert, update, delete on table public.proposals to authenticated;
grant select, insert, update, delete on table public.it_health_checks to service_role;
grant select, insert, update, delete on table public.proposals to service_role;
revoke all on table public.it_health_checks from anon;
revoke all on table public.proposals from anon;

create policy "Authenticated users can read IT health checks"
on public.it_health_checks for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add IT health checks"
on public.it_health_checks for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update IT health checks"
on public.it_health_checks for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete IT health checks"
on public.it_health_checks for delete to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can read proposals"
on public.proposals for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add proposals"
on public.proposals for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update proposals"
on public.proposals for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete proposals"
on public.proposals for delete to authenticated
using ((select auth.uid()) is not null);

create index it_health_checks_company_idx on public.it_health_checks(company_id);
create index it_health_checks_deal_idx on public.it_health_checks(deal_id);
create index it_health_checks_status_schedule_idx
  on public.it_health_checks(status, scheduled_at);
create index proposals_company_idx on public.proposals(company_id);
create index proposals_deal_idx on public.proposals(deal_id);
create index proposals_status_decision_idx on public.proposals(status, decision_due);
