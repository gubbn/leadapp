-- Campaign automation tracking tables/columns for Supabase.
-- Run this after reviewing existing policies and backups.

alter table campaign_companies
  add column if not exists sent_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists follow_up_due_at timestamptz,
  add column if not exists response_category text,
  add column if not exists automation_status text default 'manual',
  add column if not exists graph_message_id text,
  add column if not exists tracking_id text;

create table if not exists campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_company_id uuid references campaign_companies(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  event_type text not null,
  event_source text not null default 'app',
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_events_campaign_company_id_idx
  on campaign_events(campaign_company_id);

create index if not exists campaign_events_event_type_idx
  on campaign_events(event_type);

create unique index if not exists campaign_companies_tracking_id_idx
  on campaign_companies(tracking_id)
  where tracking_id is not null;
