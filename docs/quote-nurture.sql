-- Apply after crm-enhancements.sql.
begin;

alter table public.quotes
  add column if not exists nurture_enabled boolean not null default false,
  add column if not exists nurture_steps jsonb not null default '{}'::jsonb,
  add column if not exists lost_at timestamptz;

create or replace function public.record_quote_loss()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status <> 'lost' then
    new.lost_at := null;
  elsif tg_op = 'INSERT' then
    new.lost_at := now();
  elsif old.status <> 'lost' then
    new.lost_at := now();
  else
    new.lost_at := old.lost_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.record_quote_loss() from public, anon, authenticated;

drop trigger if exists record_quote_loss on public.quotes;
create trigger record_quote_loss before insert or update on public.quotes
for each row execute function public.record_quote_loss();

create table if not exists public.quote_nurture_attempts (
  quote_id uuid not null references public.quotes(id) on delete cascade,
  step text not null check (step in ('lost', '1', '2', '3')),
  status text not null default 'sending' check (status in ('sending', 'accepted', 'failed')),
  attempted_at timestamptz not null default now(),
  primary key (quote_id, step)
);

alter table public.quote_nurture_attempts enable row level security;
revoke all on public.quote_nurture_attempts from anon, authenticated;
grant select on public.quote_nurture_attempts to authenticated;
grant select, insert, update on public.quote_nurture_attempts to service_role;
drop policy if exists "CRM staff can view nurture attempts" on public.quote_nurture_attempts;
create policy "CRM staff can view nurture attempts" on public.quote_nurture_attempts
  for select to authenticated using ((select auth.uid()) is not null);

create index if not exists quotes_nurture_enabled_idx on public.quotes(issued_on)
  where nurture_enabled;

create or replace function public.claim_quote_nurture()
returns table (quote_id uuid, step text, recipient text, subject text, body text)
language sql security invoker set search_path = '' as $$
  with eligible as (
    select q.id, s.step, btrim(c.email) as recipient,
      cfg.value->>'subject' as subject, cfg.value->>'body' as body,
      (now() at time zone 'Europe/London')::date as today,
      case when s.step = 'lost' then (q.lost_at at time zone 'Europe/London')::date
        else q.issued_on end as start_date,
      case when cfg.value->>'days' ~ '^[0-9]{1,3}$'
        then (cfg.value->>'days')::integer end as days
    from public.quotes q
    join public.companies co on co.id = q.company_id
    join public.contacts c on c.id = q.contact_id and c.company_id = q.company_id
    left join public.deals d on d.id = q.deal_id
    cross join (values ('lost', null), ('1', null), ('2', '1'), ('3', '2')) as s(step, previous)
    cross join lateral (select q.nurture_steps->s.step as value) cfg
    where q.nurture_enabled and not coalesce(co.dnc, false)
      and c.is_active and not coalesce(c.dnc, false)
      and btrim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and (
        (q.status = 'lost' and s.step = 'lost')
        or (q.status in ('issued', 'chased') and s.step <> 'lost'
          and (q.deal_id is null or d.stage not in ('won', 'lost', 'abandoned')))
      )
      and char_length(btrim(cfg.value->>'subject')) between 1 and 200
      and char_length(btrim(cfg.value->>'body')) between 1 and 10000
      and not exists (
        select 1 from public.quote_nurture_attempts a where a.quote_id = q.id and a.step = s.step
      )
      and (s.previous is null or exists (
        select 1 from public.quote_nurture_attempts a
        where a.quote_id = q.id and a.step = s.previous and a.status = 'accepted'
          and (a.attempted_at at time zone 'Europe/London')::date < (now() at time zone 'Europe/London')::date
      ))
  ), due as (
    select e.* from eligible e join public.quotes q on q.id = e.id
    where e.start_date + e.days <= e.today
    order by e.start_date + e.days, e.id limit 1
    for update of q skip locked
  ), claimed as (
    insert into public.quote_nurture_attempts (quote_id, step)
    select due.id, due.step from due
    on conflict do nothing
    returning quote_nurture_attempts.quote_id, quote_nurture_attempts.step
  )
  select due.id, due.step, due.recipient, due.subject, due.body
  from due join claimed on claimed.quote_id = due.id and claimed.step = due.step;
$$;

revoke execute on function public.claim_quote_nurture() from public, anon, authenticated;
grant execute on function public.claim_quote_nurture() to service_role;

commit;
