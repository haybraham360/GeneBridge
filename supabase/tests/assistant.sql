-- Task 06: access rules for Ask GeneBridge tables. Run with `npm run test:sql`.
-- Rolls back; leaves nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: two people, two counsellors in different facilities.
insert into auth.users (id) values
  ('7e570000-0000-4000-8000-0000000000a1'),  -- person A
  ('7e570000-0000-4000-8000-0000000000b2'),  -- person B
  ('7e570000-0000-4000-8000-0000000000c3'),  -- counsellor C, facility F
  ('7e570000-0000-4000-8000-0000000000d4');  -- counsellor D, facility G
insert into public.counsellors (user_id, name, facility_code) values
  ('7e570000-0000-4000-8000-0000000000c3', 'Test C', 'AAA-TEST-F'),
  ('7e570000-0000-4000-8000-0000000000d4', 'Test D', 'ZZZ-TEST-G');
-- Task 07: counsellor access also needs the counsellor role on the profile.
-- Set as the service role (profiles_guard blocks role changes otherwise).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set role = 'counsellor'
 where user_id in ('7e570000-0000-4000-8000-0000000000c3', '7e570000-0000-4000-8000-0000000000d4');

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;

-- A writes a conversation and two requests (one shared, one not).
do $$
declare conv uuid; r1 uuid; r2 uuid; s text;
begin
  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000a1');
  insert into public.assistant_conversations (locale) values ('en') returning id into conv;
  insert into public.assistant_messages (conversation_id, role, content) values (conv, 'user', 'hello');

  r1 := public.create_counsellor_request('pregnancy', 'priority', false, 'should be dropped');
  r2 := public.create_counsellor_request('outside_library', 'standard', true, 'Wants to talk about testing.');
  select summary into s from public.counsellor_requests where id = r1;
  if s is not null then raise exception 'unshared summary was stored'; end if;
  select summary into s from public.counsellor_requests where id = r2;
  if s is distinct from 'Wants to talk about testing.' then raise exception 'shared summary missing'; end if;
  if (select count(*) from public.counsellor_requests) <> 2 then raise exception 'A cannot see own requests'; end if;

  begin
    insert into public.counsellor_requests (user_id, reason, urgency)
    values ('7e570000-0000-4000-8000-0000000000a1', 'pregnancy', 'priority');
    raise exception 'direct insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform facility_code from public.counsellor_requests limit 1;
    raise exception 'facility code readable';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  raise notice 'ok: owner writes and reads own; summary only when shared; no direct insert';
end $$;

-- B sees none of A's data.
do $$
begin
  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000b2');
  if exists (select 1 from public.assistant_messages) then raise exception 'B reads A messages'; end if;
  if exists (select 1 from public.assistant_conversations) then raise exception 'B reads A conversations'; end if;
  if exists (select 1 from public.counsellor_requests) then raise exception 'B reads A requests'; end if;
  execute 'reset role';
  raise notice 'ok: other users see nothing';
end $$;

-- Counsellor C (facility of the request) sees open requests; D does not.
do $$
begin
  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000c3');
  if (select count(*) from public.counsellor_requests) <> 2 then raise exception 'C cannot see facility queue'; end if;
  if exists (select 1 from public.assistant_messages) then raise exception 'C reads conversations'; end if;
  execute 'reset role';

  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000d4');
  if exists (select 1 from public.counsellor_requests) then raise exception 'D sees another facility'; end if;
  execute 'reset role';
  raise notice 'ok: counsellors see only their facility queue';
end $$;

-- Once booked and assigned to D, C no longer sees it and D does.
update public.counsellor_requests
   set status = 'booked',
       assigned_counsellor_id = (select id from public.counsellors where facility_code = 'ZZZ-TEST-G')
 where reason = 'pregnancy';
do $$
begin
  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000d4');
  if (select count(*) from public.counsellor_requests) <> 1 then raise exception 'D cannot see assigned request'; end if;
  if (select summary from public.counsellor_requests limit 1) is not null then raise exception 'unshared summary visible'; end if;
  execute 'reset role';
  perform pg_temp.as_user('7e570000-0000-4000-8000-0000000000c3');
  if (select count(*) from public.counsellor_requests) <> 1 then raise exception 'C still sees booked request'; end if;
  execute 'reset role';
  raise notice 'ok: assigned requests go to the assigned counsellor only';
end $$;

rollback;
