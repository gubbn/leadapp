-- Run once in the Compass project's Supabase SQL Editor.
-- Qualification and tags are company-level fields shared by linked contacts.
begin;

with qualified as (
  update public.companies
  set prospecting_status = 'qualified',
      prospecting_updated_at = now()
  where tags @> array['#screenpop']::text[]
    and prospecting_status is distinct from 'qualified'
  returning id
)
select count(*) as companies_updated from qualified;

select
  count(*) as screenpop_companies,
  count(*) filter (where prospecting_status = 'qualified') as qualified_companies,
  count(*) filter (where prospecting_status is distinct from 'qualified') as remaining_unqualified
from public.companies
where tags @> array['#screenpop']::text[];

commit;
