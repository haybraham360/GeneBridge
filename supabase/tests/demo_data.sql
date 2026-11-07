-- Task 15, section 1: demo data is marked and removable. Run with
-- `npm run test:sql`. Rolls back; leaves nothing behind.
--
-- The rules under test:
--   - rows inherit is_demo from their owner, and signed-in users can never
--     set or clear it;
--   - only admins (or the service role) can count or remove demo data, and
--     never a real account;
--   - removing demo data leaves real accounts and their own data untouched.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: demo patient D, demo verified professional DP, real patient R,
-- real admin A.
insert into auth.users (id, raw_user_meta_data) values
  ('15100000-0000-4000-8000-0000000000d1', '{"display_name":"Demo D"}'),
  ('15100000-0000-4000-8000-0000000000d2', '{"display_name":"Demo Pro"}'),
  ('15100000-0000-4000-8000-0000000000a1', '{"display_name":"Real R"}'),
  ('15100000-0000-4000-8000-0000000000f1', '{"display_name":"Admin A"}');

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

select pg_temp.as_service();
update public.profiles set is_demo = true
 where user_id in ('15100000-0000-4000-8000-0000000000d1', '15100000-0000-4000-8000-0000000000d2');
update public.profiles set role = 'professional' where user_id = '15100000-0000-4000-8000-0000000000d2';
update public.profiles set role = 'admin' where user_id = '15100000-0000-4000-8000-0000000000f1';

insert into public.professional_profiles (user_id, display_name, profession, verification_status, licence_number, licence_authority, licence_expiry, accepting_patients)
values ('15100000-0000-4000-8000-0000000000d2', 'Demo Pro', 'genetic_counsellor', 'verified', '[SYNTHETIC]', 'doh_abu_dhabi', current_date + 365, true);
insert into public.facilities (id, name, code) values ('15100000-0000-4000-8000-0000000000ff', 'Intake', 'AAAA-DEMO-TEST');
insert into public.counsellors (id, user_id, name, facility_id)
values ('15100000-0000-4000-8000-0000000000e2', '15100000-0000-4000-8000-0000000000d2', 'Demo Pro', '15100000-0000-4000-8000-0000000000ff');

-- An unclaimed demo result (no owner yet): flagged by the service role.
insert into public.screening_results (id, reference_code, condition_code, status, genotype, flagged, is_demo)
values ('15100000-0000-4000-8000-00000000aa01', 'TEST-15-DEMO', 'sickle_cell', 'carrier', 'HbAS', false, true);
-- R's own result.
insert into public.screening_results (id, owner_id, claimed_at, reference_code, condition_code, status, genotype, flagged)
values ('15100000-0000-4000-8000-00000000aa02', '15100000-0000-4000-8000-0000000000a1', now(), 'TEST-15-REAL', 'sickle_cell', 'carrier', 'HbAS', false);

-- R's own request, and a booking and conversation with the demo professional.
insert into public.counsellor_requests (id, user_id, source, reason, urgency, status, facility_id) values
  ('15100000-0000-4000-8000-0000000000b1', '15100000-0000-4000-8000-0000000000a1', 'booking', 'asked_for_person', 'standard', 'booked', '15100000-0000-4000-8000-0000000000ff');
insert into public.bookings (id, request_id, counsellor_id, starts_at, format) values
  ('15100000-0000-4000-8000-0000000000c1', '15100000-0000-4000-8000-0000000000b1', '15100000-0000-4000-8000-0000000000e2', now() + interval '2 days', 'video');
insert into public.pro_conversations (id, patient_id, professional_id) values
  ('15100000-0000-4000-8000-0000000000cc', '15100000-0000-4000-8000-0000000000a1', '15100000-0000-4000-8000-0000000000d2');
insert into public.pro_messages (conversation_id, sender_id, body) values
  ('15100000-0000-4000-8000-0000000000cc', '15100000-0000-4000-8000-0000000000a1', 'Hello');
insert into public.share_grants (owner_id, grantee_id, resource, level) values
  ('15100000-0000-4000-8000-0000000000a1', '15100000-0000-4000-8000-0000000000d2', 'result', 'summary');

-- ---------------------------------------------------------------------------
-- Rows inherit the flag; signed-in users can't set or clear it
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean;
  flag boolean;
