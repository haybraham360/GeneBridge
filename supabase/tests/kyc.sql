-- Task 14: professional verification. Run with `npm run test:sql`.
-- Rolls back; leaves nothing behind.
--
-- The rule under test: an unverified professional never sees, contacts, is
-- booked by or appears to a patient, enforced in the database.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: patient P, verified professional V (accepting patients),
-- unverified professional U, suspended professional S, admin A.
insert into auth.users (id, raw_user_meta_data) values
  ('14000000-0000-4000-8000-0000000000a1', '{"display_name":"Patient P"}'),
  ('14000000-0000-4000-8000-0000000000c1', '{"display_name":"Verified V"}'),
  ('14000000-0000-4000-8000-0000000000c2', '{"display_name":"Unverified U"}'),
  ('14000000-0000-4000-8000-0000000000c3', '{"display_name":"Suspended S"}'),
  ('14000000-0000-4000-8000-0000000000d1', '{"display_name":"Admin A"}');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set role = 'professional'
 where user_id in ('14000000-0000-4000-8000-0000000000c1', '14000000-0000-4000-8000-0000000000c2', '14000000-0000-4000-8000-0000000000c3');
update public.profiles set role = 'admin' where user_id = '14000000-0000-4000-8000-0000000000d1';

insert into public.professional_profiles (user_id, display_name, profession, verification_status, licence_number, licence_authority, licence_expiry, accepting_patients) values
  ('14000000-0000-4000-8000-0000000000c1', 'Verified V', 'genetic_counsellor', 'verified', 'LIC-V', 'dha', current_date + 365, true),
  ('14000000-0000-4000-8000-0000000000c2', 'Unverified U', 'physician', 'unverified', null, null, null, false),
  ('14000000-0000-4000-8000-0000000000c3', 'Suspended S', 'nurse', 'suspended', 'LIC-S', 'mohap', current_date + 365, false);

-- A facility that sorts first, so approved professionals join it.
insert into public.facilities (id, name, code) values ('14000000-0000-4000-8000-0000000000f1', 'Intake', 'AAAA-KYC-INTAKE');
-- U and S have counsellors rows too, to prove the workspace checks
-- verification and not just the row.
insert into public.counsellors (id, user_id, name, facility_id) values
  ('14000000-0000-4000-8000-0000000000e1', '14000000-0000-4000-8000-0000000000c1', 'Verified V', '14000000-0000-4000-8000-0000000000f1'),
  ('14000000-0000-4000-8000-0000000000e2', '14000000-0000-4000-8000-0000000000c2', 'Unverified U', '14000000-0000-4000-8000-0000000000f1'),
  ('14000000-0000-4000-8000-0000000000e3', '14000000-0000-4000-8000-0000000000c3', 'Suspended S', '14000000-0000-4000-8000-0000000000f1');

insert into public.screening_results (owner_id, claimed_at, reference_code, condition_code, status, genotype, flagged) values
  ('14000000-0000-4000-8000-0000000000a1', now(), 'TEST-14-P', 'sickle_cell', 'carrier', 'HbAS', false);

-- P's open request at the intake facility, shared with V; a booking with V.
insert into public.counsellor_requests (id, user_id, source, reason, urgency, status, facility_id) values
  ('14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000a1', 'flagged_result', 'flagged_result', 'priority', 'open', '14000000-0000-4000-8000-0000000000f1'),
  ('14000000-0000-4000-8000-0000000000b2', '14000000-0000-4000-8000-0000000000a1', 'booking', 'couple_session', 'standard', 'booked', '14000000-0000-4000-8000-0000000000f1');
insert into public.share_grants (owner_id, grantee_id, resource, level) values
  ('14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c1', 'result', 'summary');
insert into public.bookings (id, request_id, counsellor_id, starts_at, format) values
  ('14000000-0000-4000-8000-0000000000aa', '14000000-0000-4000-8000-0000000000b2', '14000000-0000-4000-8000-0000000000e1', now() + interval '3 days', 'video');
insert into public.conversations (id, patient_id, professional_id) values
  ('14000000-0000-4000-8000-0000000000cc', '14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c1');
