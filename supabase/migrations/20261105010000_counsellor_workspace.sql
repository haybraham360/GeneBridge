-- Task 07: counsellor workspace (/pro).
--
-- Rubric 3 and 5: complex findings reach a qualified professional, and every
-- step from screening to specialist care is traceable.
--
-- Privacy model (guardrails 6, 7, 10):
--   - A counsellor never reads another person's data from a table. Everything
--     about a patient comes through the `pro_*` security-definer functions
--     below, which check the caller is a counsellor who can see the request,
--     return only resources with an unrevoked share_grants row for that
--     counsellor, and write an access_log row for each one in the same call.
--   - Session notes are private to the counsellor and their facility.
--     Patients have no policy on session_notes at all.
--   - Closing a request records an outcome category only. There is no column
--     for marriage plans, relationship outcomes or reproductive decisions
--     (guardrail 11).

-- ---------------------------------------------------------------------------
-- Facilities
-- ---------------------------------------------------------------------------
-- `code` is the facility code counsellors sign in with (task 03). Never
-- readable from the browser; names reach the app through pro_me().
create table public.facilities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique check (code = upper(code)),
  created_at timestamptz not null default now()
);

alter table public.facilities enable row level security;
revoke all on public.facilities from anon, authenticated;

insert into public.facilities (name, code)
select distinct '[Facility name]', upper(c.facility_code) from public.counsellors c
on conflict (code) do nothing;

-- Several counsellors can now share a facility, so the code is no longer
-- unique per counsellor. counsellors.facility_code stays as a mirror of the
-- facility's code (kept in sync below) so earlier code and tests still work.
alter table public.counsellors drop constraint if exists counsellors_facility_code_key;
alter table public.counsellors
  add column facility_id uuid references public.facilities (id) on delete restrict;
update public.counsellors c
   set facility_id = f.id
  from public.facilities f
 where f.code = upper(c.facility_code);

create function public.counsellors_sync_facility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.facility_code is not null
     and (new.facility_id is null
          or (tg_op = 'UPDATE' and new.facility_code is distinct from old.facility_code)) then
    new.facility_code := upper(new.facility_code);
    insert into public.facilities (name, code) values ('[Facility name]', new.facility_code)
    on conflict (code) do nothing;
    select f.id into new.facility_id from public.facilities f where f.code = new.facility_code;
  elsif new.facility_id is not null then
    select f.code into new.facility_code from public.facilities f where f.id = new.facility_id;
  end if;
  return new;
end;
$$;

create trigger counsellors_sync_facility
  before insert or update of facility_code, facility_id on public.counsellors
  for each row execute function public.counsellors_sync_facility();

alter table public.counsellors alter column facility_id set not null;
create index counsellors_facility_idx on public.counsellors (facility_id);

-- ---------------------------------------------------------------------------
-- Counsellor requests: source, couples, facility, outcome
-- ---------------------------------------------------------------------------
alter table public.counsellor_requests drop constraint if exists counsellor_requests_status_check;
alter table public.counsellor_requests
  add constraint counsellor_requests_status_check
  check (status in ('open', 'booked', 'in_session', 'closed'));

-- Reason is a category, never message text. Booking and patient-request
-- reasons join the Ask GeneBridge ones from task 06.
alter table public.counsellor_requests drop constraint if exists counsellor_requests_reason_check;
alter table public.counsellor_requests
  add constraint counsellor_requests_reason_check
  check (reason in (
    'flagged_result', 'pregnancy', 'x_linked_or_dominant', 'major_decision',
    'outside_library', 'distress', 'asked_for_person',
    'couple_session', 'individual_session', 'after_options'));

alter table public.counsellor_requests
  add column source text not null default 'ai_escalation'
    check (source in ('flagged_result', 'ai_escalation', 'booking', 'patient_request')),
  add column partner_user_id uuid references auth.users (id) on delete set null,
  add column facility_id uuid references public.facilities (id) on delete set null,
  -- Outcome categories only (guardrail 11). Nothing about marriage plans,
  -- relationships or reproductive decisions can be stored here.
  add column outcome text check (outcome in (
    'information_given', 'follow_up_booked', 'referred_confirmatory_test',
    'referred_specialist', 'patient_withdrew')),
  add column follow_up_on date,
  add column closed_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint counsellor_requests_partner_not_self
    check (partner_user_id is null or partner_user_id <> user_id),
  add constraint counsellor_requests_closed_has_outcome
    check (status <> 'closed' or outcome is not null),
  add constraint counsellor_requests_outcome_only_when_closed
    check (outcome is null or status = 'closed');

