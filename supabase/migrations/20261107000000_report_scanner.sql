-- Task 12: photograph your report, hear it explained.
--
-- A user can photograph or upload their screening report. The AI reads it,
-- the catalogue explains it, and the user may save the findings as their own
-- results. What changes here:
--
--   - screening_results rows can come from a scan (source = 'scan'). They are
--     unverified until the person claims the same report from their
--     screening centre by reference code.
--   - Saving goes through save_scanned_report(), called by the server only
--     (service role) after it has re-run status mapping and flagging itself.
--   - Two private Storage buckets, owner-only: scan-uploads (deleted straight
--     after reading, swept after 15 minutes) and tts-cache (24 hours).
--   - Couples: unverified findings count only if BOTH partners saved a scan.
--   - Dashboard: reports scanned and average time to explanation, groups of
--     10 or more only.
--
-- Nothing from a report is stored except the interpretation (condition,
-- status, flags), the lab, the date and the condition text as written. Never
-- an image, a name, an ID number or a date of birth.

-- ---------------------------------------------------------------------------
-- screening_results: where a row came from
-- ---------------------------------------------------------------------------
alter table public.screening_results
  add column if not exists source text not null default 'centre',
  add column if not exists verified boolean not null default true,
  add column if not exists condition_text text;

alter table public.screening_results drop constraint if exists screening_results_source_check;
alter table public.screening_results
  add constraint screening_results_source_check check (source in ('centre', 'scan'));

alter table public.screening_results drop constraint if exists screening_results_condition_text_check;
alter table public.screening_results
  add constraint screening_results_condition_text_check
  check (condition_text is null or (source = 'scan' and char_length(condition_text) <= 200));

-- Rows from a screening centre are verified by definition.
alter table public.screening_results drop constraint if exists screening_results_centre_verified;
alter table public.screening_results
  add constraint screening_results_centre_verified check (source = 'scan' or verified);

-- Guardrail 4, enforced for scans in the database too: an affected or
-- uncertain scanned finding is always flagged.
alter table public.screening_results drop constraint if exists screening_results_scan_flagged;
alter table public.screening_results
  add constraint screening_results_scan_flagged
  check (source <> 'scan' or status not in ('affected', 'uncertain') or flagged);

-- More flag reasons (lib/genetics/flagging.ts is the source of truth).
alter table public.screening_results drop constraint if exists screening_results_flag_reason_check;
alter table public.screening_results
  add constraint screening_results_flag_reason_check check (
    flag_reason in (
      'vus', 'severe', 'x_linked', 'conflicting',
      'affected', 'dominant', 'unreadable', 'unmatched', 'other_report'
    )
  );

create index if not exists screening_results_owner_source_idx
  on public.screening_results (owner_id, source);

