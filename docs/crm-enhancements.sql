-- CRM consolidation: resolved duplicate groups and quote/opportunity links.
-- Safe to run after crm-operating-system.sql and quotes.sql.

begin;

alter table public.deals
  add column if not exists abandoned_by text;
alter table public.deals drop constraint if exists deals_stage_check;
alter table public.deals
  add constraint deals_stage_check
  check (stage in ('new', 'conversation', 'discovery', 'proposal', 'decision', 'nurture', 'abandoned', 'lost', 'won'));
alter table public.deals drop constraint if exists deals_abandoned_by_check;
alter table public.deals
  add constraint deals_abandoned_by_check
  check (abandoned_by is null or abandoned_by in ('us', 'lead'));

alter table public.quotes
  add column if not exists deal_id uuid references public.deals(id) on delete set null;
create index if not exists quotes_deal_id_idx on public.quotes(deal_id);

create table if not exists public.company_duplicate_decisions (
  group_key text primary key check (char_length(trim(group_key)) between 1 and 500),
  decision text not null check (decision in ('keep_separate')),
  decided_by uuid references auth.users(id) on delete set null default auth.uid(),
  decided_at timestamptz not null default now()
);

alter table public.company_duplicate_decisions enable row level security;
revoke all on table public.company_duplicate_decisions from anon, authenticated;
grant select, insert, update, delete on table public.company_duplicate_decisions to authenticated;
grant select, insert, update, delete on table public.company_duplicate_decisions to service_role;

drop policy if exists "Authenticated users can read duplicate decisions" on public.company_duplicate_decisions;
create policy "Authenticated users can read duplicate decisions"
on public.company_duplicate_decisions for select to authenticated
using ((select auth.uid()) is not null);
drop policy if exists "Authenticated users can add duplicate decisions" on public.company_duplicate_decisions;
create policy "Authenticated users can add duplicate decisions"
on public.company_duplicate_decisions for insert to authenticated
with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated users can update duplicate decisions" on public.company_duplicate_decisions;
create policy "Authenticated users can update duplicate decisions"
on public.company_duplicate_decisions for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
drop policy if exists "Authenticated users can delete duplicate decisions" on public.company_duplicate_decisions;
create policy "Authenticated users can delete duplicate decisions"
on public.company_duplicate_decisions for delete to authenticated
using ((select auth.uid()) is not null);

commit;
