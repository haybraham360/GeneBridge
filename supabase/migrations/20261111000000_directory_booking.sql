-- Task 15, sections 2 and 4: the professional directory, availability and
-- booking.
--
-- Guardrail 15: only a verified professional who is accepting patients
-- appears in the directory or can be booked; every check is here, in the
-- database. Guardrail 18: nothing here puts health information on a
-- calendar (see section 5).
--
--   - Weekly availability (availability_rules, renamed from task 14's
--     professional_availability) is stored as wall-clock times in the
--     professional's own time zone, so a rule keeps its hour across daylight
--     saving changes. Every slot, exception and booking instant is UTC.
--   - Free slots are computed here, from the rules plus extra slots, minus
--     days off, minus live bookings and their buffers, minus days already at
--     the professional's maximum. Booking re-checks the slot and takes a
--     per-professional lock, and an exclusion constraint makes a double
--     booking impossible even so.
--   - Each booking hangs off a counsellor_requests row (created when the
--     patient books, or the escalation request it came from), so the task 07
--     workspace, notes and referrals keep working.

create extension if not exists btree_gist with schema extensions;

create schema if not exists booking_private;
revoke all on schema booking_private from public, anon, authenticated;
alter default privileges in schema booking_private
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Booking policy (one row) and professional settings
-- ---------------------------------------------------------------------------
create table booking_private.policy (
  id                  boolean primary key default true check (id),
  -- Patients can reschedule or cancel up to this many hours before the
  -- start. [CONFIRM] with the programme.
  change_cutoff_hours integer not null default 24 check (change_cutoff_hours between 0 and 168),
  -- No slot is offered that starts sooner than this.
  min_notice_minutes  integer not null default 60 check (min_notice_minutes between 0 and 10080),
  -- How far ahead patients can book.
  window_days         integer not null default 60 check (window_days between 1 and 365)
);
insert into booking_private.policy default values;

alter table public.professional_profiles
  add column time_zone            text not null default 'Asia/Dubai' check (char_length(time_zone) between 3 and 64),
  add column buffer_minutes       smallint not null default 10 check (buffer_minutes between 0 and 60),
  add column max_sessions_per_day smallint check (max_sessions_per_day between 1 and 20),
  add column auto_accept_bookings boolean not null default false,
  -- Shown to patients (and usable as the "women only" filter) only if the
  -- professional chooses to show it.
  add column gender               text check (gender in ('female', 'male')),
  add column show_gender          boolean not null default false;

-- An unknown time zone would make every slot wrong.
create function public.professional_profiles_time_zone_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger professional_profiles_time_zone_check
  before insert or update of time_zone on public.professional_profiles
  for each row execute function public.professional_profiles_time_zone_check();

grant update (time_zone, buffer_minutes, max_sessions_per_day, auto_accept_bookings, gender, show_gender)
  on public.professional_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Availability: weekly rules and exceptions
-- ---------------------------------------------------------------------------
alter table public.professional_availability rename to availability_rules;
alter table public.availability_rules rename column starts_at to start_time;
alter table public.availability_rules rename column ends_at to end_time;
alter table public.availability_rules rename constraint professional_availability_order to availability_rules_order;
alter policy "professional_availability: own" on public.availability_rules rename to "availability_rules: own";
alter table public.availability_rules
  add column session_minutes smallint not null default 60 check (session_minutes in (30, 45, 60)),
  add column format          text not null default 'video' check (format in ('video', 'in_person'));

update demo_private.flagged_tables set table_name = 'availability_rules' where table_name = 'professional_availability';

create table public.availability_exceptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.professional_profiles (user_id) on delete cascade,
  kind            text not null check (kind in ('day_off', 'extra_slot')),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  -- Extra slots only.
  session_minutes smallint check (session_minutes in (30, 45, 60)),
  format          text check (format in ('video', 'in_person')),
  created_at      timestamptz not null default now(),
  is_demo         boolean not null default false,
  constraint availability_exceptions_order check (ends_at > starts_at),
  constraint availability_exceptions_extra check (kind = 'day_off' or (session_minutes is not null and format is not null))
);

create index availability_exceptions_user_idx on public.availability_exceptions (user_id, starts_at);

alter table public.availability_exceptions enable row level security;
create policy "availability_exceptions: own"
  on public.availability_exceptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.availability_exceptions from anon, authenticated;
grant select, insert, update, delete on public.availability_exceptions to authenticated;

insert into demo_private.flagged_tables (table_name, owners, purge_order) values ('availability_exceptions', array['user_id'], 285);
create trigger availability_exceptions_demo_flag before insert or update on public.availability_exceptions
  for each row execute function demo_private.inherit_flag('user_id');

-- ---------------------------------------------------------------------------
-- 3. Bookings: patient and professional, end time, status
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column patient_id           uuid references auth.users (id) on delete cascade,
  add column professional_id      uuid references auth.users (id) on delete cascade,
  add column ends_at              timestamptz,
  add column status               text not null default 'confirmed'
                                  check (status in ('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show')),
  add column calendar_event_id    text check (char_length(calendar_event_id) <= 1024),
  add column meet_link_status     text check (meet_link_status in ('created', 'manual', 'fallback')),
  -- What the patient chose to share before the session: {"items": [...]}.
  add column share_choices        jsonb not null default '{}'::jsonb check (jsonb_typeof(share_choices) = 'object'),
  add column send_calendar_invite boolean not null default false,
  add column change_reason        text check (char_length(change_reason) <= 300),
  add column changed_by           text check (changed_by in ('patient', 'professional', 'system')),
  add column status_changed_at    timestamptz,
  add column updated_at           timestamptz not null default now();

update public.bookings b
   set patient_id = r.user_id
  from public.counsellor_requests r
 where r.id = b.request_id and b.patient_id is null;
update public.bookings b
   set professional_id = c.user_id
  from public.counsellors c
 where c.id = b.counsellor_id and b.professional_id is null;
