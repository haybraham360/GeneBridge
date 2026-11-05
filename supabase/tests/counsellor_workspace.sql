-- Task 07: access rules for the counsellor workspace. Run with `npm run test:sql`.
-- Rolls back; leaves nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: a couple (M, K), a flagged patient (R), counsellor A at facility
-- F1 and counsellor B at facility F2.
insert into auth.users (id, raw_user_meta_data) values
  ('7e570700-0000-4000-8000-0000000000a1', '{"display_name":"Mariam"}'),
  ('7e570700-0000-4000-8000-0000000000a2', '{"display_name":"Khalid"}'),
  ('7e570700-0000-4000-8000-0000000000a3', '{"display_name":"Patient R."}'),
  ('7e570700-0000-4000-8000-0000000000c1', '{"display_name":"Counsellor A"}'),
  ('7e570700-0000-4000-8000-0000000000c2', '{"display_name":"Counsellor B"}');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set role = 'counsellor'
 where user_id in ('7e570700-0000-4000-8000-0000000000c1', '7e570700-0000-4000-8000-0000000000c2');

insert into public.facilities (id, name, code) values
  ('7e570700-0000-4000-8000-0000000000f1', 'Facility one', 'TEST-F1'),
  ('7e570700-0000-4000-8000-0000000000f2', 'Facility two', 'TEST-F2');
insert into public.counsellors (id, user_id, name, facility_id) values
  ('7e570700-0000-4000-8000-0000000000e1', '7e570700-0000-4000-8000-0000000000c1', 'Counsellor A', '7e570700-0000-4000-8000-0000000000f1'),
  ('7e570700-0000-4000-8000-0000000000e2', '7e570700-0000-4000-8000-0000000000c2', 'Counsellor B', '7e570700-0000-4000-8000-0000000000f2');

insert into public.screening_results (owner_id, claimed_at, reference_code, condition_code, status, genotype, flagged, flag_reason) values
  ('7e570700-0000-4000-8000-0000000000a1', now(), 'TEST-07-M', 'sickle_cell', 'carrier', 'HbAS', false, null),
  ('7e570700-0000-4000-8000-0000000000a2', now(), 'TEST-07-K', 'sickle_cell', 'carrier', 'HbAS', false, null),
  ('7e570700-0000-4000-8000-0000000000a3', now(), 'TEST-07-R', 'beta_thalassemia', 'uncertain', null, true, 'vus');

insert into public.values_answers (user_id, question_id, value) values
  ('7e570700-0000-4000-8000-0000000000a1', 'biological_children', 5),
  ('7e570700-0000-4000-8000-0000000000a2', 'biological_children', 5),
  ('7e570700-0000-4000-8000-0000000000a1', 'avoid_procedures', 5),
  ('7e570700-0000-4000-8000-0000000000a2', 'avoid_procedures', 2);

-- Couple request (assigned to A, booked) and R's flagged request (open at F1).
insert into public.counsellor_requests (id, user_id, partner_user_id, source, reason, urgency, status, facility_id, assigned_counsellor_id) values
  ('7e570700-0000-4000-8000-0000000000b1', '7e570700-0000-4000-8000-0000000000a1', '7e570700-0000-4000-8000-0000000000a2',
   'booking', 'couple_session', 'standard', 'booked', '7e570700-0000-4000-8000-0000000000f1', '7e570700-0000-4000-8000-0000000000e1'),
  ('7e570700-0000-4000-8000-0000000000b2', '7e570700-0000-4000-8000-0000000000a3', null,
   'flagged_result', 'flagged_result', 'priority', 'open', '7e570700-0000-4000-8000-0000000000f1', null);

