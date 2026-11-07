-- Task 15, sections 2 and 4: directory, availability and booking. Run with
-- `npm run test:sql`. Rolls back; leaves nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: patients P and Q; professional D (Dubai, buffer 10, max 2 a
-- day), professional L (London, auto-accept), unverified professional U.
insert into auth.users (id, raw_user_meta_data) values
  ('15400000-0000-4000-8000-0000000000a1', '{"display_name":"Patient P"}'),
  ('15400000-0000-4000-8000-0000000000a2', '{"display_name":"Patient Q"}'),
  ('15400000-0000-4000-8000-0000000000d1', '{"display_name":"Dr Dubai"}'),
  ('15400000-0000-4000-8000-0000000000d2', '{"display_name":"Dr London"}'),
  ('15400000-0000-4000-8000-0000000000d3', '{"display_name":"Dr Unverified"}');

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
-- A date a few days ahead, at a local wall-clock time, as UTC.
create function pg_temp.at(days int, hhmm text, tz text) returns timestamptz language sql as $$
  select ((current_date + days)::text || ' ' || hhmm)::timestamp at time zone tz
$$;

select pg_temp.as_service();
update public.profiles set role = 'professional', locale = 'en'
 where user_id in ('15400000-0000-4000-8000-0000000000d1', '15400000-0000-4000-8000-0000000000d2', '15400000-0000-4000-8000-0000000000d3');
update public.profiles set locale = 'ar' where user_id = '15400000-0000-4000-8000-0000000000a1';
insert into public.facilities (id, name, code) values ('15400000-0000-4000-8000-0000000000ff', 'Intake', 'AAAA-BOOK-TEST');
insert into public.professional_profiles (user_id, display_name, profession, languages, specialties, verification_status,
  licence_number, licence_authority, licence_expiry, accepting_patients, time_zone, buffer_minutes, max_sessions_per_day, auto_accept_bookings) values
  ('15400000-0000-4000-8000-0000000000d1', 'Dr Dubai', 'genetic_counsellor', '{ar,en}', '{haemoglobin_disorders}', 'verified', 'LIC-D', 'doh_abu_dhabi', current_date + 365, true, 'Asia/Dubai', 10, 2, false),
  ('15400000-0000-4000-8000-0000000000d2', 'Dr London', 'medical_geneticist', '{en}', '{}', 'verified', 'LIC-L', 'dha', current_date + 365, true, 'Europe/London', 0, null, true),
  ('15400000-0000-4000-8000-0000000000d3', 'Dr Unverified', 'nurse', '{ar}', '{}', 'unverified', null, null, null, false, 'Asia/Dubai', 10, null, false);
insert into public.counsellors (id, user_id, name, facility_id) values
  ('15400000-0000-4000-8000-0000000000e1', '15400000-0000-4000-8000-0000000000d1', 'Dr Dubai', '15400000-0000-4000-8000-0000000000ff'),
  ('15400000-0000-4000-8000-0000000000e2', '15400000-0000-4000-8000-0000000000d2', 'Dr London', '15400000-0000-4000-8000-0000000000ff');
-- Every day 09:00–11:00 local. D: 30-minute video sessions. L: 60-minute in-person.
insert into public.availability_rules (user_id, weekday, start_time, end_time, session_minutes, format)
select '15400000-0000-4000-8000-0000000000d1', d, '09:00', '11:00', 30, 'video' from generate_series(0, 6) d;
insert into public.availability_rules (user_id, weekday, start_time, end_time, session_minutes, format)
select '15400000-0000-4000-8000-0000000000d2', d, '09:00', '11:00', 60, 'in_person' from generate_series(0, 6) d;
insert into public.availability_rules (user_id, weekday, start_time, end_time, session_minutes, format)
select '15400000-0000-4000-8000-0000000000d3', d, '09:00', '11:00', 30, 'video' from generate_series(0, 6) d;

-- ---------------------------------------------------------------------------
-- Directory and slots
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
  first timestamptz;
