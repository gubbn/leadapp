-- Shared offer tracking for Supabase.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  description text,
  lead_source text not null check (char_length(trim(lead_source)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'ended')),
  starts_on date,
  ends_on date,
  is_limited boolean not null default false,
  total_available integer,
  claimed_count integer not null default 0 check (claimed_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_date_order
    check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint offers_inventory_valid check (
    (is_limited = false and total_available is null)
    or
    (
      is_limited = true
      and total_available is not null
      and total_available >= 0
      and claimed_count <= total_available
    )
  )
);

alter table public.offers enable row level security;

grant select, insert, update, delete on table public.offers to authenticated;
grant select, insert, update, delete on table public.offers to service_role;
revoke all on table public.offers from anon;

create policy "Authenticated users can read offers"
on public.offers for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can add offers"
on public.offers for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update offers"
on public.offers for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete offers"
on public.offers for delete
to authenticated
using ((select auth.uid()) is not null);

create index offers_status_idx on public.offers(status);
create index offers_lead_source_idx on public.offers(lead_source);
create index offers_created_at_idx on public.offers(created_at desc);

create table if not exists public.offer_claims (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  claimant_name text not null
    check (char_length(trim(claimant_name)) between 1 and 160),
  company_name text,
  email text,
  telephone text,
  lead_source text not null
    check (char_length(trim(lead_source)) between 1 and 120),
  claimed_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.offer_claims enable row level security;

grant select, insert, update, delete on table public.offer_claims to authenticated;
grant select, insert, update, delete on table public.offer_claims to service_role;
revoke all on table public.offer_claims from anon;

create policy "Authenticated users can read offer claims"
on public.offer_claims for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can add offer claims"
on public.offer_claims for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update offer claims"
on public.offer_claims for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete offer claims"
on public.offer_claims for delete
to authenticated
using ((select auth.uid()) is not null);

create index offer_claims_offer_id_idx on public.offer_claims(offer_id);
create index offer_claims_lead_source_idx on public.offer_claims(lead_source);
create index offer_claims_claimed_on_idx
  on public.offer_claims(claimed_on desc);

-- Keep offer inventory in sync with the individual claim records. If a
-- limited offer is full, its inventory constraint rolls the new claim back.
create or replace function public.sync_offer_claimed_count()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.offers
    set claimed_count = (
          select count(*)::integer
          from public.offer_claims
          where offer_id = old.offer_id
        ),
        updated_at = now()
    where id = old.offer_id;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.offer_id is distinct from new.offer_id then
    update public.offers
    set claimed_count = (
          select count(*)::integer
          from public.offer_claims
          where offer_id = old.offer_id
        ),
        updated_at = now()
    where id = old.offer_id;
  end if;

  update public.offers
  set claimed_count = (
        select count(*)::integer
        from public.offer_claims
        where offer_id = new.offer_id
      ),
      updated_at = now()
  where id = new.offer_id;
  return new;
end;
$$;

revoke all on function public.sync_offer_claimed_count()
  from public, anon, authenticated;
grant execute on function public.sync_offer_claimed_count() to service_role;

create trigger sync_offer_claimed_count_trigger
after insert or update of offer_id or delete on public.offer_claims
for each row execute function public.sync_offer_claimed_count();
