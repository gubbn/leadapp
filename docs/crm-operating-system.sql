alter table public.companies
  add column if not exists number_of_users integer
    check (number_of_users is null or number_of_users >= 0),
  add column if not exists current_it_provider text,
  add column if not exists provider_renewal_date date,
  add column if not exists lead_source text,
  add column if not exists account_notes text;

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 200),
  stage text not null default 'new'
    check (stage in (
      'new',
      'conversation',
      'discovery',
      'health_check',
      'report_sent',
      'solution_agreed',
      'proposal',
      'decision',
      'contract_sent',
      'won',
      'lost',
      'nurture'
    )),
  annual_value numeric(12,2)
    check (annual_value is null or annual_value >= 0),
  number_of_users integer
    check (number_of_users is null or number_of_users >= 0),
  service_interest text,
  source text,
  current_provider text,
  renewal_date date,
  expected_close_date date,
  probability integer not null default 10
    check (probability between 0 and 100),
  next_action text,
  next_action_due date,
  loss_reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 240),
  description text,
  due_date date,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete cascade,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tasks_completed_at_check check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed')
  )
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null
    check (activity_type in (
      'note',
      'call',
      'email',
      'meeting',
      'health_check',
      'proposal',
      'status_change'
    )),
  summary text not null check (char_length(trim(summary)) between 1 and 5000),
  outcome text,
  occurred_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.deals enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_activities enable row level security;

grant select, insert, update, delete on table public.deals to authenticated;
grant select, insert, update, delete on table public.crm_tasks to authenticated;
grant select, insert, update, delete on table public.crm_activities to authenticated;
grant select, insert, update, delete on table public.deals to service_role;
grant select, insert, update, delete on table public.crm_tasks to service_role;
grant select, insert, update, delete on table public.crm_activities to service_role;
revoke all on table public.deals from anon;
revoke all on table public.crm_tasks from anon;
revoke all on table public.crm_activities from anon;

create policy "Authenticated users can read deals"
on public.deals for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add deals"
on public.deals for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update deals"
on public.deals for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete deals"
on public.deals for delete to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can read CRM tasks"
on public.crm_tasks for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add CRM tasks"
on public.crm_tasks for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update CRM tasks"
on public.crm_tasks for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete CRM tasks"
on public.crm_tasks for delete to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can read CRM activities"
on public.crm_activities for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add CRM activities"
on public.crm_activities for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update CRM activities"
on public.crm_activities for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete CRM activities"
on public.crm_activities for delete to authenticated
using ((select auth.uid()) is not null);

create index deals_company_id_idx on public.deals(company_id);
create index deals_stage_idx on public.deals(stage);
create index deals_next_action_due_idx on public.deals(next_action_due);
create index deals_expected_close_date_idx on public.deals(expected_close_date);
create index crm_tasks_status_due_idx on public.crm_tasks(status, due_date);
create index crm_tasks_company_id_idx on public.crm_tasks(company_id);
create index crm_tasks_deal_id_idx on public.crm_tasks(deal_id);
create index crm_activities_company_occurred_idx
  on public.crm_activities(company_id, occurred_at desc);
create index crm_activities_deal_occurred_idx
  on public.crm_activities(deal_id, occurred_at desc);