update public.bookings
   set ends_at = starts_at + interval '60 minutes',
       status = case when attended_at is not null then 'completed' else 'confirmed' end
 where ends_at is null;
-- Bookings whose professional account no longer exists can't be served.
delete from public.bookings where patient_id is null or professional_id is null;

alter table public.bookings
  alter column patient_id set not null,
  alter column professional_id set not null,
  alter column ends_at set not null,
  alter column request_id drop not null,
  alter column counsellor_id drop not null,
  add constraint bookings_order check (ends_at > starts_at),
  drop constraint if exists bookings_request_id_key;

-- One live booking per request, and never two live bookings at once for
-- the same professional (requested bookings hold the slot too).
create unique index bookings_request_live_idx on public.bookings (request_id)
  where status in ('requested', 'confirmed');
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (professional_id extensions.gist_uuid_ops with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('requested', 'confirmed'));

create index bookings_professional_idx on public.bookings (professional_id, starts_at);
create index bookings_patient_idx on public.bookings (patient_id, starts_at);

-- Keeps the task 07 columns and the new ones in step, whichever is set.
-- Named to run before bookings_professional_guard and bookings_demo_flag.
create function public.bookings_a_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.professional_id is null and new.counsellor_id is not null then
    select c.user_id into new.professional_id from public.counsellors c where c.id = new.counsellor_id;
  end if;
  if new.counsellor_id is null and new.professional_id is not null then
    select c.id into new.counsellor_id from public.counsellors c where c.user_id = new.professional_id;
  end if;
  if new.patient_id is null and new.request_id is not null then
    select r.user_id into new.patient_id from public.counsellor_requests r where r.id = new.request_id;
  end if;
  if new.ends_at is null then
    new.ends_at := new.starts_at + interval '60 minutes';
  end if;
  -- Task 07's "mark attended" completes a confirmed booking.
  if new.attended_at is not null and new.status = 'confirmed' then
    new.status := 'completed';
  end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger bookings_a_sync
  before insert or update on public.bookings
  for each row execute function public.bookings_a_sync();

-- The professional must be verified; anyone else booking them also needs
-- them accepting patients (task 14), now checked on professional_id.
create or replace function public.bookings_professional_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.professional_id is null or not public.is_verified_professional(new.professional_id) then
    raise exception 'professional not available' using errcode = '42501';
  end if;
  if new.professional_id is distinct from auth.uid() and not public.is_bookable_professional(new.professional_id) then
    raise exception 'professional not accepting patients' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Demo flag: also inherit from the patient and the professional.
update demo_private.flagged_tables
   set owners = array['patient_id', 'professional_id', 'request_id>counsellor_requests', 'counsellor_id>counsellors']
 where table_name = 'bookings';
drop trigger if exists bookings_demo_flag on public.bookings;
create trigger bookings_demo_flag before insert or update on public.bookings
  for each row execute function demo_private.inherit_flag('patient_id', 'professional_id', 'request_id>counsellor_requests', 'counsellor_id>counsellors');

