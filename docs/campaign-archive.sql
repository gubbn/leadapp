-- Reversible campaign archiving for the Growth campaign history.

alter table public.campaigns
  add column if not exists archived_at timestamptz;

create index if not exists campaigns_archived_at_idx
  on public.campaigns (archived_at);