-- ---------------------------------------------------------------------------
-- Saving a scanned report (server only)
-- ---------------------------------------------------------------------------
-- p_report:
--   { "lab_name": text|null, "report_date": "YYYY-MM-DD"|null,
--     "findings": [ { "condition_code", "status", "genotype", "flagged",
--                     "flag_reason", "condition_text" } ] }
-- Returns the new report's reference code (SCAN-...).
create or replace function public.save_scanned_report(p_user uuid, p_report jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref       text := 'SCAN-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  findings  jsonb := p_report -> 'findings';
  lab       text := nullif(btrim(left(p_report ->> 'lab_name', 120)), '');
  reported  timestamptz;
  f         jsonb;
begin
  if p_user is null then
    raise exception 'no user' using errcode = '22023';
  end if;
  if jsonb_typeof(findings) <> 'array' or jsonb_array_length(findings) = 0 or jsonb_array_length(findings) > 60 then
    raise exception 'invalid findings' using errcode = '22023';
  end if;
  begin
    reported := (p_report ->> 'report_date')::date;
  exception when others then
    reported := null;
  end;
  if reported is not null and (reported > now() + interval '1 day' or reported < '1990-01-01') then
    reported := null;
  end if;

  for f in select * from jsonb_array_elements(findings) loop
    insert into public.screening_results (
      owner_id, claimed_at, reference_code, condition_code, status, genotype,
      flagged, flag_reason, reported_at, centre, source, verified, condition_text
    ) values (
      p_user, now(), ref,
      left(f ->> 'condition_code', 64),
      f ->> 'status',
      nullif(left(f ->> 'genotype', 32), ''),
      coalesce((f ->> 'flagged')::boolean, true),
      nullif(f ->> 'flag_reason', ''),
      reported, lab, 'scan', false,
      nullif(left(f ->> 'condition_text', 200), '')
    );
  end loop;
  return ref;
end;
$$;

revoke all on function public.save_scanned_report(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_scanned_report(uuid, jsonb) to service_role;

-- Scans started by the caller in the last 24 hours (10 a day each).
create or replace function public.scans_last_day()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.events
   where user_id = auth.uid() and name = 'scan_started' and created_at > now() - interval '24 hours'
$$;

revoke all on function public.scans_last_day() from public, anon;
grant execute on function public.scans_last_day() to authenticated;

-- ---------------------------------------------------------------------------
-- Claiming a centre report confirms matching scanned findings
-- ---------------------------------------------------------------------------
-- Same as task 10, plus: once the caller claims a report by reference code,
-- their scanned findings for the same conditions become verified.
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
     and source = 'centre'
     and owner_id is null;
  get diagnostics claimed = row_count;

  if claimed = 0 then
    if exists (
      select 1 from public.screening_results
      where reference_code = upper(btrim(code)) and owner_id = caller and source = 'centre'
    ) then
      return 'claimed';
    end if;
    insert into public.result_claim_attempts (user_id) values (caller);
    return 'not_found';
  end if;

  update public.screening_results s
     set verified = true
   where s.owner_id = caller and s.source = 'scan' and not s.verified
     and s.condition_code in (
       select c.condition_code from public.screening_results c
        where c.reference_code = upper(btrim(code)) and c.owner_id = caller
     );

  return 'claimed';
end;
$$;

revoke all on function public.claim_screening_result(text) from public, anon;
grant execute on function public.claim_screening_result(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Couples: unverified findings only if both partners saved a scan
-- ---------------------------------------------------------------------------
-- One row per person and condition: a centre row wins over a scanned one,
-- then the newest. Unverified rows are left out unless both partners saved
-- a scanned report themselves.
create or replace function public.couple_findings_for(p_a uuid, p_b uuid)
returns table (owner_id uuid, condition_code text, status text, flagged boolean, verified boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with both_scanned as (
    select count(distinct r.owner_id) = 2 as yes
      from public.screening_results r
     where r.owner_id in (p_a, p_b) and r.source = 'scan'
  ),
  ranked as (
    select r.owner_id, r.condition_code, r.status, r.flagged, r.verified,
           row_number() over (
             partition by r.owner_id, r.condition_code
             order by (r.source = 'centre') desc, r.verified desc, r.claimed_at desc nulls last
           ) as n
      from public.screening_results r, both_scanned b
     where r.owner_id in (p_a, p_b) and (r.verified or b.yes)
  )
  select owner_id, condition_code, status, flagged, verified from ranked where n = 1
$$;

revoke all on function public.couple_findings_for(uuid, uuid) from public, anon, authenticated;

drop function if exists public.couple_shared_conditions();
create function public.couple_shared_conditions()
returns table (
  available       boolean,
  reason          text,
  partner_name    text,
  condition_code  text,
  my_status       text,
  partner_status  text,
  agreed_at       timestamptz,
  based_on_upload boolean
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
    return query select false, 'no_partner', null::text, null::text, null::text, null::text, null::timestamptz, false;
    return;
  end if;
  partner := case when link.inviter_id = caller then link.invitee_id else link.inviter_id end;

  select max(c.granted_at) into agreed from public.consents c
   where c.kind = 'couple_view' and c.revoked_at is null and c.user_id in (caller, partner)
  having count(distinct c.user_id) = 2;
  if agreed is null then
    return query select false, 'consent_missing', null::text, null::text, null::text, null::text, null::timestamptz, false;
    return;
  end if;

  if not exists (select 1 from public.couple_findings_for(caller, partner) r where r.owner_id = caller)
     or not exists (select 1 from public.couple_findings_for(caller, partner) r where r.owner_id = partner) then
    return query select false, 'result_missing', null::text, null::text, null::text, null::text, null::timestamptz, false;
    return;
  end if;
  if exists (select 1 from public.couple_findings_for(caller, partner) r where r.flagged) then
    return query select false, 'flagged', null::text, null::text, null::text, null::text, null::timestamptz, false;
    return;
  end if;

  select split_part(coalesce(p.display_name, ''), ' ', 1) into pname
    from public.profiles p where p.user_id = partner;

  return query
    with fr as (select * from public.couple_findings_for(caller, partner))
    select true, null::text, pname, a.condition_code, a.status, b.status, agreed, not (a.verified and b.verified)
      from fr a
      join fr b on b.condition_code = a.condition_code
     where a.owner_id = caller and b.owner_id = partner
       and a.status in ('carrier', 'affected') and b.status in ('carrier', 'affected')
     order by a.condition_code;
  if not found then
    return query select true, null::text, pname, null::text, null::text, null::text, agreed,
      exists (select 1 from public.couple_findings_for(caller, partner) r where not r.verified);
  end if;
end;
$$;

revoke all on function public.couple_shared_conditions() from public, anon;
grant execute on function public.couple_shared_conditions() to authenticated;

-- The partner's own findings (task 10) follow the same rule.
create or replace function public.couple_partner_findings()
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
  if exists (select 1 from public.couple_findings_for(caller, partner) r where r.owner_id = partner and r.flagged) then return; end if;

  insert into public.access_log (resource_owner_id, viewer_id, resource, level)
  values (partner, caller, 'result', case when theirs.scope = 'full' then 'full' else 'summary' end);

  return query
    select r.condition_code, r.status, theirs.scope
      from public.couple_findings_for(caller, partner) r
     where r.owner_id = partner and r.status in ('carrier', 'affected')
     order by r.condition_code;
end;
$$;

revoke all on function public.couple_partner_findings() from public, anon;
grant execute on function public.couple_partner_findings() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private, owner-only buckets
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('scan-uploads', 'scan-uploads', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('tts-cache', 'tts-cache', false, 5242880, array['audio/mpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects live under <user_id>/...; only that user can touch them.
drop policy if exists "scan-uploads: owner insert" on storage.objects;
drop policy if exists "scan-uploads: owner read" on storage.objects;
drop policy if exists "scan-uploads: owner delete" on storage.objects;
drop policy if exists "tts-cache: owner insert" on storage.objects;
drop policy if exists "tts-cache: owner read" on storage.objects;
drop policy if exists "tts-cache: owner delete" on storage.objects;

create policy "scan-uploads: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'scan-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scan-uploads: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'scan-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "scan-uploads: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'scan-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "tts-cache: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tts-cache' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tts-cache: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'tts-cache' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "tts-cache: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tts-cache' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Objects older than the given age, for the cleanup job (server only). The
-- job deletes them through the Storage API, which also removes the files.
create or replace function public.storage_expired_objects(p_bucket text, p_age_seconds integer, p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
   where o.bucket_id = p_bucket and p_bucket in ('scan-uploads', 'tts-cache')
     and o.created_at < now() - make_interval(secs => p_age_seconds)
   order by o.created_at
   limit least(greatest(p_limit, 1), 1000)
$$;

revoke all on function public.storage_expired_objects(text, integer, integer) from public, anon, authenticated;
grant execute on function public.storage_expired_objects(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Dashboard (task 05): reports scanned, average time to explanation
-- ---------------------------------------------------------------------------
-- Counts and seconds only, from scan_completed events. Hidden when fewer
-- than 10 people scanned in the window (analytics_private.k).
create or replace function public.analytics_scans(p_days integer, p_centre text default null)
returns table (scanned integer, people integer, avg_seconds numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := now();
  w_from timestamptz := case when p_days is null then null else now_at - make_interval(days => p_days) end;
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);

  return query
    with c as (
      select user_id from analytics_private.cohort(null, now_at, p_centre)
    ),
    s as (
      select e.user_id, (e.props ->> 'seconds')::numeric as seconds
        from public.events e
        join c on c.user_id = e.user_id
       where e.name = 'scan_completed'
         and (w_from is null or e.created_at >= w_from)
         and e.created_at < now_at
         and (e.props ->> 'seconds') ~ '^[0-9]+(\.[0-9]+)?$'
    ),
    n as (select count(distinct s.user_id) as n_people from s)
    select
      analytics_private.k((select n.n_people from n), (select count(*) from s))::integer,
      analytics_private.k((select n.n_people from n), (select n.n_people from n))::integer,
      analytics_private.k((select n.n_people from n), round((select avg(s.seconds) from s), 1));
end;
$$;

revoke all on function public.analytics_scans(integer, text) from public, anon;
grant execute on function public.analytics_scans(integer, text) to authenticated;
