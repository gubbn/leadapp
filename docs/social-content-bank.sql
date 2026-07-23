create table if not exists public.social_content_bank (
  id uuid primary key default gen_random_uuid(),
  title text,
  source text not null check (
    source in (
      'support_ticket',
      'site_visit',
      'repeated_question',
      'team_chat',
      'renewal_review',
      'client_onboarding',
      'industry_news',
      'team_moment'
    )
  ),
  contact_permission text not null default 'not_asked'
    check (contact_permission in ('yes', 'no', 'not_asked')),
  contact_name text,
  what_happened text not null
    check (char_length(trim(what_happened)) between 1 and 10000),
  pillar text
    check (pillar is null or pillar in ('save', 'explainer', 'local_face', 'proof')),
  status text not null default 'idea'
    check (status in ('idea', 'review', 'ready', 'used')),
  captured_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_content_bank_contact_name
    check (contact_permission = 'yes' or contact_name is null)
);

alter table public.social_content_bank enable row level security;

grant select, insert, update, delete
  on table public.social_content_bank to authenticated;
grant select, insert, update, delete
  on table public.social_content_bank to service_role;
revoke all on table public.social_content_bank from anon;

create policy "Authenticated users can read social content bank"
on public.social_content_bank for select to authenticated
using ((select auth.uid()) is not null);

create policy "Authenticated users can add social content bank"
on public.social_content_bank for insert to authenticated
with check ((select auth.uid()) is not null);

create policy "Authenticated users can update social content bank"
on public.social_content_bank for update to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "Authenticated users can delete social content bank"
on public.social_content_bank for delete to authenticated
using ((select auth.uid()) is not null);

create index social_content_bank_status_idx
  on public.social_content_bank(status);
create index social_content_bank_source_idx
  on public.social_content_bank(source);
create index social_content_bank_pillar_idx
  on public.social_content_bank(pillar);
create index social_content_bank_created_at_idx
  on public.social_content_bank(created_at desc);