insert into public.messages (conversation_id, sender_id, body) values
  ('14000000-0000-4000-8000-0000000000cc', '14000000-0000-4000-8000-0000000000a1', 'Hello');

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
  reset role;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

-- ---------------------------------------------------------------------------
-- Unverified and suspended professionals see nothing
-- ---------------------------------------------------------------------------
do $$
declare
  who text;
  n integer;
  ok boolean;
begin
  foreach who in array array['14000000-0000-4000-8000-0000000000c2', '14000000-0000-4000-8000-0000000000c3'] loop
    perform pg_temp.as_user(who);
    if public.is_verified_professional(who::uuid) then raise exception '% counts as verified', who; end if;
    if public.pro_is_counsellor() then raise exception '% passes the workspace check', who; end if;
    if not public.pro_is_professional() then raise exception '% cannot reach their own dashboard', who; end if;

    select count(*) into n from public.counsellor_requests;
    if n <> 0 then raise exception '% reads % requests', who, n; end if;
    select count(*) into n from public.bookings;
    if n <> 0 then raise exception '% reads bookings', who; end if;
    select count(*) into n from public.share_grants;
    if n <> 0 then raise exception '% reads share grants', who; end if;
    select count(*) into n from public.profiles where user_id = '14000000-0000-4000-8000-0000000000a1';
    if n <> 0 then raise exception '% reads a patient profile', who; end if;
    select count(*) into n from public.screening_results;
    if n <> 0 then raise exception '% reads results', who; end if;
    select count(*) into n from public.conversations;
    if n <> 0 then raise exception '% reads conversations', who; end if;
    select count(*) into n from public.messages;
    if n <> 0 then raise exception '% reads messages', who; end if;
    select count(*) into n from public.my_counsellor();
    if n <> 0 then raise exception '% has a counsellor record', who; end if;

    ok := false;
    begin perform public.pro_requests(); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% can list the queue', who; end if;
    ok := false;
    begin perform public.pro_request_detail('14000000-0000-4000-8000-0000000000b1');
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% can open (and claim) a request', who; end if;
    ok := false;
    begin perform public.pro_start_session('14000000-0000-4000-8000-0000000000b1');
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% can start a session', who; end if;
  end loop;

  -- Even an inserted access_log row is refused for an unverified viewer.
  perform pg_temp.as_service();
  ok := false;
  begin
    insert into public.access_log (resource_owner_id, viewer_id, resource, level)
    values ('14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c2', 'result', 'summary');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'access_log accepted an unverified viewer'; end if;

  -- The verified professional still works.
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c1');
  select count(*) into n from public.counsellor_requests;
  if n < 1 then raise exception 'verified professional sees no queue'; end if;
  perform public.pro_requests();
  raise notice 'ok: unverified and suspended professionals read nothing and call nothing';
end $$;

-- ---------------------------------------------------------------------------
-- Directory, sharing, bookings and conversations
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
  ok boolean;
begin
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.professional_directory();
  if n <> 1 then raise exception 'directory shows % professionals, expected only V', n; end if;
  select count(*) into n from public.professional_directory() where user_id <> '14000000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'directory shows an unverified professional'; end if;
  select count(*) into n from public.counsellors;
  if n <> 1 then raise exception 'patient lists % counsellors, expected only V', n; end if;
  select count(*) into n from public.professional_profiles;
  if n <> 0 then raise exception 'patient reads professional_profiles directly'; end if;

  ok := false;
  begin
    insert into public.share_grants (owner_id, grantee_id, resource, level)
    values ('14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c2', 'values_summary', 'summary');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'patient could share with an unverified professional'; end if;

  ok := false;
  begin
    insert into public.conversations (patient_id, professional_id)
    values ('14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c2');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'patient could start a conversation with an unverified professional'; end if;

  -- Bookings: never an unverified professional, and a verified one only when
  -- accepting patients.
  perform pg_temp.as_service();
  ok := false;
  begin
    insert into public.bookings (request_id, counsellor_id, starts_at, format)
    values ('14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000e2', now() + interval '1 day', 'video');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'an unverified professional was booked'; end if;
  update public.professional_profiles set accepting_patients = false where user_id = '14000000-0000-4000-8000-0000000000c1';
  ok := false;
  begin
    insert into public.bookings (request_id, counsellor_id, starts_at, format)
    values ('14000000-0000-4000-8000-0000000000b1', '14000000-0000-4000-8000-0000000000e1', now() + interval '1 day', 'video');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a professional not accepting patients was booked'; end if;
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.professional_directory();
  if n <> 0 then raise exception 'directory shows a professional who is not accepting patients'; end if;
  perform pg_temp.as_service();
  update public.professional_profiles set accepting_patients = true where user_id = '14000000-0000-4000-8000-0000000000c1';
  raise notice 'ok: directory, sharing, bookings and new conversations need a verified professional';
