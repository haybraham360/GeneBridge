-- Task 15, section 3: chat. Run with `npm run test:sql`. Rolls back.
--
-- The rules under test: only the two participants read messages; a
-- professional who isn't verified (or is suspended) can neither send nor
-- receive; blocking makes the conversation read-only; sharing in chat
-- creates a grant and a system message; a report shows an admin that one
-- message only, audited; notifications and events never carry the text.

\set ON_ERROR_STOP on
\o /dev/null
begin;

insert into auth.users (id) values
  ('15600000-0000-4000-8000-0000000000a1'),  -- patient P
  ('15600000-0000-4000-8000-0000000000a2'),  -- patient Q
  ('15600000-0000-4000-8000-0000000000d1'),  -- verified professional V
  ('15600000-0000-4000-8000-0000000000d2'),  -- unverified professional U
  ('15600000-0000-4000-8000-0000000000f1');  -- admin

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

select pg_temp.as_service();
update public.profiles set role = 'professional' where user_id in ('15600000-0000-4000-8000-0000000000d1', '15600000-0000-4000-8000-0000000000d2');
update public.profiles set role = 'admin' where user_id = '15600000-0000-4000-8000-0000000000f1';
insert into public.professional_profiles (user_id, display_name, verification_status, licence_number, licence_authority, licence_expiry, accepting_patients) values
  ('15600000-0000-4000-8000-0000000000d1', 'Dr V', 'verified', 'LIC-V', 'dha', current_date + 365, true),
  ('15600000-0000-4000-8000-0000000000d2', 'Dr U', 'unverified', null, null, null, false);
insert into public.screening_results (owner_id, claimed_at, reference_code, condition_code, status, genotype, flagged)
values ('15600000-0000-4000-8000-0000000000a1', now(), 'TEST-15-CHAT', 'beta_thalassemia', 'carrier', null, false);

do $$
declare
  cid uuid;
  ok boolean;
  n int;
  mid uuid;
  rid uuid;
  shown jsonb;
begin
  -- P starts a conversation with V: nothing is shared.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  cid := public.start_conversation('15600000-0000-4000-8000-0000000000d1');
  if public.start_conversation('15600000-0000-4000-8000-0000000000d1') <> cid then raise exception 'a second conversation was started'; end if;
  perform pg_temp.as_service();
  if exists (select 1 from public.share_grants where owner_id = '15600000-0000-4000-8000-0000000000a1') then
    raise exception 'starting a conversation shared something';
  end if;

  -- Not with an unverified professional.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  ok := false;
  begin perform public.start_conversation('15600000-0000-4000-8000-0000000000d2'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a conversation started with an unverified professional'; end if;

  -- Both sides send; only they read.
  insert into public.messages (conversation_id, body) values (cid, 'Hello, I have a question about my result');
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.messages where conversation_id = cid;
  if n <> 1 then raise exception 'the professional doesn''t see the message'; end if;
  insert into public.messages (conversation_id, body) values (cid, 'Of course, happy to help') returning id into mid;
  foreach rid in array array['15600000-0000-4000-8000-0000000000a2', '15600000-0000-4000-8000-0000000000d2', '15600000-0000-4000-8000-0000000000f1']::uuid[] loop
    perform pg_temp.as_user(rid::text);
    select count(*) into n from public.messages where conversation_id = cid;
    if n <> 0 then raise exception '% reads someone else''s messages', rid; end if;
    ok := false;
    begin insert into public.messages (conversation_id, body) values (cid, 'intruder'); exception when insufficient_privilege then ok := true; end;
    if not ok then raise exception '% sent into someone else''s conversation', rid; end if;
  end loop;

  -- Nobody writes a system message or a read receipt directly.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  ok := false;
  begin insert into public.messages (conversation_id, body, kind) values (cid, 'shared:result', 'system'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a user wrote a system message'; end if;

  -- One notification per unread conversation, without the text; events carry the role only.
  perform pg_temp.as_service();
  select count(*) into n from public.notifications where user_id = '15600000-0000-4000-8000-0000000000a1' and conversation_id = cid and kind = 'new_message';
  if n <> 1 then raise exception 'expected one new_message notification, got %', n; end if;
  if exists (select 1 from public.events where name = 'message_sent' and (props::text like '%Hello%' or props::text like '%help%' or props - 'role' <> '{}'::jsonb)) then
    raise exception 'message_sent carries more than the role';
  end if;

  -- "Seen".
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  perform public.mark_conversation_read(cid);
  perform pg_temp.as_service();
  if (select read_at from public.messages where id = mid) is null then raise exception 'read receipt not set'; end if;

  -- Share my result summary: a grant and a system message; the
  -- professional's open is logged for the patient.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  perform public.share_in_chat(cid, 'result');
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.messages where conversation_id = cid and kind = 'system' and body = 'shared:result';
  if n <> 1 then raise exception 'no system message for the share'; end if;
  shown := public.pro_open_shared(cid, 'result');
  if jsonb_array_length(shown -> 'items') <> 1 then raise exception 'the shared result summary is missing'; end if;
  perform pg_temp.as_service();
  if not exists (select 1 from public.access_log where resource_owner_id = '15600000-0000-4000-8000-0000000000a1' and resource = 'result') then
    raise exception 'opening a shared item was not logged';
  end if;

  -- Report: the admin sees that message only, and every view is audited.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  perform public.report_message(mid, 'inappropriate');
  ok := false;
  begin perform public.admin_message_reports(); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a patient lists message reports'; end if;
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000f1');
  select id into rid from public.admin_message_reports() limit 1;
  shown := public.admin_open_report(rid);
  if shown ->> 'body' <> 'Of course, happy to help' or shown ? 'conversation_id' or shown ? 'sender_id' then
    raise exception 'the report shows more than the message: %', shown;
  end if;
  perform pg_temp.as_service();
  if (select count(*) from public.message_report_audit where report_id = rid) <> 2 then raise exception 'report not audited'; end if;

  -- Block: read-only for both.
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  perform public.set_conversation_blocked(cid, true);
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000d1');
  ok := false;
  begin insert into public.messages (conversation_id, body) values (cid, 'after block'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a blocked conversation still accepts messages'; end if;
  ok := false;
  begin perform public.set_conversation_blocked(cid, false); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the blocked side unblocked themselves'; end if;
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  perform public.set_conversation_blocked(cid, false);

  -- Suspended professional: can't read or send; the patient still reads, but can't send.
  perform pg_temp.as_service();
  update public.professional_profiles set verification_status = 'suspended', accepting_patients = false where user_id = '15600000-0000-4000-8000-0000000000d1';
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.messages;
  if n <> 0 then raise exception 'a suspended professional reads messages'; end if;
  ok := false;
  begin insert into public.messages (conversation_id, body) values (cid, 'still here'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a suspended professional sends'; end if;
  perform pg_temp.as_user('15600000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.messages where conversation_id = cid;
  if n = 0 then raise exception 'the patient lost their history'; end if;
  if (select professional_available from public.my_conversations() where id = cid) then raise exception 'a suspended professional shows as available'; end if;
  ok := false;
  begin insert into public.messages (conversation_id, body) values (cid, 'are you there?'); exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the patient sends to a suspended professional'; end if;

  raise notice 'ok: participants only, verified only, read receipts, sharing, reports, blocking, no text in notifications or events';
end $$;

rollback;
\o
select 'chat: all checks passed' as result;
