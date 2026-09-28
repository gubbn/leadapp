-- Warranty-expiry tracking imported from SharePoint CSV or Excel exports.

create table if not exists public.warranties (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  sharepoint_id text,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 200),
  product_name text not null check (char_length(trim(product_name)) between 1 and 240),
  warranty_type text,
  serial_number text,
  expiry_date date not null,
  owner_name text,
  owner_email text,
  notes text,
  action_status text not null default 'not_started'
    check (action_status in ('not_started', 'contacted', 'renewed', 'not_renewing')),
  source_file text,
  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.warranties enable row level security;

grant select, insert, update, delete on table public.warranties to authenticated;
grant select, insert, update, delete on table public.warranties to service_role;
revoke all on table public.warranties from anon;

create policy "Authenticated users can read warranties"
on public.warranties for select
to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can import warranties"
on public.warranties for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update warranties"
on public.warranties for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete warranties"
on public.warranties for delete
to authenticated
using ((select auth.uid()) is not null);

create index if not exists warranties_expiry_date_idx
  on public.warranties(expiry_date);
create index if not exists warranties_action_status_idx
  on public.warranties(action_status);
create index if not exists warranties_customer_name_idx
  on public.warranties(customer_name);