begin
  -- D's own rows are demo, even though D never asked for that.
  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000d1');
  insert into public.events (name, props) values ('directory_viewed', '{}');
  insert into public.followed_conditions (condition_id, reason) values ('sickle_cell', 'learning');
  perform pg_temp.as_service();
  if exists (select 1 from public.events where user_id = '15100000-0000-4000-8000-0000000000d1' and not is_demo) then
    raise exception 'a demo user''s event is not marked demo';
  end if;
  if exists (select 1 from public.followed_conditions where user_id = '15100000-0000-4000-8000-0000000000d1' and not is_demo) then
    raise exception 'a demo user''s followed condition is not marked demo';
  end if;

  -- D can't clear it.
  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000d1');
  update public.followed_conditions set is_demo = false where user_id = '15100000-0000-4000-8000-0000000000d1';
  perform pg_temp.as_service();
  select is_demo into flag from public.followed_conditions where user_id = '15100000-0000-4000-8000-0000000000d1';
  if not flag then raise exception 'a signed-in user cleared is_demo'; end if;

  -- R can't set it (which would get their real data purged).
  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000a1');
  insert into public.events (name, props, is_demo) values ('directory_viewed', '{}', true);
  insert into public.followed_conditions (condition_id, reason, is_demo) values ('sickle_cell', 'learning', true);
  update public.followed_conditions set is_demo = true where user_id = '15100000-0000-4000-8000-0000000000a1';
  ok := false;
  begin
    update public.profiles set is_demo = true where user_id = '15100000-0000-4000-8000-0000000000a1';
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a signed-in user can write profiles.is_demo'; end if;
  perform pg_temp.as_service();
  if exists (select 1 from public.events where user_id = '15100000-0000-4000-8000-0000000000a1' and is_demo)
     or exists (select 1 from public.followed_conditions where user_id = '15100000-0000-4000-8000-0000000000a1' and is_demo)
     or exists (select 1 from public.profiles where user_id = '15100000-0000-4000-8000-0000000000a1' and is_demo) then
    raise exception 'a real user marked their own data as demo';
  end if;

  -- The unclaimed result keeps its flag; R's result has none.
  if not (select is_demo from public.screening_results where id = '15100000-0000-4000-8000-00000000aa01') then
    raise exception 'the service role could not flag an ownerless demo row';
  end if;
  if (select is_demo from public.screening_results where id = '15100000-0000-4000-8000-00000000aa02') then
    raise exception 'a real result is marked demo';
  end if;

  -- Linked to the demo professional: the booking, conversation, messages and
  -- grant are demo. R's own request is not.
  if not (select is_demo from public.bookings where id = '15100000-0000-4000-8000-0000000000c1') then
    raise exception 'a booking with a demo professional is not demo';
  end if;
  if not (select is_demo from public.pro_conversations where id = '15100000-0000-4000-8000-0000000000cc') then
    raise exception 'a conversation with a demo professional is not demo';
  end if;
  if exists (select 1 from public.pro_messages where conversation_id = '15100000-0000-4000-8000-0000000000cc' and not is_demo) then
    raise exception 'a message in a demo conversation is not demo';
  end if;
  if exists (select 1 from public.share_grants where grantee_id = '15100000-0000-4000-8000-0000000000d2' and not is_demo) then
    raise exception 'a grant to a demo professional is not demo';
  end if;
  if (select is_demo from public.counsellor_requests where id = '15100000-0000-4000-8000-0000000000b1') then
    raise exception 'a real user''s own request is marked demo';
  end if;
  raise notice 'ok: rows inherit is_demo from their owner; users cannot set or clear it';
end $$;

-- ---------------------------------------------------------------------------
-- Only admins count and remove demo data, and never a real account
-- ---------------------------------------------------------------------------
do $$
declare
  ok boolean;
  who text;
  counts jsonb;
begin
  foreach who in array array['15100000-0000-4000-8000-0000000000a1', '15100000-0000-4000-8000-0000000000d1', '15100000-0000-4000-8000-0000000000d2'] loop
    perform pg_temp.as_user(who);
    ok := false;
    begin perform public.demo_admin_counts(); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% (not an admin) can count demo data', who; end if;
    ok := false;
    begin perform public.demo_admin_purge_all(); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% (not an admin) can remove demo data', who; end if;
  end loop;

  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000f1');
  counts := public.demo_admin_counts();
  if (counts ->> 'accounts')::int < 2 then raise exception 'demo accounts not counted: %', counts; end if;
  if (select count(*) from public.demo_admin_accounts() where user_id = '15100000-0000-4000-8000-0000000000a1') > 0 then
    raise exception 'a real account is listed as demo';
  end if;

  ok := false;
  begin perform public.demo_admin_purge_account('15100000-0000-4000-8000-0000000000a1');
  exception when invalid_parameter_value then ok := true; end;
  if not ok then raise exception 'an admin can remove a real account as demo data'; end if;
  raise notice 'ok: only admins count or remove demo data, never a real account';
end $$;

-- ---------------------------------------------------------------------------
-- Removing one demo account, then all demo data
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  n bigint;
begin
  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000f1');
  perform public.demo_admin_purge_account('15100000-0000-4000-8000-0000000000d1');
  perform pg_temp.as_service();
  if exists (select 1 from public.events where user_id = '15100000-0000-4000-8000-0000000000d1')
     or exists (select 1 from public.followed_conditions where user_id = '15100000-0000-4000-8000-0000000000d1') then
    raise exception 'removing one demo account left its rows';
  end if;
  if not exists (select 1 from public.pro_conversations where id = '15100000-0000-4000-8000-0000000000cc') then
    raise exception 'removing one demo account removed another account''s rows';
  end if;

  perform pg_temp.as_user('15100000-0000-4000-8000-0000000000f1');
  perform public.demo_admin_purge_all();
  perform pg_temp.as_service();
  for t in select table_name from demo_private.flagged_tables loop
    execute format('select count(*) from public.%I where is_demo', t) into n;
    if n > 0 then raise exception '% demo rows left in %', n, t; end if;
  end loop;

  -- Real data is untouched: R's own result, request and event.
  if not exists (select 1 from public.screening_results where id = '15100000-0000-4000-8000-00000000aa02')
     or not exists (select 1 from public.counsellor_requests where id = '15100000-0000-4000-8000-0000000000b1')
     or not exists (select 1 from public.events where user_id = '15100000-0000-4000-8000-0000000000a1')
     or not exists (select 1 from public.profiles where user_id = '15100000-0000-4000-8000-0000000000a1') then
    raise exception 'removing demo data touched a real account';
  end if;

  if (select count(*) from public.demo_purge_audit
       where actor_id = '15100000-0000-4000-8000-0000000000f1' and action = 'rows_deleted') <> 2 then
    raise exception 'removals were not audited';
  end if;
  raise notice 'ok: one account or all demo data removed; real data untouched; audited';
end $$;

do $$
declare
  ok boolean := false;
begin
  begin
    delete from public.demo_purge_audit;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the demo purge audit can be deleted'; end if;
  raise notice 'ok: the demo purge audit is append-only';
end $$;

rollback;
\o
select 'demo_data: all checks passed' as result;
