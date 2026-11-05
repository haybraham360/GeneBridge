-- Task 10: any inherited condition, several findings per screening report.
--
-- A report (one reference code) now holds one row per screened condition:
-- a change found (carrier / affected), nothing found (no_variant), or a
-- flagged finding. Everything else stays as before:
--   - each person still owns only their own rows (RLS unchanged);
--   - flagged findings are never explained (guardrail 4);
--   - couples see only conditions they share, and only once both agreed;
--     every other result stays private, even from each other.

-- ---------------------------------------------------------------------------
-- One row per condition on a report
-- ---------------------------------------------------------------------------
alter table public.screening_results drop constraint if exists screening_results_reference_code_key;
alter table public.screening_results
  add constraint screening_results_report_condition_key unique (reference_code, condition_code);
create index if not exists screening_results_reference_idx on public.screening_results (reference_code);

-- Claims every finding on the report. Same answers as before: 'claimed',
-- 'not_found' (wrong code, or someone else's) or 'rate_limited'.
create or replace function public.claim_screening_result(code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  claimed integer;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if (
    select count(*) from public.result_claim_attempts
    where user_id = caller and attempted_at > now() - interval '1 hour'
  ) >= 10 then
    return 'rate_limited';
  end if;

  -- A report already claimed by someone else stays theirs: all or nothing.
  if exists (
    select 1 from public.screening_results
     where reference_code = upper(btrim(code)) and owner_id is not null and owner_id <> caller
  ) then
    insert into public.result_claim_attempts (user_id) values (caller);
    return 'not_found';
  end if;

  update public.screening_results
     set owner_id = caller, claimed_at = now()
   where reference_code = upper(btrim(code))
     and owner_id is null;
  get diagnostics claimed = row_count;

  if claimed = 0 then
    -- Already claimed by the caller counts as success (e.g. a double click).
    if exists (
      select 1 from public.screening_results
      where reference_code = upper(btrim(code)) and owner_id = caller
    ) then
      return 'claimed';
    end if;
    insert into public.result_claim_attempts (user_id) values (caller);
    return 'not_found';
  end if;

  return 'claimed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Couples: shared conditions only
-- ---------------------------------------------------------------------------
-- One row per condition where BOTH partners carry a change, once both gave
-- couple_view consent. Nothing about either partner's other results. If
-- either has a flagged finding, nothing is returned (reason 'flagged'): a
-- counsellor explains. When both agreed but nothing is shared, one row with
-- available = true and condition_code null.
create function public.couple_shared_conditions()
returns table (
  available      boolean,
  reason         text,
  partner_name   text,
  condition_code text,
  my_status      text,
  partner_status text,
  agreed_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  link    public.couple_links;
  partner uuid;
  agreed  timestamptz;
  pname   text;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into link from public.couple_links
   where status = 'active' and (inviter_id = caller or invitee_id = caller)
   limit 1;
  if link.id is null then
    return query select false, 'no_partner', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  partner := case when link.inviter_id = caller then link.invitee_id else link.inviter_id end;

  select max(c.granted_at) into agreed from public.consents c
   where c.kind = 'couple_view' and c.revoked_at is null and c.user_id in (caller, partner)
  having count(distinct c.user_id) = 2;
  if agreed is null then
    return query select false, 'consent_missing', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if not exists (select 1 from public.screening_results where owner_id = caller)
     or not exists (select 1 from public.screening_results where owner_id = partner) then
    return query select false, 'result_missing', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;
  if exists (select 1 from public.screening_results where owner_id in (caller, partner) and flagged) then
    return query select false, 'flagged', null::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  select split_part(coalesce(p.display_name, ''), ' ', 1) into pname
    from public.profiles p where p.user_id = partner;

  return query
    select true, null::text, pname, a.condition_code, a.status, b.status, agreed
      from public.screening_results a
      join public.screening_results b on b.condition_code = a.condition_code
     where a.owner_id = caller and b.owner_id = partner
       and a.status in ('carrier', 'affected') and b.status in ('carrier', 'affected')
     order by a.condition_code;
  if not found then
    return query select true, null::text, pname, null::text, null::text, null::text, agreed;
  end if;
end;
$$;

revoke all on function public.couple_shared_conditions() from public, anon;
grant execute on function public.couple_shared_conditions() to authenticated;

-- The assistant's couple summary (task 06) now describes a SHARED condition
-- when there is one, rather than each person's latest row.
create or replace function public.assistant_couple_summary()
returns table (
  available      boolean,
  reason         text,
  partner_name   text,
  condition_code text,
  my_status      text,
  partner_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.available, s.reason, s.partner_name,
         coalesce(s.condition_code, mine.condition_code),
         coalesce(s.my_status, mine.status),
         coalesce(s.partner_status, case when s.available then 'no_variant' end)
    from (select * from public.couple_shared_conditions() limit 1) s
    left join lateral (
      select r.condition_code, r.status from public.screening_results r
       where r.owner_id = auth.uid() and r.status in ('carrier', 'affected')
       order by r.condition_code limit 1
    ) mine on s.available and s.condition_code is null
$$;

revoke all on function public.assistant_couple_summary() from public, anon;
grant execute on function public.assistant_couple_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Counsellor workspace (task 07): every finding, not just one
-- ---------------------------------------------------------------------------
create or replace function pro_private.person(
  p_user uuid, p_role text, p_grantee uuid, p_is_couple boolean, p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lvl_result    text := pro_private.grant_level(p_user, p_grantee, 'result');
  lvl_values    text := pro_private.grant_level(p_user, p_grantee, 'values_summary');
  lvl_questions text := pro_private.grant_level(p_user, p_grantee, 'questions');
  lvl_summary   text := pro_private.grant_level(p_user, p_grantee, 'ai_summary');
  lvl_family    text := pro_private.grant_level(p_user, p_grantee, 'family_map');
  res           public.screening_results;
  prep          public.counselling_prep;
  result_json   jsonb;
  questions     text[];
  ai_summary    text;
  missing       text[] := '{}';
  pending       text[];
  understood    integer;
begin
  if lvl_result is not null then
    -- Several findings per report (task 10): the headline finding is a
    -- flagged one first, then a changed copy, then any.
    select * into res from public.screening_results
     where owner_id = p_user
     order by flagged desc, (status in ('carrier', 'affected')) desc, claimed_at desc nulls last
     limit 1;
    if res.id is not null then
      select count(distinct e.props ->> 'question')::integer into understood
        from public.events e
       where e.user_id = p_user and e.name = 'teachback_answered'
         and e.props ->> 'phase' = 'post' and e.props ->> 'correct' = 'true';
      result_json := jsonb_build_object(
        'level', lvl_result,
        'condition_code', res.condition_code,
        'status', res.status,
        'genotype', res.genotype,
        'flagged', res.flagged,
        'flag_reason', res.flag_reason,
        'reported_at', res.reported_at,
        'understood', coalesce(understood, 0),
        -- Every finding on the report, flagged ones without detail.
        'findings', (
          select coalesce(jsonb_agg(jsonb_build_object(
                   'condition_code', f.condition_code,
                   'status', case when f.flagged then null else f.status end,
                   'flagged', f.flagged)
                 order by f.flagged desc, f.condition_code), '[]'::jsonb)
            from public.screening_results f
           where f.owner_id = p_user and f.status <> 'no_variant'
        ),
        -- The full report adds where it came from.
        'centre', case when lvl_result = 'full' then res.centre end
      );
      perform pro_private.log_access(p_user, 'result', lvl_result, p_request);
    end if;
  else
    missing := array_append(missing, 'result');
  end if;

  if lvl_values is null then missing := array_append(missing, 'values_summary'); end if;

  if lvl_questions is not null or lvl_summary is not null then
    select * into prep from public.counselling_prep where user_id = p_user;
  end if;
  if lvl_questions is not null then
    questions := coalesce(prep.questions, '{}');
    perform pro_private.log_access(p_user, 'questions', lvl_questions, p_request);
  else
    missing := array_append(missing, 'questions');
  end if;
  if lvl_summary is not null then
    ai_summary := prep.ai_summary;
    perform pro_private.log_access(p_user, 'ai_summary', lvl_summary, p_request);
  else
    missing := array_append(missing, 'ai_summary');
  end if;
  if lvl_family is null then missing := array_append(missing, 'family_map'); end if;

  select coalesce(array_agg(a.resource order by a.resource), '{}') into pending
    from public.access_requests a
   where a.request_id = p_request and a.owner_id = p_user and a.status = 'pending';

  return jsonb_build_object(
    'role', p_role,
    'first_name', pro_private.first_name(p_user, p_grantee, p_is_couple),
    'initial', pro_private.initial(p_user),
    'locale', (select p.locale from public.profiles p where p.user_id = p_user),
    'shared_any', pro_private.has_any_grant(p_user, p_grantee),
    'result', result_json,
    'values_shared', lvl_values is not null,
    'questions', to_jsonb(questions),
    'ai_summary', ai_summary,
    'family_map_shared', lvl_family is not null,
    'missing', to_jsonb(missing),
    'pending', to_jsonb(pending)
  );
end;
$$;

revoke all on function pro_private.person(uuid, text, uuid, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Couple consent (design CoupleConsent): each partner chooses how much to
-- share. consents.scope holds the level:
--   shared_only: only conditions you both carry (the default);
--   summary:     every condition you carry and your carrier status;
--   full:        the summary plus your report details.
-- Withdrawing closes the couple view for both partners straight away.
-- ---------------------------------------------------------------------------
create function public.couple_consent_status()
returns table (
  linked          boolean,
  partner_name    text,
  me_agreed       boolean,
  me_level        text,
  partner_agreed  boolean,
  agreed_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  link    public.couple_links;
  partner uuid;
  mine    public.consents;
  theirs  public.consents;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into link from public.couple_links
   where status = 'active' and (inviter_id = caller or invitee_id = caller) limit 1;
  if link.id is null then
    return query select false, null::text, false, null::text, false, null::timestamptz;
    return;
  end if;
  partner := case when link.inviter_id = caller then link.invitee_id else link.inviter_id end;
  select * into mine from public.consents
   where user_id = caller and kind = 'couple_view' and revoked_at is null order by granted_at desc limit 1;
  select * into theirs from public.consents
   where user_id = partner and kind = 'couple_view' and revoked_at is null order by granted_at desc limit 1;
  -- The partner's first name only: they linked to each other by invite.
  return query
    select true,
           (select split_part(coalesce(p.display_name, ''), ' ', 1) from public.profiles p where p.user_id = partner),
           mine.id is not null, coalesce(mine.scope, case when mine.id is not null then 'shared_only' end),
           theirs.id is not null,
           case when mine.id is not null and theirs.id is not null then greatest(mine.granted_at, theirs.granted_at) end;
end;
$$;

create function public.set_couple_consent(p_level text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_level not in ('shared_only', 'summary', 'full') then
    raise exception 'unknown level' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.couple_links
     where status = 'active' and (inviter_id = caller or invitee_id = caller)
  ) then
    return 'no_partner';
  end if;
  update public.consents set revoked_at = now()
   where user_id = caller and kind = 'couple_view' and revoked_at is null;
  insert into public.consents (user_id, kind, scope) values (caller, 'couple_view', p_level);
  insert into public.events (user_id, name, props)
  values (caller, 'couple_consent_given', jsonb_build_object('level', p_level));
  return 'agreed';
end;
$$;

create function public.withdraw_couple_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  update public.consents set revoked_at = now()
   where user_id = caller and kind = 'couple_view' and revoked_at is null;
  insert into public.events (user_id, name) values (caller, 'couple_consent_withdrawn');
end;
$$;

-- The partner's own carrier findings, only when BOTH agreed and the partner
-- chose "summary" or "full". Each read is written to access_log for the
-- partner (guardrail 10). Flagged findings are never included.
create function public.couple_partner_findings()
returns table (condition_code text, status text, level text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  link    public.couple_links;
  partner uuid;
  mine    public.consents;
  theirs  public.consents;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into link from public.couple_links
   where status = 'active' and (inviter_id = caller or invitee_id = caller) limit 1;
  if link.id is null then return; end if;
  partner := case when link.inviter_id = caller then link.invitee_id else link.inviter_id end;
  select * into mine from public.consents
   where user_id = caller and kind = 'couple_view' and revoked_at is null order by granted_at desc limit 1;
  select * into theirs from public.consents
   where user_id = partner and kind = 'couple_view' and revoked_at is null order by granted_at desc limit 1;
  if mine.id is null or theirs.id is null or coalesce(theirs.scope, 'shared_only') = 'shared_only' then return; end if;
  if exists (select 1 from public.screening_results where owner_id = partner and flagged) then return; end if;

  insert into public.access_log (resource_owner_id, viewer_id, resource, level)
  values (partner, caller, 'result', case when theirs.scope = 'full' then 'full' else 'summary' end);

  return query
    select r.condition_code, r.status, theirs.scope
      from public.screening_results r
     where r.owner_id = partner and r.status in ('carrier', 'affected')
     order by r.condition_code;
end;
$$;

revoke all on function public.couple_consent_status() from public, anon;
revoke all on function public.set_couple_consent(text) from public, anon;
revoke all on function public.withdraw_couple_consent() from public, anon;
revoke all on function public.couple_partner_findings() from public, anon;
grant execute on function public.couple_consent_status() to authenticated;
grant execute on function public.set_couple_consent(text) to authenticated;
grant execute on function public.withdraw_couple_consent() to authenticated;
grant execute on function public.couple_partner_findings() to authenticated;