update public.counsellor_requests r
   set facility_id = f.id
  from public.facilities f
 where f.code = upper(r.facility_code);

create function public.counsellor_requests_sync_facility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.facility_id is null and new.facility_code is not null then
    select f.id into new.facility_id from public.facilities f where f.code = upper(new.facility_code);
  elsif new.facility_id is not null
        and (new.facility_code is null or tg_op = 'UPDATE' and new.facility_id is distinct from old.facility_id) then
    select f.code into new.facility_code from public.facilities f where f.id = new.facility_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger counsellor_requests_sync_facility
  before insert or update on public.counsellor_requests
  for each row execute function public.counsellor_requests_sync_facility();

create index counsellor_requests_facility_idx
  on public.counsellor_requests (facility_id, status, urgency, created_at);
create index counsellor_requests_assigned_idx on public.counsellor_requests (assigned_counsellor_id);
create index counsellor_requests_partner_idx on public.counsellor_requests (partner_user_id);

-- The caller's counsellor record. Requires role = 'counsellor' too, so
-- changing the role back removes access straight away.
drop policy "counsellor_requests: counsellor reads facility queue" on public.counsellor_requests;
drop function public.my_counsellor();

create function public.my_counsellor()
returns table (counsellor_id uuid, facility_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.facility_id
    from public.counsellors c
    join public.profiles p on p.user_id = c.user_id and p.role = 'counsellor'
   where c.user_id = auth.uid()
$$;

revoke all on function public.my_counsellor() from public, anon;
grant execute on function public.my_counsellor() to authenticated;

create policy "counsellor_requests: counsellor reads facility queue"
  on public.counsellor_requests for select to authenticated
  using (
    exists (
      select 1 from public.my_counsellor() m
       where m.counsellor_id = assigned_counsellor_id
          or (status = 'open' and m.facility_id = counsellor_requests.facility_id)
    )
  );

-- Patients reading their own request also see where it came from. Facility
-- columns stay ungranted.
grant select (source, updated_at) on public.counsellor_requests to authenticated;

-- Task 06's request function, now routed by facility_id. The demo programme
-- has one intake facility: the one with the lowest code.
create or replace function public.create_counsellor_request(
  p_reason text,
  p_urgency text,
  p_share_summary boolean default false,
  p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (
    select count(*) from public.counsellor_requests
     where user_id = caller and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'too many requests today' using errcode = '54000';
  end if;

  insert into public.counsellor_requests (user_id, source, reason, urgency, share_summary, summary, facility_id)
  values (
    caller,
    case when p_reason = 'flagged_result' then 'flagged_result' else 'ai_escalation' end,
    p_reason,
    p_urgency,
    coalesce(p_share_summary, false),
    case when coalesce(p_share_summary, false) then nullif(btrim(p_summary), '') end,
    (select f.id from public.facilities f order by f.code limit 1)
  )
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient-owned data that can be shared with a counsellor
-- ---------------------------------------------------------------------------
-- Values exercise answers (Options page). 1..5. Owner only; a counsellor
-- sees agreement categories, never the numbers.
create table public.values_answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question_id text not null check (question_id in (
                'biological_children', 'religious_guidance', 'avoid_procedures',
                'cost', 'family_views')),
  value       smallint not null check (value between 1 and 5),
  updated_at  timestamptz not null default now(),
  unique (user_id, question_id)
);

alter table public.values_answers enable row level security;
create policy "values_answers: own"
  on public.values_answers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.values_answers from anon;
grant select, insert, update, delete on public.values_answers to authenticated;

-- Counselling prep from Ask GeneBridge (task 06): the person's questions in
-- their own words and the editable one-page summary. Owner only.
create table public.counselling_prep (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  questions  text[] not null default '{}' check (cardinality(questions) <= 20),
  ai_summary text check (char_length(ai_summary) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.counselling_prep enable row level security;
create policy "counselling_prep: own"
  on public.counselling_prep for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke all on public.counselling_prep from anon;
grant select, insert, update, delete on public.counselling_prep to authenticated;

-- ---------------------------------------------------------------------------
-- share_grants and access_log (PROJECT.md section 7)
-- ---------------------------------------------------------------------------
create table public.share_grants (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  grantee_id uuid not null references auth.users (id) on delete cascade,
  resource   text not null check (resource in ('result', 'values_summary', 'questions', 'ai_summary', 'family_map')),
  level      text not null default 'summary' check (level in ('summary', 'full')),
  request_id uuid references public.counsellor_requests (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint share_grants_not_self check (grantee_id <> owner_id)
);

-- One live grant per owner, grantee and resource.
create unique index share_grants_active_idx
  on public.share_grants (owner_id, grantee_id, resource) where revoked_at is null;
create index share_grants_grantee_idx on public.share_grants (grantee_id) where revoked_at is null;

alter table public.share_grants enable row level security;

create policy "share_grants: owner reads own"
  on public.share_grants for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "share_grants: owner shares own"
  on public.share_grants for insert to authenticated
  with check (owner_id = (select auth.uid()) and revoked_at is null);

-- Revoking: set revoked_at. Takes effect on the counsellor's next read.
create policy "share_grants: owner revokes own"
  on public.share_grants for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.share_grants from anon, authenticated;
grant select, insert on public.share_grants to authenticated;
grant update (revoked_at) on public.share_grants to authenticated;

-- Every read of someone's shared data. Visible to the data's owner only;
-- written only by the pro_* functions.
create table public.access_log (
  id                uuid primary key default gen_random_uuid(),
  resource_owner_id uuid not null references auth.users (id) on delete cascade,
  viewer_id         uuid references auth.users (id) on delete set null,
  resource          text not null,
  level             text,
  request_id        uuid references public.counsellor_requests (id) on delete set null,
  viewed_at         timestamptz not null default now()
);

create index access_log_owner_idx on public.access_log (resource_owner_id, viewed_at desc);

alter table public.access_log enable row level security;
create policy "access_log: owner reads own"
  on public.access_log for select to authenticated
  using (resource_owner_id = (select auth.uid()));
revoke all on public.access_log from anon, authenticated;
grant select on public.access_log to authenticated;

-- ---------------------------------------------------------------------------
-- Services (specialist referral targets). Placeholders until partners are
-- confirmed (guardrail 12).
-- ---------------------------------------------------------------------------
create table public.services (
  id    uuid primary key default gen_random_uuid(),
  kind  text not null check (kind in ('confirmatory_testing', 'haematology', 'ivf_embryo_testing')),
  name  text not null unique,
  sort  smallint not null default 0
);

alter table public.services enable row level security;
create policy "services: signed-in users can list"
  on public.services for select to authenticated using (true);
revoke all on public.services from anon, authenticated;
grant select on public.services to authenticated;

insert into public.services (kind, name, sort) values
  ('confirmatory_testing', '[Confirmatory testing lab]', 1),
  ('haematology', '[Haematology clinic]', 2),
  ('ivf_embryo_testing', '[Fertility centre]', 3)
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Bookings, session notes, referrals, access requests, notifications
-- ---------------------------------------------------------------------------
create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null unique references public.counsellor_requests (id) on delete cascade,
  counsellor_id   uuid not null references public.counsellors (id) on delete restrict,
  starts_at       timestamptz not null,
  format          text not null check (format in ('video', 'in_person')),
  meeting_url     text,
  partner_invited boolean not null default false,
  attended_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index bookings_counsellor_idx on public.bookings (counsellor_id, starts_at);

alter table public.bookings enable row level security;

-- Requests the caller is on, as the requester or the partner. Security
-- definer because partner_user_id isn't readable by users.
create function public.my_request_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.counsellor_requests r
   where r.user_id = auth.uid() or r.partner_user_id = auth.uid()
$$;

revoke all on function public.my_request_ids() from public, anon;
grant execute on function public.my_request_ids() to authenticated;

create policy "bookings: patients read their own"
  on public.bookings for select to authenticated
  using (request_id in (select public.my_request_ids()));

create policy "bookings: counsellor reads own"
  on public.bookings for select to authenticated
  using (exists (select 1 from public.my_counsellor() m where m.counsellor_id = bookings.counsellor_id));

revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;

-- Private to the counsellor and their facility. No patient policy exists, so
-- patients can never read these, even their own request's note.
create table public.session_notes (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.counsellor_requests (id) on delete cascade,
  counsellor_id uuid not null references public.counsellors (id) on delete cascade,
  -- The writer's facility at the time, so colleagues can read it.
  facility_id   uuid not null references public.facilities (id) on delete cascade,
  body          text not null default '' check (char_length(body) <= 20000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (request_id, counsellor_id)
);

create index session_notes_counsellor_idx on public.session_notes (counsellor_id, updated_at desc);

alter table public.session_notes enable row level security;

create policy "session_notes: counsellor and facility read"
  on public.session_notes for select to authenticated
  using (
    exists (
      select 1 from public.my_counsellor() m
       where m.counsellor_id = session_notes.counsellor_id
          or m.facility_id = session_notes.facility_id
    )
  );

revoke all on public.session_notes from anon, authenticated;
grant select on public.session_notes to authenticated;

create table public.referrals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  request_id uuid references public.counsellor_requests (id) on delete set null,
  step       text not null check (step in ('confirmatory_test', 'specialist')),
  status     text not null default 'ordered' check (status in ('ordered', 'scheduled', 'done', 'cancelled')),
  service_id uuid references public.services (id) on delete set null,
  created_by uuid references public.counsellors (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index referrals_user_idx on public.referrals (user_id, created_at desc);
create index referrals_created_by_idx on public.referrals (created_by, created_at desc);

alter table public.referrals enable row level security;

create policy "referrals: patient reads own"
  on public.referrals for select to authenticated
  using (user_id = (select auth.uid()));

create policy "referrals: counsellor reads own"
  on public.referrals for select to authenticated
  using (exists (select 1 from public.my_counsellor() m where m.counsellor_id = referrals.created_by));

revoke all on public.referrals from anon, authenticated;
grant select on public.referrals to authenticated;

-- When the counsellor needs something the patient hasn't shared. owner_id is
-- the person asked (one partner of a couple).
create table public.access_requests (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.counsellor_requests (id) on delete cascade,
  counsellor_id uuid not null references public.counsellors (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  resource      text not null check (resource in ('result', 'values_summary', 'questions', 'ai_summary', 'family_map')),
  level         text not null default 'summary' check (level in ('summary', 'full')),
  status        text not null default 'pending' check (status in ('pending', 'granted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create unique index access_requests_pending_idx
  on public.access_requests (request_id, owner_id, resource) where status = 'pending';

alter table public.access_requests enable row level security;

create policy "access_requests: patient reads own"
  on public.access_requests for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "access_requests: counsellor reads own"
  on public.access_requests for select to authenticated
  using (exists (select 1 from public.my_counsellor() m where m.counsellor_id = access_requests.counsellor_id));

revoke all on public.access_requests from anon, authenticated;
grant select on public.access_requests to authenticated;

-- In-app notifications for patients. Text is built in the app from `kind`.
create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  kind              text not null check (kind in ('access_request', 'referral_created', 'referral_updated')),
  counsellor_id     uuid references public.counsellors (id) on delete set null,
  access_request_id uuid references public.access_requests (id) on delete cascade,
  referral_id       uuid references public.referrals (id) on delete cascade,
  created_at        timestamptz not null default now(),
  read_at           timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications: owner reads own"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: owner marks read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- pro_private: helpers. Not exposed through the API.
-- ---------------------------------------------------------------------------
create schema pro_private;
revoke all on schema pro_private from public, anon, authenticated;
alter default privileges in schema pro_private
  revoke execute on functions from public, anon, authenticated;

-- The caller's counsellor record, or an error.
create function pro_private.require_counsellor(out counsellor_id uuid, out facility_id uuid, out user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select c.id, c.facility_id, c.user_id into counsellor_id, facility_id, user_id
    from public.counsellors c
    join public.profiles p on p.user_id = c.user_id and p.role = 'counsellor'
   where c.user_id = auth.uid();
  if counsellor_id is null then
    raise exception 'counsellor role required' using errcode = '42501';
  end if;
end;
$$;

-- Same rule as the counsellor_requests policy: assigned to me, or open in
-- my facility.
create function pro_private.can_see(r public.counsellor_requests, p_counsellor uuid, p_facility uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    r.assigned_counsellor_id = p_counsellor
    or (r.status = 'open' and r.facility_id = p_facility),
    false)
$$;

-- The request, if the caller can see it; otherwise an error that doesn't
-- reveal whether it exists.
create function pro_private.visible_request(p_request_id uuid, p_counsellor uuid, p_facility uuid)
returns public.counsellor_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.counsellor_requests;
begin
  select * into r from public.counsellor_requests where id = p_request_id;
  if r.id is null or not pro_private.can_see(r, p_counsellor, p_facility) then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  return r;
end;
$$;

-- Acting on an open facility request claims it for the caller.
create function pro_private.claim(p_request_id uuid, p_counsellor uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.counsellor_requests
     set assigned_counsellor_id = p_counsellor
   where id = p_request_id and assigned_counsellor_id is null
$$;

-- The live share level (summary / full) for one resource, or null.
create function pro_private.grant_level(p_owner uuid, p_grantee uuid, p_resource text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.level from public.share_grants g
   where g.owner_id = p_owner and g.grantee_id = p_grantee
     and g.resource = p_resource and g.revoked_at is null
   order by g.granted_at desc
   limit 1
$$;

create function pro_private.has_any_grant(p_owner uuid, p_grantee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.share_grants g
     where g.owner_id = p_owner and g.grantee_id = p_grantee and g.revoked_at is null
  )
$$;

-- A first name, only for couples where that partner has shared something.
create function pro_private.first_name(p_user uuid, p_grantee uuid, p_is_couple boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_is_couple and pro_private.has_any_grant(p_user, p_grantee)
    then nullif(split_part(btrim(coalesce(p.display_name, '')), ' ', 1), '')
  end
  from public.profiles p where p.user_id = p_user
$$;

-- One letter for "Patient R.": the first letter of the last word of the
-- display name.
create function pro_private.initial(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(upper(left(regexp_replace(btrim(coalesce(p.display_name, '')), '^.*\s', ''), 1)), ''),
    '·')
  from public.profiles p where p.user_id = p_user
$$;

-- Values bands. Raw 1..5 numbers never leave the database.
create function pro_private.band(v smallint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v is null then null
    when v >= 5 then 'very_important'
    when v = 4 then 'important'
    when v = 3 then 'somewhat_important'
    else 'less_important'
  end
$$;

create function pro_private.log_access(p_owner uuid, p_resource text, p_level text, p_request uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.access_log (resource_owner_id, viewer_id, resource, level, request_id)
  values (p_owner, auth.uid(), p_resource, p_level, p_request)
$$;

-- One person's shared data on a request, as JSON. Logs every resource it
-- returns. Nothing is returned (or logged) without a live grant.
create function pro_private.person(
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
    select * into res from public.screening_results
     where owner_id = p_user order by claimed_at desc nulls last limit 1;
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

revoke all on all functions in schema pro_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public functions for the workspace (counsellors only)
-- ---------------------------------------------------------------------------

-- For the proxy: is the caller a counsellor? Reveals only the caller's role.
create function public.pro_is_counsellor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'counsellor')
$$;

-- The signed-in counsellor's name and facility, for the side menu.
create function public.pro_me()
returns table (counsellor_id uuid, name text, facility_name text)
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
    select c.id, c.name, f.name
      from public.counsellors c join public.facilities f on f.id = c.facility_id
     where c.id = me.counsellor_id;
end;
$$;

-- Every request the caller can see (queue, patients, sessions), with labels
-- that follow the sharing rules. No result details, no message text.
create function public.pro_requests()
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
    left join public.bookings b on b.request_id = r.id
    where pro_private.can_see(r, me.counsellor_id, me.facility_id);
end;
$$;

-- One request's detail: only what each person shared with the caller. Every
-- resource returned is written to access_log for its owner.
create function public.pro_request_detail(p_request_id uuid)
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

  select * into b from public.bookings where request_id = r.id;
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
      'meeting_url', b.meeting_url, 'attended_at', b.attended_at) end,
    'people', people,
    'values', vals,
    'request_summary', req_summary,
    'note', case when note.id is null then null
                 else jsonb_build_object('body', note.body, 'updated_at', note.updated_at) end,
    'referrals', refs
  );
end;
$$;

-- Asks one person on the request to share a resource. Creates the
-- access_requests row and an in-app notification for them.
-- Returns 'requested', 'already_shared' or 'already_pending'.
create function public.pro_request_access(p_request_id uuid, p_person text, p_resource text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    record;
  r     public.counsellor_requests;
  owner uuid;
  ar_id uuid;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  if p_person not in ('user', 'partner') then
    raise exception 'unknown person' using errcode = '22023';
  end if;
  if p_resource not in ('result', 'values_summary', 'questions', 'ai_summary', 'family_map') then
    raise exception 'unknown resource' using errcode = '22023';
  end if;
  owner := case when p_person = 'user' then r.user_id else r.partner_user_id end;
  if owner is null then
    raise exception 'unknown person' using errcode = '22023';
  end if;

  if pro_private.grant_level(owner, me.user_id, p_resource) is not null then
    return 'already_shared';
  end if;
  if exists (
    select 1 from public.access_requests
     where request_id = r.id and owner_id = owner and resource = p_resource and status = 'pending'
  ) then
    return 'already_pending';
  end if;

  perform pro_private.claim(r.id, me.counsellor_id);

  insert into public.access_requests (request_id, counsellor_id, owner_id, resource, level)
  values (r.id, me.counsellor_id, owner, p_resource,
          case when p_resource in ('result', 'family_map') then 'full' else 'summary' end)
  returning id into ar_id;

  insert into public.notifications (user_id, kind, counsellor_id, access_request_id)
  values (owner, 'access_request', me.counsellor_id, ar_id);

  return 'requested';
end;
$$;

-- Saves the caller's private note on a request (autosave).
create function public.pro_save_note(p_request_id uuid, p_body text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me    record;
  r     public.counsellor_requests;
  saved timestamptz;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  if char_length(coalesce(p_body, '')) > 20000 then
    raise exception 'note too long' using errcode = '22001';
  end if;
  insert into public.session_notes (request_id, counsellor_id, facility_id, body)
  values (r.id, me.counsellor_id, me.facility_id, coalesce(p_body, ''))
  on conflict (request_id, counsellor_id)
  do update set body = excluded.body, updated_at = now()
  returning updated_at into saved;
  return saved;
end;
$$;

-- Starts the video session: makes sure there is a booking with a meeting
-- link (a placeholder room in the demo) and marks the request in_session.
create function public.pro_start_session(p_request_id uuid)
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

  insert into public.bookings (request_id, counsellor_id, starts_at, format, partner_invited)
  values (r.id, me.counsellor_id, now(), 'video', r.partner_user_id is not null)
  on conflict (request_id) do nothing;

  -- MOCK: a placeholder in-app room. Swap for the real video provider.
  update public.bookings
     set meeting_url = coalesce(meeting_url, '/pro/video/' || id::text)
   where request_id = r.id
  returning * into b;

  update public.counsellor_requests set status = 'in_session' where id = r.id;
  return b.meeting_url;
end;
$$;

-- Marks the session as attended. Logs session_attended for each patient
-- (it feeds counselling uptake and time to referral on the dashboard).
create function public.pro_mark_attended(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  r  public.counsellor_requests;
  updated integer;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  update public.bookings set attended_at = now()
   where request_id = r.id and attended_at is null;
  get diagnostics updated = row_count;
  if updated = 0 then return; end if;

  insert into public.events (user_id, name, props)
  select u, 'session_attended', '{}'::jsonb
    from unnest(array[r.user_id, r.partner_user_id]) u where u is not null;
end;
$$;

-- Orders a confirmatory test or a specialist referral for everyone on the
-- request. Each patient gets a referrals row, a notification and a
-- referral_created event. Returns the number of referrals created.
create function public.pro_create_referral(p_request_id uuid, p_step text, p_service_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     record;
  r      public.counsellor_requests;
  svc    public.services;
  patient uuid;
  ref_id uuid;
  n      integer := 0;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  if r.status = 'closed' then
    raise exception 'request is closed' using errcode = '22023';
  end if;
  if p_step not in ('confirmatory_test', 'specialist') then
    raise exception 'unknown step' using errcode = '22023';
  end if;
  if p_step = 'specialist' then
    select * into svc from public.services where id = p_service_id and kind <> 'confirmatory_testing';
    if svc.id is null then
      raise exception 'choose a specialist service' using errcode = '22023';
    end if;
  else
    select * into svc from public.services where kind = 'confirmatory_testing' order by sort limit 1;
  end if;

  perform pro_private.claim(r.id, me.counsellor_id);

  foreach patient in array array_remove(array[r.user_id, r.partner_user_id], null) loop
    insert into public.referrals (user_id, request_id, step, service_id, created_by)
    values (patient, r.id, p_step, svc.id, me.counsellor_id)
    returning id into ref_id;
    insert into public.notifications (user_id, kind, counsellor_id, referral_id)
    values (patient, 'referral_created', me.counsellor_id, ref_id);
    insert into public.events (user_id, name, props)
    values (patient, 'referral_created', jsonb_build_object('step', p_step));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Updates a referral the caller created. Returns its step (for the event).
create function public.pro_update_referral(p_referral_id uuid, p_status text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  record;
  ref public.referrals;
begin
  select * into me from pro_private.require_counsellor();
  if p_status not in ('scheduled', 'done', 'cancelled') then
    raise exception 'unknown status' using errcode = '22023';
  end if;
  update public.referrals set status = p_status, updated_at = now()
   where id = p_referral_id and created_by = me.counsellor_id
  returning * into ref;
  if ref.id is null then
    raise exception 'referral not found' using errcode = 'P0002';
  end if;
  insert into public.notifications (user_id, kind, counsellor_id, referral_id)
  values (ref.user_id, 'referral_updated', me.counsellor_id, ref.id);
  return ref.step;
end;
$$;

-- Closes a request with an outcome category (guardrail 11: nothing else).
create function public.pro_close_request(p_request_id uuid, p_outcome text, p_follow_up_on date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me record;
  r  public.counsellor_requests;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  if p_outcome is null or p_outcome not in (
    'information_given', 'follow_up_booked', 'referred_confirmatory_test',
    'referred_specialist', 'patient_withdrew') then
    raise exception 'choose an outcome' using errcode = '22023';
  end if;
  if p_follow_up_on is not null and p_follow_up_on < current_date then
    raise exception 'follow-up date is in the past' using errcode = '22023';
  end if;
  update public.counsellor_requests
     set status = 'closed', outcome = p_outcome, follow_up_on = p_follow_up_on,
         closed_at = now(), assigned_counsellor_id = coalesce(assigned_counsellor_id, me.counsellor_id)
   where id = r.id;
end;
$$;

-- Referrals the caller created, with the patient label.
create function public.pro_referrals()
returns table (
  id                 uuid,
  request_id         uuid,
  step               text,
  status             text,
  service_kind       text,
  service_name       text,
  created_at         timestamptz,
  updated_at         timestamptz,
  is_couple          boolean,
  first_name         text,
  initial            text
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
    select x.id, x.request_id, x.step, x.status, s.kind, s.name, x.created_at, x.updated_at,
           r.partner_user_id is not null,
           pro_private.first_name(x.user_id, me.user_id, r.partner_user_id is not null),
           pro_private.initial(x.user_id)
      from public.referrals x
      left join public.services s on s.id = x.service_id
      left join public.counsellor_requests r on r.id = x.request_id
     where x.created_by = me.counsellor_id
     order by x.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Patient-side functions
-- ---------------------------------------------------------------------------

-- Answers a counsellor's access request. Sharing creates (or upgrades) the
-- share_grants row; "Not now" just closes the request.
create function public.respond_access_request(p_access_request_id uuid, p_share boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  ar      public.access_requests;
  grantee uuid;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into ar from public.access_requests
   where id = p_access_request_id and owner_id = caller
   for update;
  if ar.id is null then
    raise exception 'access request not found' using errcode = 'P0002';
  end if;
  if ar.status <> 'pending' then
    return ar.status;
  end if;

  if p_share then
    select c.user_id into grantee from public.counsellors c where c.id = ar.counsellor_id;
    if grantee is null then
      raise exception 'counsellor not found' using errcode = 'P0002';
    end if;
    update public.share_grants set revoked_at = now()
     where owner_id = caller and grantee_id = grantee and resource = ar.resource and revoked_at is null;
    insert into public.share_grants (owner_id, grantee_id, resource, level, request_id)
    values (caller, grantee, ar.resource, ar.level, ar.request_id);
  end if;

  update public.access_requests
     set status = case when p_share then 'granted' else 'declined' end, responded_at = now()
   where id = ar.id;
  update public.notifications set read_at = now()
   where access_request_id = ar.id and user_id = caller and read_at is null;

  return case when p_share then 'granted' else 'declined' end;
end;
$$;

-- The caller's notifications, with the counsellor's name.
create function public.my_notifications()
returns table (
  id                uuid,
  kind              text,
  counsellor_name   text,
  resource          text,
  access_request_id uuid,
  access_status     text,
  step              text,
  referral_status   text,
  service_name      text,
  created_at        timestamptz,
  read_at           timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, c.name, a.resource, a.id, a.status, x.step, x.status, s.name,
         n.created_at, n.read_at
    from public.notifications n
    left join public.counsellors c on c.id = n.counsellor_id
    left join public.access_requests a on a.id = n.access_request_id
    left join public.referrals x on x.id = n.referral_id
    left join public.services s on s.id = x.service_id
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit 20
$$;

-- Who viewed the caller's shared data (Privacy & consent).
create function public.my_access_log()
returns table (id uuid, viewer_name text, resource text, level text, viewed_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, coalesce(c.name, split_part(coalesce(p.display_name, ''), ' ', 1)), l.resource, l.level, l.viewed_at
    from public.access_log l
    left join public.counsellors c on c.user_id = l.viewer_id
    left join public.profiles p on p.user_id = l.viewer_id
   where l.resource_owner_id = auth.uid()
   order by l.viewed_at desc
   limit 50
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.pro_is_counsellor() from public, anon;
revoke all on function public.pro_me() from public, anon;
revoke all on function public.pro_requests() from public, anon;
revoke all on function public.pro_request_detail(uuid) from public, anon;
revoke all on function public.pro_request_access(uuid, text, text) from public, anon;
revoke all on function public.pro_save_note(uuid, text) from public, anon;
revoke all on function public.pro_start_session(uuid) from public, anon;
revoke all on function public.pro_mark_attended(uuid) from public, anon;
revoke all on function public.pro_create_referral(uuid, text, uuid) from public, anon;
revoke all on function public.pro_update_referral(uuid, text) from public, anon;
revoke all on function public.pro_close_request(uuid, text, date) from public, anon;
revoke all on function public.pro_referrals() from public, anon;
revoke all on function public.respond_access_request(uuid, boolean) from public, anon;
revoke all on function public.my_notifications() from public, anon;
revoke all on function public.my_access_log() from public, anon;
revoke all on function public.counsellors_sync_facility() from public, anon, authenticated;
revoke all on function public.counsellor_requests_sync_facility() from public, anon, authenticated;

-- Signed-in users may call these; every pro_* function checks the counsellor
-- role itself and raises for anyone else.
grant execute on function public.pro_is_counsellor() to authenticated;
grant execute on function public.pro_me() to authenticated;
grant execute on function public.pro_requests() to authenticated;
grant execute on function public.pro_request_detail(uuid) to authenticated;
grant execute on function public.pro_request_access(uuid, text, text) to authenticated;
grant execute on function public.pro_save_note(uuid, text) to authenticated;
grant execute on function public.pro_start_session(uuid) to authenticated;
grant execute on function public.pro_mark_attended(uuid) to authenticated;
grant execute on function public.pro_create_referral(uuid, text, uuid) to authenticated;
grant execute on function public.pro_update_referral(uuid, text) to authenticated;
grant execute on function public.pro_close_request(uuid, text, date) to authenticated;
grant execute on function public.pro_referrals() to authenticated;
grant execute on function public.respond_access_request(uuid, boolean) to authenticated;
grant execute on function public.my_notifications() to authenticated;
grant execute on function public.my_access_log() to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: new requests appear in the queue live; patients see new
-- notifications (and tracker changes) without reloading. RLS still applies
-- to every change delivered. Skipped where the publication doesn't exist.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.counsellor_requests, public.notifications;
  end if;
end;
$$;
