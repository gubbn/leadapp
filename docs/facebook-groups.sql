-- Shared Facebook group tracking for the authenticated marketing dashboard.

create table if not exists public.facebook_groups (
  id uuid primary key default gen_random_uuid(),
  group_name text not null default '',
  last_posted date,
  last_script text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facebook_groups_name_length check (char_length(group_name) <= 300),
  constraint facebook_groups_script_length check (char_length(last_script) <= 20000)
);

create index if not exists facebook_groups_created_at_idx
  on public.facebook_groups (created_at, id);

alter table public.facebook_groups enable row level security;

revoke all on table public.facebook_groups from anon;
grant select, insert, update, delete on table public.facebook_groups to authenticated;

create policy "Authenticated users can read Facebook groups"
  on public.facebook_groups for select
  to authenticated
  using ((select auth.uid()) is not null);

create policy "Authenticated users can add Facebook groups"
  on public.facebook_groups for insert
  to authenticated
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can update Facebook groups"
  on public.facebook_groups for update
  to authenticated
  using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete Facebook groups"
  on public.facebook_groups for delete
  to authenticated
  using ((select auth.uid()) is not null);