end $$;

-- ---------------------------------------------------------------------------
-- Professionals can't verify themselves
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean;
begin
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c2');
  ok := false;
  begin
    update public.professional_profiles set verification_status = 'verified' where user_id = '14000000-0000-4000-8000-0000000000c2';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional set their own verification_status'; end if;
  ok := false;
  begin
    update public.professional_profiles set accepting_patients = true where user_id = '14000000-0000-4000-8000-0000000000c2';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional set accepting_patients directly'; end if;
  ok := false;
  begin perform public.pro_set_accepting(true); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'unverified professional turned on accepting patients'; end if;
  ok := false;
  begin
    update public.profiles set role = 'admin' where user_id = '14000000-0000-4000-8000-0000000000c2';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional changed their own role'; end if;

  -- Their own details are editable.
  update public.professional_profiles set bio = 'Genetic counselling in Arabic and English.' where user_id = '14000000-0000-4000-8000-0000000000c2';

  -- Even the guard trigger stops it if a grant is loosened by mistake.
  perform pg_temp.as_service();
  grant update (verification_status) on public.professional_profiles to authenticated;
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c2');
  ok := false;
  begin
    update public.professional_profiles set verification_status = 'verified' where user_id = '14000000-0000-4000-8000-0000000000c2';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'guard trigger let a professional verify themselves'; end if;
  perform pg_temp.as_service();
  revoke update (verification_status) on public.professional_profiles from authenticated;

  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c1');
  if public.pro_set_accepting(false) then raise exception 'toggle returned true'; end if;
  perform public.pro_set_accepting(true);
  raise notice 'ok: nobody sets their own verification_status or accepting_patients';
end $$;

-- ---------------------------------------------------------------------------
-- Submitting, and who can read submissions
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
  ok boolean;
  sid uuid;
  st text;