begin
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.professional_directory() where user_id = '15400000-0000-4000-8000-0000000000d3';
  if n <> 0 then raise exception 'an unverified professional is in the directory'; end if;
  select count(*) into n from public.professional_directory() where user_id in ('15400000-0000-4000-8000-0000000000d1', '15400000-0000-4000-8000-0000000000d2');
  if n <> 2 then raise exception 'verified professionals missing from the directory (%)', n; end if;
  if (select next_slot from public.professional_directory() where user_id = '15400000-0000-4000-8000-0000000000d1') is null then
    raise exception 'no next slot shown';
  end if;
  select count(*) into n from public.free_slots('15400000-0000-4000-8000-0000000000d3', now(), now() + interval '7 days');
  if n <> 0 then raise exception 'an unverified professional has bookable slots'; end if;

  -- Dubai: 09:00 local is 05:00 UTC. 30-minute sessions + 10-minute buffer
  -- in 09:00–11:00: 09:00, 09:40, 10:20 (10:20–10:50 fits; 11:00 doesn't).
  select count(*), min(starts_at) into n, first from public.free_slots('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '00:00', 'Asia/Dubai'), pg_temp.at(4, '00:00', 'Asia/Dubai'));
  if n <> 3 then raise exception 'Dubai: expected 3 slots a day with the buffer, got %', n; end if;
  if first <> pg_temp.at(3, '09:00', 'Asia/Dubai') then raise exception 'Dubai: first slot % is not 09:00 local', first; end if;
  if extract(hour from first at time zone 'UTC') <> 5 then raise exception 'Dubai: 09:00 local should be 05:00 UTC'; end if;

  -- London: 09:00 local in the professional's own zone (not Dubai's).
  select min(starts_at) into first from public.free_slots('15400000-0000-4000-8000-0000000000d2', pg_temp.at(3, '00:00', 'Europe/London'), pg_temp.at(4, '00:00', 'Europe/London'));
  if first <> pg_temp.at(3, '09:00', 'Europe/London') then raise exception 'London: first slot % is not 09:00 London time', first; end if;
  raise notice 'ok: directory shows only bookable professionals; slots follow each time zone and the buffer';
end $$;

-- Exceptions: a day off removes the day; an extra slot adds one.
do $$
declare
  n int;
begin
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d1');
  insert into public.availability_exceptions (kind, starts_at, ends_at)
  values ('day_off', pg_temp.at(5, '00:00', 'Asia/Dubai'), pg_temp.at(6, '00:00', 'Asia/Dubai'));
  insert into public.availability_exceptions (kind, starts_at, ends_at, session_minutes, format)
  values ('extra_slot', pg_temp.at(6, '18:00', 'Asia/Dubai'), pg_temp.at(6, '18:45', 'Asia/Dubai'), 45, 'in_person');

  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.free_slots('15400000-0000-4000-8000-0000000000d1', pg_temp.at(5, '00:00', 'Asia/Dubai'), pg_temp.at(6, '00:00', 'Asia/Dubai'));
  if n <> 0 then raise exception 'a day off still has % slots', n; end if;
  select count(*) into n from public.free_slots('15400000-0000-4000-8000-0000000000d1', pg_temp.at(6, '00:00', 'Asia/Dubai'), pg_temp.at(7, '00:00', 'Asia/Dubai'))
   where starts_at = pg_temp.at(6, '18:00', 'Asia/Dubai') and format = 'in_person';
  if n <> 1 then raise exception 'the extra slot is missing'; end if;
  -- Another professional can't see or change D's exceptions.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d2');
  select count(*) into n from public.availability_exceptions;
  if n <> 0 then raise exception 'a professional reads another''s exceptions'; end if;
  raise notice 'ok: days off and extra slots are respected';
end $$;

-- ---------------------------------------------------------------------------
-- Booking
-- ---------------------------------------------------------------------------
do $$
declare
  res jsonb;
  ok boolean;
  n int;
  b public.bookings;
begin
  -- P books D at 09:00 in 3 days, sharing the result summary.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  res := public.book_session('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '09:00', 'Asia/Dubai'), 'video', array['result'], true, false);
  if res ->> 'status' <> 'requested' then raise exception 'booking should wait for the professional: %', res; end if;
  perform pg_temp.as_service();
  select * into b from public.bookings where id = (res ->> 'id')::uuid;
  if b.request_id is null or b.counsellor_id <> '15400000-0000-4000-8000-0000000000e1' or not b.send_calendar_invite then
    raise exception 'booking not linked to a request and counsellor';
  end if;
  if not exists (select 1 from public.share_grants where owner_id = b.patient_id and grantee_id = b.professional_id and resource = 'result' and revoked_at is null) then
    raise exception 'the chosen share was not granted';
  end if;
  if not exists (select 1 from public.notifications where user_id = b.professional_id and kind = 'booking_requested' and booking_id = b.id) then
    raise exception 'the professional was not notified';
  end if;

  -- The same slot again: refused cleanly.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a2');
  ok := false;
  begin
    perform public.book_session('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '09:00', 'Asia/Dubai'), 'video');
  exception when raise_exception then ok := sqlerrm = 'slot_unavailable'; end;
  if not ok then raise exception 'a second patient booked a taken slot'; end if;
  -- The next slot (09:40) is free; 09:20 would break the buffer and isn't offered.
  select count(*) into n from public.free_slots('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '00:00', 'Asia/Dubai'), pg_temp.at(4, '00:00', 'Asia/Dubai'))
   where starts_at = pg_temp.at(3, '09:40', 'Asia/Dubai');
  if n <> 1 then raise exception 'the slot after the buffer is not free'; end if;

  -- Even a direct overlapping insert is impossible (exclusion constraint).
  perform pg_temp.as_service();
  ok := false;
  begin
    insert into public.bookings (professional_id, patient_id, starts_at, ends_at, format, status)
    values ('15400000-0000-4000-8000-0000000000d1', '15400000-0000-4000-8000-0000000000a2',
            pg_temp.at(3, '09:15', 'Asia/Dubai'), pg_temp.at(3, '09:45', 'Asia/Dubai'), 'video', 'requested');
  exception when exclusion_violation then ok := true; end;
  if not ok then raise exception 'two live bookings overlap'; end if;

  -- Q can't read P's booking; D reads it; L doesn't.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a2');
  select count(*) into n from public.bookings where patient_id = '15400000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'a patient reads another patient''s booking'; end if;
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.pro_bookings(now(), now() + interval '30 days');
  if n <> 1 then raise exception 'the professional doesn''t see their booking'; end if;
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d2');
  select count(*) into n from public.bookings;
  if n <> 0 then raise exception 'a professional reads another professional''s bookings'; end if;

  -- An unverified professional can't be booked.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a2');
  ok := false;
  begin
    perform public.book_session('15400000-0000-4000-8000-0000000000d3', pg_temp.at(3, '09:00', 'Asia/Dubai'), 'video');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'an unverified professional was booked'; end if;

  -- Max 2 a day: after a second booking that day, no slots remain.
  perform public.book_session('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '10:20', 'Asia/Dubai'), 'video');
  select count(*) into n from public.free_slots('15400000-0000-4000-8000-0000000000d1', pg_temp.at(3, '00:00', 'Asia/Dubai'), pg_temp.at(4, '00:00', 'Asia/Dubai'));
  if n <> 0 then raise exception 'the daily maximum is not respected (% slots left)', n; end if;

  -- Auto-accept: L confirms at once.
  res := public.book_session('15400000-0000-4000-8000-0000000000d2', pg_temp.at(4, '09:00', 'Europe/London'), 'in_person');
  if res ->> 'status' <> 'confirmed' then raise exception 'auto-accept did not confirm'; end if;
  raise notice 'ok: booking, one booking per slot, buffers, daily maximum, who reads what, auto-accept';
end $$;

-- ---------------------------------------------------------------------------
-- Responding, rescheduling, cancelling, completing, reminders
-- ---------------------------------------------------------------------------
do $$
declare
  bid uuid;
  ok boolean;
  st text;
  res jsonb;
  n int;
begin
  perform pg_temp.as_service();
  select id into bid from public.bookings where patient_id = '15400000-0000-4000-8000-0000000000a1' and status = 'requested';

  -- Only the professional confirms.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  ok := false;
  begin perform public.pro_respond_booking(bid, true); exception when no_data_found then ok := true; end;
  if not ok then raise exception 'a patient confirmed their own booking'; end if;
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d1');
  st := public.pro_respond_booking(bid, true);
  if st <> 'confirmed' then raise exception 'confirm failed'; end if;

  -- The patient reschedules to 09:40 on day 7 (needs the professional again).
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  res := public.reschedule_booking(bid, pg_temp.at(7, '09:40', 'Asia/Dubai'), 'Clash with work');
  if res ->> 'status' <> 'requested' then raise exception 'a patient''s reschedule should need confirming'; end if;
  perform pg_temp.as_service();
  if not exists (select 1 from public.notifications where booking_id = bid and kind = 'booking_changed'
                  and user_id = '15400000-0000-4000-8000-0000000000d1') then
    raise exception 'reschedule did not notify the professional';
  end if;

  -- Within the cut-off the patient can't change it.
  update public.bookings set starts_at = now() + interval '2 hours', ends_at = now() + interval '150 minutes', status = 'confirmed' where id = bid;
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  ok := false;
  begin perform public.cancel_booking(bid, 'late'); exception when raise_exception then ok := sqlerrm = 'too_late_to_change'; end;
  if not ok then raise exception 'a patient cancelled inside the cut-off'; end if;

  -- Reminders: the 1-hour one isn't due yet, the 24-hour one is, once.
  perform pg_temp.as_service();
  perform public.queue_booking_reminders();
  perform public.queue_booking_reminders();
  select count(*) into n from public.notifications where booking_id = bid and kind = 'booking_reminder';
  if n <> 2 then raise exception 'expected one reminder each for patient and professional, got %', n; end if;

  -- The professional can cancel late, with a reason; the patient is told.
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d1');
  res := public.cancel_booking(bid, 'Unwell today');
  perform pg_temp.as_service();
  if not exists (select 1 from public.notifications where booking_id = bid and kind = 'booking_cancelled'
                  and user_id = '15400000-0000-4000-8000-0000000000a1') then
    raise exception 'cancel did not notify the patient';
  end if;

  -- Completing a past confirmed session logs session_attended.
  select id into bid from public.bookings where professional_id = '15400000-0000-4000-8000-0000000000d2';
  update public.bookings set starts_at = now() - interval '30 minutes', ends_at = now() + interval '30 minutes' where id = bid;
  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d2');
  perform public.pro_complete_booking(bid, 'completed');
  perform pg_temp.as_service();
  if (select status from public.bookings where id = bid) <> 'completed'
     or not exists (select 1 from public.events where name = 'session_attended' and user_id = '15400000-0000-4000-8000-0000000000a2') then
    raise exception 'completing did not record attendance';
  end if;
  raise notice 'ok: confirm, reschedule, cut-off, reminders once, cancel, complete';
end $$;

-- ---------------------------------------------------------------------------
-- Offers on open requests
-- ---------------------------------------------------------------------------
do $$
declare
  rid uuid;
  oid uuid;
  n int;
  pro uuid;
begin
  -- P (Arabic) has an open escalation. D speaks Arabic; L doesn't.
  perform pg_temp.as_service();
  insert into public.counsellor_requests (id, user_id, source, reason, urgency, status)
  values ('15400000-0000-4000-8000-0000000000b9', '15400000-0000-4000-8000-0000000000a1', 'ai_escalation', 'pregnancy', 'priority', 'open')
  returning id into rid;

  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d2');
  select count(*) into n from public.pro_open_requests() where id = rid;
  if n <> 0 then raise exception 'a professional who doesn''t speak the patient''s language sees the request'; end if;

  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.pro_open_requests() where id = rid;
  if n <> 1 then raise exception 'a matching professional doesn''t see the request'; end if;
  perform public.pro_offer_request(rid);

  perform pg_temp.as_user('15400000-0000-4000-8000-0000000000a1');
  select offer_id into oid from public.my_request_offers() where request_id = rid;
  if oid is null then raise exception 'the patient doesn''t see the offer'; end if;
  pro := public.accept_request_offer(oid);
  perform pg_temp.as_service();
  if (select assigned_counsellor_id from public.counsellor_requests where id = rid) <> '15400000-0000-4000-8000-0000000000e1' then
    raise exception 'accepting the offer did not assign the request';
  end if;
  raise notice 'ok: open requests reach professionals in the patient''s language; the patient accepts an offer';
end $$;

rollback;
\o
select 'booking: all checks passed' as result;
