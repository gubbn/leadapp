create table if not exists public.marketing_playbook_state (
  state_key text primary key
    check (char_length(trim(state_key)) between 1 and 200),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_playbook_state_value_object
    check (jsonb_typeof(value) = 'object')
);

alter table public.marketing_playbook_state enable row level security;

grant select, insert, update, delete
  on table public.marketing_playbook_state to authenticated;
grant select, insert, update, delete
  on table public.marketing_playbook_state to service_role;
revoke all on table public.marketing_playbook_state from anon;

create policy "Authenticated users can read marketing playbook"
on public.marketing_playbook_state for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can add marketing playbook"
on public.marketing_playbook_state for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update marketing playbook"
on public.marketing_playbook_state for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete marketing playbook"
on public.marketing_playbook_state for delete
to authenticated
using ((select auth.uid()) is not null);

create index marketing_playbook_state_updated_at_idx
  on public.marketing_playbook_state(updated_at desc);