-- Reading: the patient, and the professional while verified. The task 07
-- policies (requests the caller is on; the counsellor's own) stay.
create policy "bookings: patient reads own"
  on public.bookings for select to authenticated
  using (patient_id = (select auth.uid()));
create policy "bookings: verified professional reads own"
  on public.bookings for select to authenticated
  using (professional_id = (select auth.uid()) and public.is_verified_professional((select auth.uid())));

-- Task 07's mark-attended and suspension flags work on the new rows too.
create or replace function public.kyc_flag_bookings(p_user uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.bookings b
     set flagged_at = now(), flag_reason = p_reason
   where b.professional_id = p_user
     and b.status in ('requested', 'confirmed')
     and b.starts_at > now() and b.flagged_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Task 07: starting a session on a request reuses its live booking.
create or replace function public.pro_start_session(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  record;
  r   public.counsellor_requests;
  b   public.bookings;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  if r.status = 'closed' then
    raise exception 'request is closed' using errcode = '22023';
  end if;
  perform pro_private.claim(r.id, me.counsellor_id);

  select * into b from public.bookings
   where request_id = r.id and status in ('requested', 'confirmed')
   order by starts_at limit 1;
  if b.id is null then
    insert into public.bookings (request_id, counsellor_id, professional_id, patient_id, starts_at, ends_at, format, partner_invited, status)
    values (r.id, me.counsellor_id, me.user_id, r.user_id, now(), now() + interval '60 minutes', 'video',
            r.partner_user_id is not null, 'confirmed')
    returning * into b;
  elsif b.status = 'requested' then
    update public.bookings set status = 'confirmed' where id = b.id returning * into b;
  end if;

  -- In-app room until a video link exists (section 5 adds Google Meet).
  update public.bookings
     set meeting_url = coalesce(meeting_url, '/pro/video/' || id::text)
   where id = b.id
  returning * into b;

  update public.counsellor_requests set status = 'in_session' where id = r.id;
  return b.meeting_url;
end;
$$;

-- Task 07 read requests with their booking through a plain join; a request
-- can now have earlier cancelled bookings, so the queue and detail use the
-- current one.
create function booking_private.current_booking(p_request uuid)
returns public.bookings
language sql
stable
security definer
set search_path = ''
as $$
  select b.* from public.bookings b
   where b.request_id = p_request
   order by (b.status in ('requested', 'confirmed')) desc, b.starts_at desc
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- 4. Free slots
-- ---------------------------------------------------------------------------
-- No access check: callers below decide who may ask.
create function booking_private.slots(
  p_professional uuid, p_from timestamptz, p_to timestamptz, p_exclude uuid default null)
returns table (starts_at timestamptz, ends_at timestamptz, format text, session_minutes smallint)
language sql
stable
security definer
set search_path = ''
as $$
  with pro as (
    select pp.user_id, pp.time_zone tz, pp.buffer_minutes buf, pp.max_sessions_per_day maxd
      from public.professional_profiles pp where pp.user_id = p_professional
  ),
  pol as (select * from booking_private.policy limit 1),
  bounds as (
    select greatest(p_from, now() + make_interval(mins => pol.min_notice_minutes)) lo,
           least(p_to, now() + make_interval(days => pol.window_days)) hi
      from pol
  ),
  days as (
    select d::date d
      from pro, bounds,
           generate_series((bounds.lo at time zone pro.tz)::date - 1, (bounds.hi at time zone pro.tz)::date, interval '1 day') d
  ),
  windows as (
    -- Weekly rules, as wall-clock times in the professional's time zone.
    select (days.d + r.start_time) at time zone pro.tz ws,
           (days.d + r.end_time) at time zone pro.tz we,
           r.session_minutes, r.format
      from pro
      join days on true
      join public.availability_rules r
        on r.user_id = pro.user_id and r.weekday = extract(dow from days.d)
    union all
    -- Extra slots.
    select e.starts_at, e.ends_at, e.session_minutes, e.format
      from public.availability_exceptions e, bounds
     where e.user_id = p_professional and e.kind = 'extra_slot'
       and e.ends_at > bounds.lo and e.starts_at < bounds.hi
  ),
  candidates as (
    -- Back-to-back sessions, each followed by the buffer.
    select s, s + make_interval(mins => w.session_minutes) e, w.format, w.session_minutes
      from windows w, pro,
           generate_series(w.ws, w.we - make_interval(mins => w.session_minutes),
                           make_interval(mins => w.session_minutes + pro.buf)) s
  )
  select distinct c.s, c.e, c.format, c.session_minutes
    from candidates c, pro, bounds
   where c.s >= bounds.lo and c.s < bounds.hi
     -- Days off.
     and not exists (
       select 1 from public.availability_exceptions x
        where x.user_id = p_professional and x.kind = 'day_off'
          and tstzrange(x.starts_at, x.ends_at) && tstzrange(c.s, c.e))
     -- Live bookings, with the buffer on both sides.
     and not exists (
       select 1 from public.bookings b
        where b.professional_id = p_professional
          and b.status in ('requested', 'confirmed')
          and b.id is distinct from p_exclude
          and tstzrange(b.starts_at - make_interval(mins => pro.buf), b.ends_at + make_interval(mins => pro.buf))
              && tstzrange(c.s, c.e))
     -- The day's maximum.
     and (pro.maxd is null or (
       select count(*) from public.bookings b
        where b.professional_id = p_professional
          and b.status in ('requested', 'confirmed', 'completed')
          and b.id is distinct from p_exclude
          and (b.starts_at at time zone pro.tz)::date = (c.s at time zone pro.tz)::date) < pro.maxd)
   order by c.s
$$;

-- Free slots for patients (bookable professionals only) and for the
-- professional themself (a preview of what patients see).
create function public.free_slots(p_professional uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz, format text, session_minutes smallint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  if not (public.is_bookable_professional(p_professional)
          or (p_professional = auth.uid() and public.is_verified_professional(p_professional))) then
    return;
  end if;
  return query select * from booking_private.slots(p_professional, p_from, least(p_to, p_from + interval '62 days'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The directory
-- ---------------------------------------------------------------------------
-- Verified and accepting only. Licence authority and status are shown;
-- the licence number never is. Gender only if the professional shows it.
drop function if exists public.professional_directory();
create function public.professional_directory()
returns table (
  user_id           uuid,
  display_name      text,
  profession        text,
  specialties       text[],
  languages         text[],
  years_experience  smallint,
  facility_name     text,
  bio               text,
  licence_authority text,
  photo_path        text,
  gender            text,
  time_zone         text,
  next_slot         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.user_id, pp.display_name, pp.profession, pp.specialties, pp.languages,
         pp.years_experience, pp.facility_name, pp.bio, pp.licence_authority, pp.photo_path,
         case when pp.show_gender then pp.gender end, pp.time_zone,
         (select min(s.starts_at) from booking_private.slots(pp.user_id, now(), now() + interval '30 days') s)
    from public.professional_profiles pp
   where auth.uid() is not null
     and public.is_bookable_professional(pp.user_id)
   order by pp.display_name
$$;

-- ---------------------------------------------------------------------------
-- 6. Notifications for bookings, messages and offers
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('access_request', 'referral_created', 'referral_updated', 'kyc_status',
                  'new_message', 'booking_requested', 'booking_confirmed', 'booking_declined',
                  'booking_changed', 'booking_cancelled', 'booking_reminder', 'request_offer', 'offer_accepted'));
alter table public.notifications
  add column booking_id     uuid references public.bookings (id) on delete cascade,
  add column request_id     uuid references public.counsellor_requests (id) on delete cascade,
  add column conversation_id uuid references public.pro_conversations (id) on delete cascade,
  -- Who caused it: the patient or the professional. Never a name or text.
  add column actor_role     text check (actor_role in ('patient', 'professional', 'system')),
  add column reminder       text check (reminder in ('24h', '1h'));

create unique index notifications_reminder_once_idx
  on public.notifications (booking_id, user_id, reminder) where kind = 'booking_reminder';
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create function booking_private.notify(p_user uuid, p_kind text, p_booking uuid, p_actor text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, booking_id, actor_role)
  values (p_user, p_kind, p_booking, p_actor)
$$;

-- ---------------------------------------------------------------------------
-- 7. Booking, responding, rescheduling, cancelling, completing
-- ---------------------------------------------------------------------------
create function booking_private.event(p_user uuid, p_name text, p_props jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.events (user_id, name, props) values (p_user, p_name, coalesce(p_props, '{}'::jsonb))
$$;

-- The caller's side of a booking, or an error that doesn't reveal it exists.
create function booking_private.participant(p_booking uuid, out b public.bookings, out role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is not null and b.patient_id = auth.uid() then
    role := 'patient';
  elsif b.id is not null and b.professional_id = auth.uid() and public.is_verified_professional(auth.uid()) then
    role := 'professional';
  else
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.book_session(
  p_professional   uuid,
  p_starts_at      timestamptz,
  p_format         text,
  p_share          text[] default '{}',
  p_send_invite    boolean default false,
  p_family_invited boolean default false,
  p_request_id     uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  slot    record;
  pro     public.professional_profiles;
  coun    public.counsellors;
  req     public.counsellor_requests;
  item    text;
  shared  text[] := '{}';
  bk      public.bookings;
  v_status text;
begin
  if caller is null or not exists (select 1 from public.profiles where user_id = caller and role = 'individual') then
    raise exception 'patients only' using errcode = '42501';
  end if;
  if not public.is_bookable_professional(p_professional) then
    raise exception 'professional not available' using errcode = '42501';
  end if;

  -- One booking at a time per professional: the slot check and the insert
  -- can't interleave. The exclusion constraint backs this up.
  perform pg_advisory_xact_lock(hashtextextended('booking:' || p_professional::text, 0));

  select * into slot from booking_private.slots(p_professional, p_starts_at - interval '1 minute', p_starts_at + interval '1 minute') s
   where s.starts_at = p_starts_at;
  if slot.starts_at is null or slot.format <> p_format then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  select * into pro from public.professional_profiles where user_id = p_professional;
  select * into coun from public.counsellors where user_id = p_professional;

  -- The request this booking belongs to: the patient's own (from an
  -- escalation or an accepted offer), or a new one.
  if p_request_id is not null then
    select * into req from public.counsellor_requests
     where id = p_request_id and user_id = caller and status <> 'closed';
    if req.id is null then
      raise exception 'request not found' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.bookings where request_id = req.id and status in ('requested', 'confirmed')) then
      raise exception 'request already booked' using errcode = '22023';
    end if;
    update public.counsellor_requests
       set assigned_counsellor_id = coalesce(assigned_counsellor_id, coun.id),
           facility_id = coalesce(facility_id, coun.facility_id),
           status = 'booked'
     where id = req.id
    returning * into req;
  else
    insert into public.counsellor_requests (user_id, source, reason, urgency, status, facility_id, assigned_counsellor_id)
    values (caller, 'booking', 'asked_for_person', 'standard', 'booked', coun.facility_id, coun.id)
    returning * into req;
  end if;

  v_status := case when pro.auto_accept_bookings then 'confirmed' else 'requested' end;

  -- Shared before the session, by the patient's choice only.
  foreach item in array coalesce(p_share, '{}') loop
    continue when item not in ('result', 'values_summary', 'family_map');
    shared := shared || item;
    if not exists (select 1 from public.share_grants g
                    where g.owner_id = caller and g.grantee_id = p_professional
                      and g.resource = item and g.revoked_at is null) then
      insert into public.share_grants (owner_id, grantee_id, resource, level, request_id)
      values (caller, p_professional, item, 'summary', req.id);
    end if;
  end loop;

  insert into public.bookings (
    request_id, counsellor_id, professional_id, patient_id, starts_at, ends_at, format, status,
    partner_invited, family_member_invited, share_choices, send_calendar_invite, changed_by)
  values (
    req.id, coun.id, p_professional, caller, slot.starts_at, slot.ends_at, slot.format, v_status,
    req.partner_user_id is not null, coalesce(p_family_invited, false),
    jsonb_build_object('items', to_jsonb(shared)), coalesce(p_send_invite, false), 'patient')
  returning * into bk;

  perform booking_private.notify(p_professional,
    case when v_status = 'confirmed' then 'booking_confirmed' else 'booking_requested' end, bk.id, 'patient');
  perform booking_private.event(caller, 'booking_requested', jsonb_build_object('format', bk.format, 'auto_confirmed', v_status = 'confirmed'));
  perform booking_private.event(caller, 'booking_created', jsonb_build_object('format', bk.format));
  if v_status = 'confirmed' then
    perform booking_private.event(caller, 'booking_confirmed', jsonb_build_object('by', 'auto'));
  end if;

  return jsonb_build_object('id', bk.id, 'status', bk.status);
end;
$$;

-- The professional confirms or declines a requested booking.
create function public.pro_respond_booking(p_booking uuid, p_accept boolean, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  bk public.bookings;
begin
  select * into p from booking_private.participant(p_booking);
  if p.role <> 'professional' then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if (p.b).status <> 'requested' then
    raise exception 'not waiting for a response' using errcode = '22023';
  end if;

  update public.bookings
     set status = case when p_accept then 'confirmed' else 'declined' end,
         change_reason = case when p_accept then change_reason else left(nullif(btrim(p_reason), ''), 300) end,
         changed_by = 'professional'
   where id = p_booking
  returning * into bk;

  if not p_accept then
    -- Declined: what was shared for this booking is no longer shared.
    update public.share_grants set revoked_at = now()
     where owner_id = bk.patient_id and grantee_id = bk.professional_id
       and request_id = bk.request_id and revoked_at is null;
    update public.counsellor_requests set status = 'open' where id = bk.request_id and status = 'booked';
  end if;

  perform booking_private.notify(bk.patient_id, case when p_accept then 'booking_confirmed' else 'booking_declined' end, bk.id, 'professional');
  perform booking_private.event(bk.patient_id, case when p_accept then 'booking_confirmed' else 'booking_declined' end,
                                jsonb_build_object('by', 'professional'));
  return bk.status;
end;
$$;

create function public.reschedule_booking(p_booking uuid, p_new_start timestamptz, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p      record;
  pol    booking_private.policy;
  slot   record;
  pro    public.professional_profiles;
  bk     public.bookings;
  other  uuid;
begin
  select * into p from booking_private.participant(p_booking);
  if (p.b).status not in ('requested', 'confirmed') then
    raise exception 'booking can no longer be changed' using errcode = '22023';
  end if;
  select * into pol from booking_private.policy limit 1;
  if p.role = 'patient' and (p.b).starts_at - now() < make_interval(hours => pol.change_cutoff_hours) then
    raise exception 'too_late_to_change' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('booking:' || (p.b).professional_id::text, 0));
  select * into slot from booking_private.slots((p.b).professional_id, p_new_start - interval '1 minute',
                                                 p_new_start + interval '1 minute', p_booking) s
   where s.starts_at = p_new_start;
  if slot.starts_at is null then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;
  select * into pro from public.professional_profiles where user_id = (p.b).professional_id;

  update public.bookings
     set starts_at = slot.starts_at,
         ends_at = slot.ends_at,
         format = slot.format,
         -- A patient's change needs the professional's OK again, unless they auto-accept.
         status = case when p.role = 'patient' and not pro.auto_accept_bookings then 'requested' else 'confirmed' end,
         change_reason = left(nullif(btrim(p_reason), ''), 300),
         changed_by = p.role
   where id = p_booking
  returning * into bk;

  other := case when p.role = 'patient' then bk.professional_id else bk.patient_id end;
  perform booking_private.notify(other, 'booking_changed', bk.id, p.role);
  perform booking_private.event(bk.patient_id, 'booking_rescheduled', jsonb_build_object('by', p.role));
  -- Reminders start again for the new time.
  delete from public.notifications where booking_id = bk.id and kind = 'booking_reminder';
  return jsonb_build_object('id', bk.id, 'status', bk.status, 'calendar_event_id', bk.calendar_event_id);
end;
$$;

create function public.cancel_booking(p_booking uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p     record;
  pol   booking_private.policy;
  bk    public.bookings;
  other uuid;
begin
  select * into p from booking_private.participant(p_booking);
  if (p.b).status not in ('requested', 'confirmed') then
    raise exception 'booking can no longer be changed' using errcode = '22023';
  end if;
  select * into pol from booking_private.policy limit 1;
  -- Patients up to the cut-off; professionals at any time, with a reason.
  if p.role = 'patient' and (p.b).starts_at - now() < make_interval(hours => pol.change_cutoff_hours) then
    raise exception 'too_late_to_change' using errcode = 'P0001';
  end if;
  if p.role = 'professional' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason required' using errcode = '22023';
  end if;

  update public.bookings
     set status = 'cancelled', change_reason = left(nullif(btrim(p_reason), ''), 300), changed_by = p.role
   where id = p_booking
  returning * into bk;
  update public.counsellor_requests set status = 'open' where id = bk.request_id and status = 'booked';

  other := case when p.role = 'patient' then bk.professional_id else bk.patient_id end;
  perform booking_private.notify(other, 'booking_cancelled', bk.id, p.role);
  perform booking_private.event(bk.patient_id, 'booking_cancelled', jsonb_build_object('by', p.role));
  return jsonb_build_object('id', bk.id, 'status', bk.status, 'calendar_event_id', bk.calendar_event_id);
end;
$$;

-- After the session: completed (feeds session_attended) or no-show.
create function public.pro_complete_booking(p_booking uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p  record;
  bk public.bookings;
  partner uuid;
begin
  if p_outcome not in ('completed', 'no_show') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  select * into p from booking_private.participant(p_booking);
  if p.role <> 'professional' then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if (p.b).status <> 'confirmed' or (p.b).starts_at > now() then
    raise exception 'session has not started' using errcode = '22023';
  end if;

  update public.bookings
     set status = p_outcome,
         attended_at = case when p_outcome = 'completed' then now() else attended_at end,
         changed_by = 'professional'
   where id = p_booking
  returning * into bk;

  if p_outcome = 'completed' then
    select r.partner_user_id into partner from public.counsellor_requests r where r.id = bk.request_id;
    perform booking_private.event(u, 'session_attended')
       from unnest(array[bk.patient_id, partner]) u where u is not null;
    perform booking_private.event(bk.patient_id, 'session_completed');
  end if;
end;
$$;

-- Fallback when there's no Google link: the professional pastes one.
create function public.set_booking_meeting_link(p_booking uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  url text := btrim(coalesce(p_url, ''));
begin
  select * into p from booking_private.participant(p_booking);
  if p.role <> 'professional' then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;
  if url !~ '^https://[^\s]{4,490}$' then
    raise exception 'invalid link' using errcode = '22023';
  end if;
  update public.bookings set meeting_url = url, meet_link_status = 'manual' where id = p_booking;
  perform booking_private.event(auth.uid(), 'meet_link_created', jsonb_build_object('result', 'manual'));
end;
$$;

-- Joining the call, from 10 minutes before the start until the end.
create function public.join_session(p_booking uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from booking_private.participant(p_booking);
  if (p.b).status <> 'confirmed' or (p.b).meeting_url is null
     or now() < (p.b).starts_at - interval '10 minutes' or now() > (p.b).ends_at + interval '30 minutes' then
    raise exception 'not open yet' using errcode = '22023';
  end if;
  perform booking_private.event(auth.uid(), 'session_joined', jsonb_build_object('role', p.role));
  return (p.b).meeting_url;
end;
$$;

-- Server only (service role): the Google Calendar event made for a booking.
create function public.record_calendar_event(p_booking uuid, p_event_id text, p_meeting_url text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bookings
     set calendar_event_id = p_event_id,
         meeting_url = coalesce(p_meeting_url, meeting_url),
         meet_link_status = p_status
   where id = p_booking
$$;

-- Reminders 24 hours and 1 hour before, once each, for both sides. Server
-- only (cron). Returns who to email.
create function public.queue_booking_reminders()
returns table (user_id uuid, booking_id uuid, reminder text)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select b.id, x.reminder, x.lead
      from public.bookings b
      cross join (values ('24h', interval '24 hours'), ('1h', interval '1 hour')) x (reminder, lead)
     where b.status = 'confirmed'
       and b.starts_at > now()
       and b.starts_at <= now() + x.lead
       -- The 24-hour reminder is skipped when the 1-hour one is already due.
       and not (x.reminder = '24h' and b.starts_at <= now() + interval '1 hour')
  ),
  targets as (
    select d.id booking_id, d.reminder, u.uid user_id
      from due d
      join public.bookings b on b.id = d.id
      cross join lateral (values (b.patient_id), (b.professional_id)) u (uid)
  )
  insert into public.notifications (user_id, kind, booking_id, reminder, actor_role)
  select t.user_id, 'booking_reminder', t.booking_id, t.reminder, 'system' from targets t
  on conflict (booking_id, user_id, reminder) where kind = 'booking_reminder' do nothing
  returning user_id, booking_id, reminder
$$;

-- ---------------------------------------------------------------------------
-- 8. Reading bookings
-- ---------------------------------------------------------------------------
-- The patient's bookings, with the professional's name.
create function public.my_bookings()
returns table (
  id uuid, professional_id uuid, professional_name text, profession text, starts_at timestamptz, ends_at timestamptz,
  format text, status text, meeting_url text, meet_link_status text, share_choices jsonb, change_reason text,
  changed_by text, family_member_invited boolean, partner_invited boolean, professional_available boolean,
  time_zone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.professional_id, pp.display_name, pp.profession, b.starts_at, b.ends_at, b.format, b.status,
         case when b.status = 'confirmed' then b.meeting_url end, b.meet_link_status, b.share_choices,
         b.change_reason, b.changed_by, b.family_member_invited, b.partner_invited,
         public.is_verified_professional(b.professional_id), pp.time_zone
    from public.bookings b
    left join public.professional_profiles pp on pp.user_id = b.professional_id
   where b.patient_id = auth.uid()
   order by b.starts_at desc
   limit 50
$$;

-- The professional's bookings in a range. The patient appears by first
-- name only (they chose this professional), never with health details.
create function public.pro_bookings(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, request_id uuid, patient_name text, starts_at timestamptz, ends_at timestamptz, format text,
  status text, meeting_url text, meet_link_status text, calendar_event_id text, share_choices jsonb,
  change_reason text, changed_by text, family_member_invited boolean, partner_invited boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_verified_professional(auth.uid()) then
    raise exception 'verified professional required' using errcode = '42501';
  end if;
  return query
    select b.id, b.request_id,
           coalesce(nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), ''), 'Patient'),
           b.starts_at, b.ends_at, b.format, b.status, b.meeting_url, b.meet_link_status, b.calendar_event_id,
           b.share_choices, b.change_reason, b.changed_by, b.family_member_invited, b.partner_invited
      from public.bookings b
      left join public.profiles p on p.user_id = b.patient_id
     where b.professional_id = auth.uid()
       and b.starts_at < p_to and b.ends_at > p_from
     order by b.starts_at;
end;
$$;

create function public.booking_change_cutoff_hours()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select change_cutoff_hours from booking_private.policy limit 1
$$;

-- ---------------------------------------------------------------------------
-- 9. Offers on open requests (escalations and flagged results)
-- ---------------------------------------------------------------------------
create table public.request_offers (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.counsellor_requests (id) on delete cascade,
  professional_id uuid not null references auth.users (id) on delete cascade,
  status          text not null default 'offered' check (status in ('offered', 'accepted', 'withdrawn', 'declined')),
  created_at      timestamptz not null default now(),
  is_demo         boolean not null default false,
  unique (request_id, professional_id)
);

alter table public.request_offers enable row level security;
revoke all on public.request_offers from anon, authenticated;

insert into demo_private.flagged_tables (table_name, owners, purge_order)
values ('request_offers', array['professional_id', 'request_id>counsellor_requests'], 95);
create trigger request_offers_demo_flag before insert or update on public.request_offers
  for each row execute function demo_private.inherit_flag('professional_id', 'request_id>counsellor_requests');

-- Open, unassigned requests from patients who speak one of the
-- professional's languages. Category, urgency and language only: no name,
-- no summary, no result until the patient accepts and shares.
create function public.pro_open_requests()
returns table (id uuid, reason text, urgency text, language text, created_at timestamptz, offered boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  langs text[];
begin
  if not public.is_verified_professional(auth.uid()) then
    raise exception 'verified professional required' using errcode = '42501';
  end if;
  select pp.languages into langs from public.professional_profiles pp where pp.user_id = auth.uid();
  return query
    select r.id, r.reason, r.urgency, p.locale, r.created_at,
           exists (select 1 from public.request_offers o where o.request_id = r.id and o.professional_id = auth.uid())
      from public.counsellor_requests r
      join public.profiles p on p.user_id = r.user_id
     where r.status = 'open' and r.assigned_counsellor_id is null
       and p.locale = any (langs)
     order by (r.urgency = 'priority') desc, r.created_at
     limit 50;
end;
$$;

create function public.pro_offer_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.counsellor_requests;
begin
  if not public.is_bookable_professional(auth.uid()) then
    raise exception 'verified professional accepting patients required' using errcode = '42501';
  end if;
  select * into r from public.counsellor_requests where id = p_request;
  if r.id is null or r.status <> 'open' or r.assigned_counsellor_id is not null
     or not exists (select 1 from public.pro_open_requests() o where o.id = p_request) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  insert into public.request_offers (request_id, professional_id) values (p_request, auth.uid())
  on conflict (request_id, professional_id) do update set status = 'offered';
  insert into public.notifications (user_id, kind, request_id, actor_role) values (r.user_id, 'request_offer', r.id, 'professional');
  perform booking_private.event(auth.uid(), 'request_offered', jsonb_build_object('urgency', r.urgency));
end;
$$;

-- The patient's open requests and the professionals offering to take them.
create function public.my_request_offers()
returns table (
  offer_id uuid, request_id uuid, reason text, professional_id uuid, display_name text, profession text,
  languages text[], licence_authority text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, r.id, r.reason, o.professional_id, pp.display_name, pp.profession, pp.languages,
         pp.licence_authority, o.created_at
    from public.request_offers o
    join public.counsellor_requests r on r.id = o.request_id
    join public.professional_profiles pp on pp.user_id = o.professional_id
   where r.user_id = auth.uid() and r.status = 'open' and o.status = 'offered'
     and public.is_bookable_professional(o.professional_id)
   order by o.created_at
$$;

-- The patient accepts one offer: the request goes to that professional.
create function public.accept_request_offer(p_offer uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o    public.request_offers;
  r    public.counsellor_requests;
  coun public.counsellors;
begin
  select * into o from public.request_offers where id = p_offer and status = 'offered';
  select * into r from public.counsellor_requests where id = o.request_id;
  if o.id is null or r.user_id is distinct from auth.uid() or r.status <> 'open' then
    raise exception 'offer not found' using errcode = 'P0002';
  end if;
  if not public.is_bookable_professional(o.professional_id) then
    raise exception 'professional not available' using errcode = '42501';
  end if;
  select * into coun from public.counsellors where user_id = o.professional_id;
  update public.counsellor_requests
     set assigned_counsellor_id = coun.id, facility_id = coalesce(coun.facility_id, facility_id)
   where id = r.id;
  update public.request_offers set status = case when id = o.id then 'accepted' else 'declined' end
   where request_id = r.id and status = 'offered';
  insert into public.notifications (user_id, kind, request_id, actor_role) values (o.professional_id, 'offer_accepted', r.id, 'patient');
  perform booking_private.event(auth.uid(), 'request_offer_accepted');
  return o.professional_id;
end;
$$;

-- Everything for the bell, for patients and professionals alike: the kind,
-- the other person's name and the booking time. Text is built in the app.
create function public.my_inbox()
returns table (
  id            uuid,
  kind          text,
  booking_id    uuid,
  request_id    uuid,
  conversation_id uuid,
  actor_role    text,
  reminder      text,
  other_name    text,
  starts_at     timestamptz,
  kyc_status    text,
  created_at    timestamptz,
  read_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.booking_id, n.request_id, n.conversation_id, n.actor_role, n.reminder,
         case
           -- The patient sees the professional's name.
           when b.patient_id = auth.uid() then pp.display_name
           -- The professional sees the patient's first name.
           when b.professional_id = auth.uid() then nullif(split_part(btrim(coalesce(pa.display_name, '')), ' ', 1), '')
           when n.kind = 'request_offer' then (select p2.display_name from public.request_offers o
                                                 join public.professional_profiles p2 on p2.user_id = o.professional_id
                                                where o.request_id = n.request_id order by o.created_at desc limit 1)
           else c.name
         end,
         b.starts_at, n.kyc_status, n.created_at, n.read_at
    from public.notifications n
    left join public.bookings b on b.id = n.booking_id
    left join public.professional_profiles pp on pp.user_id = b.professional_id
    left join public.profiles pa on pa.user_id = b.patient_id
    left join public.counsellors c on c.id = n.counsellor_id
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit 30
$$;

create function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null
     and (p_ids is null or id = any (p_ids))
$$;

-- ---------------------------------------------------------------------------
-- 10. Task 07 readers use each request's current booking
-- ---------------------------------------------------------------------------
create or replace function public.pro_requests()
returns table (
  id                 uuid,
  patient_key        text,
  source             text,
  reason             text,
  urgency            text,
  status             text,
  outcome            text,
  created_at         timestamptz,
  closed_at          timestamptz,
  is_couple          boolean,
  assigned_to_me     boolean,
  user_first_name    text,
  user_initial       text,
  partner_first_name text,
  partner_initial    text,
  starts_at          timestamptz,
  format             text,
  attended_at        timestamptz,
  shared             text[],
  flag_reason        text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me record;
begin
  select * into me from pro_private.require_counsellor();
  return query
    select
      r.id,
      -- Pseudonymous key per patient (or couple) and counsellor, for
      -- grouping. Never a user id.
      md5(r.user_id::text || coalesce(r.partner_user_id::text, '') || me.counsellor_id::text),
      r.source, r.reason, r.urgency, r.status, r.outcome, r.created_at, r.closed_at,
      r.partner_user_id is not null,
      coalesce(r.assigned_counsellor_id = me.counsellor_id, false),
      pro_private.first_name(r.user_id, me.user_id, r.partner_user_id is not null),
      pro_private.initial(r.user_id),
      case when r.partner_user_id is not null
           then pro_private.first_name(r.partner_user_id, me.user_id, true) end,
      case when r.partner_user_id is not null then pro_private.initial(r.partner_user_id) end,
      b.starts_at, b.format, b.attended_at,
      coalesce((
        select array_agg(distinct g.resource order by g.resource)
          from public.share_grants g
         where g.grantee_id = me.user_id and g.revoked_at is null
           and g.owner_id in (r.user_id, r.partner_user_id)
      ), '{}') || case when r.share_summary and r.summary is not null
                       then array['ai_summary'] else '{}'::text[] end,
      -- The flag reason only once the patient has shared their result.
      case when pro_private.grant_level(r.user_id, me.user_id, 'result') is not null then (
        select s.flag_reason from public.screening_results s
         where s.owner_id = r.user_id order by s.claimed_at desc nulls last limit 1
      ) end
    from public.counsellor_requests r
    left join lateral booking_private.current_booking(r.id) b on true
    where pro_private.can_see(r, me.counsellor_id, me.facility_id);
end;
$$;

create or replace function public.pro_request_detail(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       record;
  r        public.counsellor_requests;
  b        public.bookings;
  couple   boolean;
  people   jsonb;
  vals     jsonb;
  note     public.session_notes;
  refs     jsonb;
  req_summary text;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  couple := r.partner_user_id is not null;

  people := jsonb_build_array(pro_private.person(r.user_id, 'user', me.user_id, couple, r.id));
  if couple then
    people := people || jsonb_build_array(pro_private.person(r.partner_user_id, 'partner', me.user_id, true, r.id));
  end if;

  -- Values: bands per person and, for couples, whether they agree. A gap of
  -- two or more steps is "differ: worth discussing". Never raw numbers, never
  -- a combined score.
  with q (question_id, sort) as (
    values ('biological_children', 1), ('religious_guidance', 2), ('avoid_procedures', 3),
           ('cost', 4), ('family_views', 5)
  ),
  u as (
    select v.question_id, v.value from public.values_answers v
     where v.user_id = r.user_id
       and pro_private.grant_level(r.user_id, me.user_id, 'values_summary') is not null
  ),
  p as (
    select v.question_id, v.value from public.values_answers v
     where couple and v.user_id = r.partner_user_id
       and pro_private.grant_level(r.partner_user_id, me.user_id, 'values_summary') is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'question_id', q.question_id,
           'user_band', pro_private.band(u.value),
           'partner_band', pro_private.band(p.value),
           'agreement', case
             when u.value is null or p.value is null then null
             when abs(u.value - p.value) >= 2 then 'differ'
             else pro_private.band(least(u.value, p.value))
           end
         ) order by q.sort) filter (where u.value is not null or p.value is not null), '[]'::jsonb)
    into vals
    from q
    left join u on u.question_id = q.question_id
    left join p on p.question_id = q.question_id;

  if exists (select 1 from jsonb_array_elements(vals) e where e ->> 'user_band' is not null) then
    perform pro_private.log_access(r.user_id, 'values_summary',
      pro_private.grant_level(r.user_id, me.user_id, 'values_summary'), r.id);
  end if;
  if couple and exists (select 1 from jsonb_array_elements(vals) e where e ->> 'partner_band' is not null) then
    perform pro_private.log_access(r.partner_user_id, 'values_summary',
      pro_private.grant_level(r.partner_user_id, me.user_id, 'values_summary'), r.id);
  end if;

  -- A summary the person chose to share when asking Ask GeneBridge for a
  -- counsellor (task 06) is itself a share with whoever picks the request up.
  if r.share_summary and r.summary is not null then
    req_summary := r.summary;
    perform pro_private.log_access(r.user_id, 'ai_summary', 'summary', r.id);
  end if;

  b := booking_private.current_booking(r.id);
  select * into note from public.session_notes
   where request_id = r.id and counsellor_id = me.counsellor_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'step', x.step, 'status', x.status, 'role',
           case when x.user_id = r.user_id then 'user' else 'partner' end,
           'service_name', s.name) order by x.created_at), '[]'::jsonb)
    into refs
    from public.referrals x
    left join public.services s on s.id = x.service_id
   where x.request_id = r.id;

  return jsonb_build_object(
    'id', r.id,
    'source', r.source,
    'reason', r.reason,
    'urgency', r.urgency,
    'status', r.status,
    'created_at', r.created_at,
    'is_couple', couple,
    'booking', case when b.id is null then null else jsonb_build_object(
      'starts_at', b.starts_at, 'format', b.format,
      'meeting_url', b.meeting_url, 'attended_at', b.attended_at, 'status', b.status, 'id', b.id) end,
    'people', people,
    'values', vals,
    'request_summary', req_summary,
    'note', case when note.id is null then null
                 else jsonb_build_object('body', note.body, 'updated_at', note.updated_at) end,
    'referrals', refs
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Live updates and grants
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;

revoke all on function public.professional_profiles_time_zone_check() from public, anon, authenticated;
revoke all on function public.bookings_a_sync() from public, anon, authenticated;

revoke all on function public.free_slots(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.professional_directory() from public, anon;
revoke all on function public.my_inbox() from public, anon;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
revoke all on function public.book_session(uuid, timestamptz, text, text[], boolean, boolean, uuid) from public, anon;
revoke all on function public.pro_respond_booking(uuid, boolean, text) from public, anon;
revoke all on function public.reschedule_booking(uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_booking(uuid, text) from public, anon;
revoke all on function public.pro_complete_booking(uuid, text) from public, anon;
revoke all on function public.set_booking_meeting_link(uuid, text) from public, anon;
revoke all on function public.join_session(uuid) from public, anon;
revoke all on function public.record_calendar_event(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.queue_booking_reminders() from public, anon, authenticated;
revoke all on function public.my_bookings() from public, anon;
revoke all on function public.pro_bookings(timestamptz, timestamptz) from public, anon;
revoke all on function public.booking_change_cutoff_hours() from public, anon;
revoke all on function public.pro_open_requests() from public, anon;
revoke all on function public.pro_offer_request(uuid) from public, anon;
revoke all on function public.my_request_offers() from public, anon;
revoke all on function public.accept_request_offer(uuid) from public, anon;

grant execute on function public.free_slots(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.professional_directory() to authenticated;
grant execute on function public.my_inbox() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.book_session(uuid, timestamptz, text, text[], boolean, boolean, uuid) to authenticated;
grant execute on function public.pro_respond_booking(uuid, boolean, text) to authenticated;
grant execute on function public.reschedule_booking(uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.pro_complete_booking(uuid, text) to authenticated;
grant execute on function public.set_booking_meeting_link(uuid, text) to authenticated;
grant execute on function public.join_session(uuid) to authenticated;
grant execute on function public.record_calendar_event(uuid, text, text, text) to service_role;
grant execute on function public.queue_booking_reminders() to service_role;
grant execute on function public.my_bookings() to authenticated;
grant execute on function public.pro_bookings(timestamptz, timestamptz) to authenticated;
grant execute on function public.booking_change_cutoff_hours() to authenticated;
grant execute on function public.pro_open_requests() to authenticated;
grant execute on function public.pro_offer_request(uuid) to authenticated;
grant execute on function public.my_request_offers() to authenticated;
grant execute on function public.accept_request_offer(uuid) to authenticated;
