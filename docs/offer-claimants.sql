-- Apply after offers.sql and crm-operating-system.sql.
begin;

alter table public.offer_claims
  add column if not exists company_id uuid references public.companies(id) on delete set null;
create index if not exists offer_claims_company_id_idx on public.offer_claims(company_id);

create or replace function public.record_offer_claim(
  p_claim_id uuid,
  p_offer_id uuid,
  p_company_id uuid,
  p_claimant_name text,
  p_company_name text,
  p_email text,
  p_telephone text,
  p_lead_source text,
  p_claimed_on date,
  p_notes text
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_offer public.offers%rowtype;
  v_company_id uuid := p_company_id;
  v_company_name text;
  v_candidate_ids uuid[];
  v_claimant_name text := btrim(p_claimant_name);
  v_first_name text;
  v_email text := nullif(lower(btrim(p_email)), '');
  v_telephone text := nullif(btrim(p_telephone), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to record an offer claim.' using errcode = '42501';
  end if;

  if nullif(v_claimant_name, '') is null or nullif(btrim(p_lead_source), '') is null or p_claimed_on is null then
    raise exception 'Claimant name, lead source and claimed date are required.';
  end if;

  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'The selected offer no longer exists.';
  end if;
  if exists (select 1 from public.offer_claims where id = p_claim_id and offer_id = p_offer_id) then
    return p_claim_id;
  end if;
  if v_offer.is_limited and v_offer.claimed_count >= v_offer.total_available then
    raise exception 'This offer has no availability remaining.';
  end if;

  if v_company_id is not null then
    select company_name into v_company_name from public.companies where id = v_company_id;
    if not found then
      raise exception 'The selected company no longer exists.';
    end if;
  else
    v_company_name := coalesce(nullif(btrim(p_company_name), ''), v_claimant_name);
    -- Serialise lead creation for a matching company name across offers.
    perform pg_advisory_xact_lock(hashtextextended('offer-claim-company:' || lower(v_company_name), 0));

    select array_agg(id) into v_candidate_ids
    from public.companies where lower(btrim(company_name)) = lower(v_company_name);
    if cardinality(v_candidate_ids) > 1 then
      raise exception 'More than one company matches this name. Select the existing company to link the claim.';
    end if;
    v_company_id := v_candidate_ids[1];

    if v_company_id is null then
      insert into public.companies (company_name, size_band, lead_source, prospecting_status)
      values (v_company_name, 'unknown', btrim(p_lead_source), 'research')
      returning id into v_company_id;
    else
      select company_name into v_company_name from public.companies where id = v_company_id;
    end if;

    if v_email is not null and exists (
      select 1 from public.contacts where lower(btrim(email)) = v_email and company_id is distinct from v_company_id
    ) then
      raise exception 'This email belongs to a contact at another company. Check the claimant details or link the existing company.';
    end if;

    v_first_name := (regexp_match(v_claimant_name, '^\S+'))[1];
    if not exists (
      select 1 from public.contacts
      where company_id = v_company_id
        and (
          (v_email is not null and lower(btrim(email)) = v_email)
          or (v_email is null and v_telephone is not null and telephone = v_telephone
            and lower(concat_ws(' ', first_name, last_name)) = lower(v_claimant_name))
        )
    ) then
      insert into public.contacts (company_id, first_name, last_name, email, telephone)
      values (v_company_id, v_first_name, nullif(ltrim(substr(v_claimant_name, length(v_first_name) + 1), E' \t\n\r'), ''), v_email, v_telephone);
    end if;
  end if;

  insert into public.offer_claims (
    id, offer_id, company_id, claimant_name, company_name, email, telephone, lead_source, claimed_on, notes
  ) values (
    p_claim_id, p_offer_id, v_company_id, v_claimant_name, v_company_name, v_email,
    v_telephone, btrim(p_lead_source), p_claimed_on, nullif(btrim(p_notes), '')
  );
  return p_claim_id;
end;
$$;

revoke all on function public.record_offer_claim(uuid, uuid, uuid, text, text, text, text, text, date, text)
  from public, anon;
grant execute on function public.record_offer_claim(uuid, uuid, uuid, text, text, text, text, text, date, text)
  to authenticated;

commit;
