-- Apply to an existing quotes table to enable manual follow-up tracking.
alter table public.quotes
  add column if not exists follow_up_sent_on date,
  add column if not exists last_chased_on date;