-- Mariam shares result and values with A; Khalid shares values only.
insert into public.share_grants (owner_id, grantee_id, resource, level) values
  ('7e570700-0000-4000-8000-0000000000a1', '7e570700-0000-4000-8000-0000000000c1', 'result', 'summary'),
  ('7e570700-0000-4000-8000-0000000000a1', '7e570700-0000-4000-8000-0000000000c1', 'values_summary', 'summary'),
  ('7e570700-0000-4000-8000-0000000000a2', '7e570700-0000-4000-8000-0000000000c1', 'values_summary', 'summary');

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
exception when others then
  -- Local databases may not have a `postgres` role; reset to the session user.
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- ---------------------------------------------------------------------------
do $$
declare n integer; ok boolean;
begin
  -- Counsellor B (other facility) sees none of A's requests.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c2');
  select count(*) into n from public.pro_requests();
  if n <> 0 then raise exception 'B sees % requests from another facility', n; end if;
  if exists (select 1 from public.counsellor_requests) then raise exception 'B reads requests table'; end if;
  ok := false;
  begin
    perform public.pro_request_detail('7e570700-0000-4000-8000-0000000000b1');
  exception when sqlstate 'P0002' then ok := true;
  end;
  if not ok then raise exception 'B opened a request from another facility'; end if;
  ok := false;
  begin
    perform public.pro_request_access('7e570700-0000-4000-8000-0000000000b2', 'user', 'result');
  exception when sqlstate 'P0002' then ok := true;
  end;
  if not ok then raise exception 'B requested access on another facility request'; end if;
  raise notice 'ok: a counsellor at another facility sees nothing';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare n integer; d jsonb; ok boolean; fn text;
begin
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  select count(*) into n from public.pro_requests();
  if n <> 2 then raise exception 'A should see 2 requests, sees %', n; end if;

  -- No direct reads of anyone's result, grant or not.
  if exists (select 1 from public.screening_results) then raise exception 'A reads results directly'; end if;
  if exists (select 1 from public.values_answers) then raise exception 'A reads values directly'; end if;

  -- R shared nothing: no result, everything missing, flag reason hidden.
  d := public.pro_request_detail('7e570700-0000-4000-8000-0000000000b2');
  if d -> 'people' -> 0 -> 'result' <> 'null'::jsonb then raise exception 'unshared result returned'; end if;
  if not (d -> 'people' -> 0 -> 'missing') ? 'result' then raise exception 'missing list lacks result'; end if;
  if (select flag_reason from public.pro_requests() where id = '7e570700-0000-4000-8000-0000000000b2') is not null then
    raise exception 'flag reason shown before sharing';
  end if;

  -- Couple: Mariam's result returned; Khalid's not. Values: agreement only.
  d := public.pro_request_detail('7e570700-0000-4000-8000-0000000000b1');
  if d -> 'people' -> 0 -> 'result' ->> 'status' <> 'carrier' then raise exception 'shared result missing'; end if;
  if d -> 'people' -> 1 -> 'result' <> 'null'::jsonb then raise exception 'Khalid result returned without grant'; end if;
  if d::text ~ '"value"' then raise exception 'raw values leaked'; end if;
  if (select e ->> 'agreement' from jsonb_array_elements(d -> 'values') e where e ->> 'question_id' = 'avoid_procedures') <> 'differ' then
    raise exception 'values difference not flagged';
  end if;
  if (select e ->> 'agreement' from jsonb_array_elements(d -> 'values') e where e ->> 'question_id' = 'biological_children') <> 'very_important' then
    raise exception 'values agreement wrong';
  end if;
  -- Names: both shared something, so first names show.
  select partner_first_name into fn from public.pro_requests() where id = '7e570700-0000-4000-8000-0000000000b1';
  if fn is distinct from 'Khalid' then raise exception 'partner name wrong: %', fn; end if;
  raise notice 'ok: only shared resources are returned, never raw values';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare n integer;
