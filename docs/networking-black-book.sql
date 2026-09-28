-- Little Black Book: networking groups, events and the people met there.
-- Run once in the Supabase SQL editor, then refresh /networking.

begin;

create table if not exists public.networking_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  location text,
  website text,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists networking_groups_name_unique_idx
  on public.networking_groups (lower(trim(name)));

create table if not exists public.networking_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.networking_groups(id) on delete cascade,
  event_name text not null check (char_length(trim(event_name)) between 1 and 200),
  event_date date not null,
  venue text,
  source_file_name text,
  source_page_count integer check (source_page_count is null or source_page_count > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.networking_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.networking_events(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  raw_name text not null check (char_length(trim(raw_name)) between 1 and 200),
  raw_company text,
  raw_role text,
  raw_email text,
  raw_phone text,
  notes text,
  match_status text not null default 'unmatched'
    check (match_status in ('unmatched', 'linked', 'reviewed')),
  relationship_temperature text not null default 'new'
    check (relationship_temperature in ('new', 'warm', 'strong')),
  follow_up_action text,
  follow_up_due date,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists networking_attendees_event_identity_unique_idx
  on public.networking_attendees (
    event_id,
    lower(trim(coalesce(raw_email, ''))),
    lower(trim(raw_name)),
    lower(trim(coalesce(raw_company, '')))
  );

create index if not exists networking_events_group_date_idx
  on public.networking_events(group_id, event_date desc);
create index if not exists networking_attendees_event_idx
  on public.networking_attendees(event_id);
create index if not exists networking_attendees_contact_idx
  on public.networking_attendees(contact_id) where contact_id is not null;
create index if not exists networking_attendees_company_idx
  on public.networking_attendees(company_id) where company_id is not null;
create index if not exists networking_attendees_deal_idx
  on public.networking_attendees(deal_id) where deal_id is not null;
create index if not exists networking_attendees_follow_up_idx
  on public.networking_attendees(follow_up_due) where follow_up_due is not null;

alter table public.networking_groups enable row level security;
alter table public.networking_events enable row level security;
alter table public.networking_attendees enable row level security;

grant select, insert, update, delete on table public.networking_groups to authenticated;
grant select, insert, update, delete on table public.networking_events to authenticated;
grant select, insert, update, delete on table public.networking_attendees to authenticated;
grant select, insert, update, delete on table public.networking_groups to service_role;
grant select, insert, update, delete on table public.networking_events to service_role;
grant select, insert, update, delete on table public.networking_attendees to service_role;
revoke all on table public.networking_groups from anon;
revoke all on table public.networking_events from anon;
revoke all on table public.networking_attendees from anon;

create policy "Authenticated users can read networking groups"
on public.networking_groups for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add networking groups"
on public.networking_groups for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update networking groups"
on public.networking_groups for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete networking groups"
on public.networking_groups for delete to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can read networking events"
on public.networking_events for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add networking events"
on public.networking_events for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update networking events"
on public.networking_events for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete networking events"
on public.networking_events for delete to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can read networking attendees"
on public.networking_attendees for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add networking attendees"
on public.networking_attendees for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update networking attendees"
on public.networking_attendees for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete networking attendees"
on public.networking_attendees for delete to authenticated
using ((select auth.uid()) is not null);

commit;
