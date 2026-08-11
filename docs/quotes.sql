create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  quote_number text not null unique check (char_length(trim(quote_number)) between 1 and 100),
  one_off_value numeric(12,2) not null default 0 check (one_off_value >= 0),
  subscription_value numeric(12,2) not null default 0 check (subscription_value >= 0),
  issued_on date not null default current_date,
  chase_due_date date not null,
  status text not null default 'issued'
    check (status in ('issued', 'chased', 'won', 'lost', 'withdrawn')),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.quotes enable row level security;

grant select, insert, update, delete on table public.quotes to authenticated;
grant select, insert, update, delete on table public.quotes to service_role;
revoke all on table public.quotes from anon;

create policy "Authenticated users can read quotes"
on public.quotes for select to authenticated
using ((select auth.uid()) is not null);
create policy "Authenticated users can add quotes"
on public.quotes for insert to authenticated
with check ((select auth.uid()) is not null);
create policy "Authenticated users can update quotes"
on public.quotes for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);
create policy "Authenticated users can delete quotes"
on public.quotes for delete to authenticated
using ((select auth.uid()) is not null);

create index quotes_chase_due_date_idx on public.quotes(chase_due_date)
  where status in ('issued', 'chased');
create index quotes_company_id_idx on public.quotes(company_id);
create index quotes_contact_id_idx on public.quotes(contact_id);