begin
  -- Access log: Mariam sees her result + values reads, Khalid his values read.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a1');
  select count(*) into n from public.access_log where resource in ('result', 'values_summary');
  if n < 2 then raise exception 'Mariam sees % log rows', n; end if;
  if exists (select 1 from public.access_log where resource_owner_id <> '7e570700-0000-4000-8000-0000000000a1') then
    raise exception 'Mariam sees another person''s log';
  end if;
  if (select viewer_name from public.my_access_log() limit 1) <> 'Counsellor A' then raise exception 'viewer name missing'; end if;
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a2');
  select count(*) into n from public.access_log where resource = 'values_summary';
  if n < 1 then raise exception 'Khalid has no log rows'; end if;
  if exists (select 1 from public.access_log where resource = 'result') then raise exception 'unshared result was logged'; end if;
  -- Counsellors can't read the log.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  if exists (select 1 from public.access_log) then raise exception 'counsellor reads access_log'; end if;
  raise notice 'ok: every read is logged and visible to its owner only';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare n integer; ok boolean;
begin
  -- Notes: A writes; B (other facility) and the patients can't read it.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  perform public.pro_save_note('7e570700-0000-4000-8000-0000000000b1', 'Private note');
  if (select body from public.session_notes) <> 'Private note' then raise exception 'A cannot read own note'; end if;
  ok := false;
  begin
    insert into public.session_notes (request_id, counsellor_id, facility_id, body)
    values ('7e570700-0000-4000-8000-0000000000b1', '7e570700-0000-4000-8000-0000000000e1',
            '7e570700-0000-4000-8000-0000000000f1', 'x');
  exception when insufficient_privilege then ok := true;
  end;
  if not ok then raise exception 'direct note insert allowed'; end if;

  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a1');
  select count(*) into n from public.session_notes;
  if n <> 0 then raise exception 'patient reads session notes'; end if;
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c2');
  select count(*) into n from public.session_notes;
  if n <> 0 then raise exception 'other facility reads notes'; end if;
  raise notice 'ok: session notes are private to the counsellor and facility';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare fns text[] := array[
  'select public.pro_me()',
  'select public.pro_requests()',
  'select public.pro_request_detail(''7e570700-0000-4000-8000-0000000000b1'')',
  'select public.pro_request_access(''7e570700-0000-4000-8000-0000000000b2'', ''user'', ''result'')',
  'select public.pro_save_note(''7e570700-0000-4000-8000-0000000000b1'', ''x'')',
  'select public.pro_start_session(''7e570700-0000-4000-8000-0000000000b1'')',
  'select public.pro_mark_attended(''7e570700-0000-4000-8000-0000000000b1'')',
  'select public.pro_create_referral(''7e570700-0000-4000-8000-0000000000b1'', ''confirmatory_test'')',
  'select public.pro_close_request(''7e570700-0000-4000-8000-0000000000b1'', ''information_given'')',
  'select public.pro_referrals()'];
  q text; ok boolean;
begin
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a1');
  if public.pro_is_counsellor() then raise exception 'patient is a counsellor'; end if;
  foreach q in array fns loop
    ok := false;
    begin
      execute q;
    exception when insufficient_privilege then ok := true;
    end;
    if not ok then raise exception 'non-counsellor could run: %', q; end if;
  end loop;
  raise notice 'ok: non-counsellors cannot call any workspace function';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare ar uuid; d jsonb; s text; n integer;
begin
  -- Request access on R: creates a request + notification; sharing reveals it.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  s := public.pro_request_access('7e570700-0000-4000-8000-0000000000b2', 'user', 'result');
  if s <> 'requested' then raise exception 'request access: %', s; end if;
  if public.pro_request_access('7e570700-0000-4000-8000-0000000000b2', 'user', 'result') <> 'already_pending' then
    raise exception 'duplicate access request';
  end if;

  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a3');
  select access_request_id into ar from public.my_notifications() where kind = 'access_request';
  if ar is null then raise exception 'no notification for R'; end if;
  if (select counsellor_name from public.my_notifications() where kind = 'access_request') <> 'Counsellor A' then
    raise exception 'notification lacks counsellor name';
  end if;
  if public.respond_access_request(ar, true) <> 'granted' then raise exception 'share failed'; end if;
  if not exists (select 1 from public.share_grants where resource = 'result' and level = 'full' and revoked_at is null) then
    raise exception 'grant not created';
  end if;

  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  d := public.pro_request_detail('7e570700-0000-4000-8000-0000000000b2');
  if d -> 'people' -> 0 -> 'result' ->> 'flag_reason' <> 'vus' then raise exception 'shared flagged result hidden'; end if;
  if d -> 'people' -> 0 -> 'result' ->> 'level' <> 'full' then raise exception 'level not full'; end if;

  -- Revoking takes effect on the next read.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a3');
  update public.share_grants set revoked_at = now() where resource = 'result';
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  d := public.pro_request_detail('7e570700-0000-4000-8000-0000000000b2');
  if d -> 'people' -> 0 -> 'result' <> 'null'::jsonb then raise exception 'revoked result still returned'; end if;
  raise notice 'ok: request access, share and revoke';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare n integer; ok boolean; url text;
