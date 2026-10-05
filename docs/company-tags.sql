-- Company tags used for CRM segmentation and campaign inclusion/exclusion.
-- Run once in the Supabase SQL editor before using company tags in the app.

begin;

alter table public.companies
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists companies_tags_gin_idx
  on public.companies using gin (tags);

comment on column public.companies.tags is
  'Normalised lowercase hashtags used for CRM segmentation and campaign filters.';

commit;