begin
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c2');
  -- Paths outside their own folder are refused.
  ok := false;
  begin
    insert into public.verification_submissions (id_document_paths, licence_document_paths, entered_licence_number, entered_authority, entered_expiry)
    values (array['14000000-0000-4000-8000-0000000000c1/x/id-1'], array['14000000-0000-4000-8000-0000000000c2/x/licence-1'], 'LIC-U', 'dha', current_date + 200);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'submission accepted someone else''s path'; end if;
  -- Status and the pre-check can't be forged.
  ok := false;
  begin
    insert into public.verification_submissions (status, id_document_paths, licence_document_paths, entered_licence_number, entered_authority, entered_expiry)
    values ('approved', array['14000000-0000-4000-8000-0000000000c2/x/id-1'], array['14000000-0000-4000-8000-0000000000c2/x/licence-1'], 'LIC-U', 'dha', current_date + 200);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'submission accepted a status'; end if;

  insert into public.verification_submissions (id_document_paths, licence_document_paths, selfie_path, entered_licence_number, entered_authority, entered_expiry)
  values (array['14000000-0000-4000-8000-0000000000c2/x/id-1', '14000000-0000-4000-8000-0000000000c2/x/id-2'],
          array['14000000-0000-4000-8000-0000000000c2/x/licence-1'], '14000000-0000-4000-8000-0000000000c2/x/selfie',
          'LIC-U-123', 'dha', current_date + 200)
  returning id into sid;

  select verification_status into st from public.professional_profiles where user_id = '14000000-0000-4000-8000-0000000000c2';
  if st <> 'pending' then raise exception 'status is % after submitting, expected pending', st; end if;
  select count(*) into n from public.notifications where kind = 'kyc_status' and kyc_status = 'pending';
  if n <> 1 then raise exception 'no pending notification'; end if;

  -- One open submission at a time.
  ok := false;
  begin
    insert into public.verification_submissions (id_document_paths, licence_document_paths, entered_licence_number, entered_authority, entered_expiry)
    values (array['14000000-0000-4000-8000-0000000000c2/y/id-1'], array['14000000-0000-4000-8000-0000000000c2/y/licence-1'], 'LIC-U', 'dha', current_date + 200);
  exception when insufficient_privilege or unique_violation then ok := true; end;
  if not ok then raise exception 'a second open submission was accepted'; end if;

  -- They read their own status, never the pre-check or paths.
  select count(*) into n from public.verification_submissions;
  if n <> 1 then raise exception 'professional reads % submissions', n; end if;
  ok := false;
  begin perform ai_precheck from public.verification_submissions; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional reads ai_precheck'; end if;
  ok := false;
  begin perform id_document_paths from public.verification_submissions; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional reads document paths'; end if;
  ok := false;
  begin perform public.kyc_admin_queue(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'professional opened the admin queue'; end if;

  -- Patients and other professionals read none.
  foreach st in array array['14000000-0000-4000-8000-0000000000a1', '14000000-0000-4000-8000-0000000000c1'] loop
    perform pg_temp.as_user(st);
    select count(*) into n from public.verification_submissions;
    if n <> 0 then raise exception '% reads submissions', st; end if;
    ok := false;
    begin perform 1 from public.verification_audit; exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% reads the audit trail', st; end if;
    ok := false;
    begin perform public.kyc_admin_submission(sid); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% opened a submission', st; end if;
    ok := false;
    begin perform public.kyc_admin_document_allowed(sid, '14000000-0000-4000-8000-0000000000c2/x/id-1');
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% passed the document check', st; end if;
  end loop;
  raise notice 'ok: submitting sets pending; only admins read submissions';
end $$;

-- ---------------------------------------------------------------------------
-- Admin review: view, approve, documents cleared, access unlocks
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
  sid uuid;
  detail jsonb;
  paths text[];
  s public.verification_submissions;
begin
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000d1');
  select id into sid from public.kyc_admin_queue() limit 1;
  if sid is null then raise exception 'admin queue is empty'; end if;
  detail := public.kyc_admin_submission(sid);
  if detail ->> 'status' <> 'in_review' then raise exception 'opening did not move to in_review'; end if;
  if not public.kyc_admin_document_allowed(sid, '14000000-0000-4000-8000-0000000000c2/x/id-1') then
    raise exception 'admin cannot open a document of the submission';
  end if;
  if public.kyc_admin_document_allowed(sid, '14000000-0000-4000-8000-0000000000c1/x/id-1') then
    raise exception 'admin document check allowed a path outside the submission';
  end if;
  perform public.kyc_admin_log(sid, 'document_viewed');

  -- An expired licence can't be approved.
  begin
    perform public.kyc_admin_approve(sid, 'LIC-U-123', 'dha', current_date - 1);
    raise exception 'approved an expired licence';
  exception when invalid_parameter_value then null;
  end;

  paths := public.kyc_admin_approve(sid, 'LIC-U-123', 'dha', current_date + 200);
  if cardinality(paths) <> 4 then raise exception 'approve returned % paths, expected 4', cardinality(paths); end if;

  perform pg_temp.as_service();
  select * into s from public.verification_submissions where id = sid;
  if s.status <> 'approved' or cardinality(s.id_document_paths) <> 0 or cardinality(s.licence_document_paths) <> 0 or s.selfie_path is not null then
    raise exception 'approved submission still holds document paths';
  end if;
  select count(*) into n from public.verification_audit where submission_id = sid and action in ('submitted', 'viewed', 'document_viewed', 'approved');
  if n <> 4 then raise exception 'audit has % of the 4 expected rows', n; end if;

  -- Append-only, even for the service role.
  begin
    update public.verification_audit set action = 'rejected' where submission_id = sid;
    raise exception 'audit row was updated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.verification_audit where submission_id = sid;
    raise exception 'audit row was deleted';
  exception when insufficient_privilege then null;
  end;

  -- U is now verified and sees the intake queue.
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c2');
  if not public.pro_is_counsellor() then raise exception 'approved professional is not verified'; end if;
  select count(*) into n from public.counsellor_requests where status = 'open';
  if n < 1 then raise exception 'approved professional sees no queue'; end if;
  raise notice 'ok: admin approval audits every step, clears documents and unlocks access';
end $$;

-- ---------------------------------------------------------------------------
-- Suspension and expiry lock access again
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
  ok boolean;
  avail boolean;
  expired uuid[];
begin
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000d1');
  n := public.kyc_admin_suspend('14000000-0000-4000-8000-0000000000c1', 'Licence under investigation');
  if n <> 1 then raise exception 'suspension flagged % bookings, expected 1', n; end if;

  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c1');
  select count(*) into n from public.counsellor_requests;
  if n <> 0 then raise exception 'suspended professional still sees requests'; end if;
  select count(*) into n from public.messages;
  if n <> 0 then raise exception 'suspended professional still reads messages'; end if;

  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.professional_directory() where user_id = '14000000-0000-4000-8000-0000000000c1';
  if n <> 0 then raise exception 'suspended professional is in the directory'; end if;
  select available into avail from public.my_pro_conversations() where professional_id = '14000000-0000-4000-8000-0000000000c1';
  if avail then raise exception 'conversation still shows the professional as available'; end if;
  select count(*) into n from public.messages;
  if n <> 1 then raise exception 'patient lost their own messages'; end if;
  ok := false;
  begin
    insert into public.messages (conversation_id, sender_id, body)
    values ('14000000-0000-4000-8000-0000000000cc', '14000000-0000-4000-8000-0000000000a1', 'Are you there?');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'patient could message a suspended professional'; end if;

  -- Expiry: access ends on the day, before the daily job runs.
  perform pg_temp.as_service();
  update public.professional_profiles set licence_expiry = current_date - 1 where user_id = '14000000-0000-4000-8000-0000000000c2';
  perform pg_temp.as_user('14000000-0000-4000-8000-0000000000c2');
  if public.pro_is_counsellor() then raise exception 'expired licence still counts as verified'; end if;
  select count(*) into n from public.counsellor_requests;
  if n <> 0 then raise exception 'expired professional still sees requests'; end if;

  ok := false;
  begin perform public.kyc_expire_licences(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a professional ran the expiry job'; end if;
  perform pg_temp.as_service();
  select array_agg(x) into expired from public.kyc_expire_licences() x;
  if expired is null or not ('14000000-0000-4000-8000-0000000000c2'::uuid = any (expired)) then
    raise exception 'expiry job did not expire U';
  end if;
  select count(*) into n from public.professional_profiles
   where user_id = '14000000-0000-4000-8000-0000000000c2' and verification_status = 'expired' and not accepting_patients;
  if n <> 1 then raise exception 'expired professional not marked expired'; end if;
  raise notice 'ok: suspension and expiry lock access immediately';
end $$;

-- ---------------------------------------------------------------------------
-- Storage: verification documents have no user access at all
-- ---------------------------------------------------------------------------
do $$
declare
  n integer;
  ok boolean;
begin
  perform pg_temp.as_service();
  select count(*) into n from storage.buckets where id = 'kyc-documents' and public = false;
  if n <> 1 then raise exception 'kyc-documents bucket missing or public'; end if;
  insert into storage.objects (bucket_id, name) values ('kyc-documents', '14000000-0000-4000-8000-0000000000c2/z/id-1');

  foreach n in array array[1, 2, 3] loop
    perform pg_temp.as_user(case n when 1 then '14000000-0000-4000-8000-0000000000c2'
                                   when 2 then '14000000-0000-4000-8000-0000000000a1'
                                   else '14000000-0000-4000-8000-0000000000d1' end);
    if exists (select 1 from storage.objects where bucket_id = 'kyc-documents') then
      raise exception 'a signed-in user can list verification documents';
    end if;
    ok := false;
    begin
      insert into storage.objects (bucket_id, name) values ('kyc-documents', '14000000-0000-4000-8000-0000000000c2/z/id-2');
    exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception 'a signed-in user can upload verification documents directly'; end if;
  end loop;
  raise notice 'ok: verification documents are reachable only by the server';
end $$;

rollback;
\o
select 'kyc: all checks passed' as result;