begin
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  url := public.pro_start_session('7e570700-0000-4000-8000-0000000000b1');
  if url not like '/pro/video/%' then raise exception 'meeting url %', url; end if;
  if (select status from public.counsellor_requests where id = '7e570700-0000-4000-8000-0000000000b1') <> 'in_session' then
    raise exception 'not in session';
  end if;
  perform public.pro_mark_attended('7e570700-0000-4000-8000-0000000000b1');
  n := public.pro_create_referral('7e570700-0000-4000-8000-0000000000b1', 'confirmatory_test');
  if n <> 2 then raise exception 'expected a referral per partner, got %', n; end if;
  ok := false;
  begin
    perform public.pro_create_referral('7e570700-0000-4000-8000-0000000000b1', 'specialist', null);
  exception when sqlstate '22023' then ok := true;
  end;
  if not ok then raise exception 'specialist referral without a service'; end if;

  -- Patients see their referral and a notification; events are theirs.
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000a1');
  select count(*) into n from public.referrals where step = 'confirmatory_test' and status = 'ordered';
  if n <> 1 then raise exception 'Mariam sees % referrals', n; end if;
  if not exists (select 1 from public.my_notifications() where kind = 'referral_created') then
    raise exception 'no referral notification';
  end if;
  if not exists (select 1 from public.bookings where attended_at is not null) then raise exception 'patient cannot see booking'; end if;

  perform pg_temp.as_service();
  select count(*) into n from public.events
   where name in ('session_attended', 'referral_created')
     and user_id in ('7e570700-0000-4000-8000-0000000000a1', '7e570700-0000-4000-8000-0000000000a2');
  if n <> 4 then raise exception 'expected 4 patient events, got %', n; end if;
  raise notice 'ok: session, attendance and referrals reach the patient';
end $$;

-- ---------------------------------------------------------------------------
do $$
declare ok boolean; ref uuid;
begin
  perform pg_temp.as_user('7e570700-0000-4000-8000-0000000000c1');
  select id into ref from public.pro_referrals() limit 1;
  if public.pro_update_referral(ref, 'scheduled') <> 'confirmatory_test' then raise exception 'update referral'; end if;

  -- Closing needs one of the five outcome categories.
  ok := false;
  begin
    perform public.pro_close_request('7e570700-0000-4000-8000-0000000000b1', null);
  exception when sqlstate '22023' then ok := true;
  end;
  if not ok then raise exception 'closed without an outcome'; end if;
  ok := false;
  begin
    perform public.pro_close_request('7e570700-0000-4000-8000-0000000000b1', 'marriage_cancelled');
  exception when sqlstate '22023' then ok := true;
  end;
  if not ok then raise exception 'accepted a marriage outcome'; end if;
  perform public.pro_close_request('7e570700-0000-4000-8000-0000000000b1', 'referred_confirmatory_test');

  -- Even the service role can't store a marriage-related outcome.
  perform pg_temp.as_service();
  ok := false;
  begin
    update public.counsellor_requests set outcome = 'engagement_ended' where id = '7e570700-0000-4000-8000-0000000000b1';
  exception when check_violation then ok := true;
  end;
  if not ok then raise exception 'outcome column accepts free values'; end if;
  raise notice 'ok: closing records an outcome category only';
end $$;

rollback;
