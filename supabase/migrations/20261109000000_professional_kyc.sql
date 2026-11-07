-- Task 14: health professional sign-up and verification (KYC).
--
-- Guardrails 15 and 16:
--   - Anyone can sign up as a health professional (role 'professional'), but
--     until a human admin verifies their licence they can never see, contact,
--     be booked by or appear to a patient. This is enforced here, not in the
--     UI: every professional path to patient data goes through
--     is_verified_professional().
--   - The one place that matters most: my_counsellor() and
--     pro_private.require_counsellor() (task 07) now require a verified
--     professional, so every counsellor_requests policy, every pro_*
--     function, bookings, referrals, session notes and access_log writes
--     lock at once when a professional is unverified, pending, rejected,
--     expired or suspended.
--   - Verification documents live in a private bucket with no user policies
--     at all. The app encrypts them before upload and serves them to admins
--     only, through a server route. Paths are cleared (and the files
--     deleted) after the decision; only the outcome, licence number,
--     authority, expiry and an append-only audit trail remain.
--   - The facility code is gone as a way in. facilities.code stays only as
--     an internal routing key for the queue.

-- ---------------------------------------------------------------------------
-- 1. Roles: counsellor → professional, plus admin
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'professional' where role = 'counsellor';
alter table public.profiles add constraint profiles_role_check
  check (role in ('individual', 'professional', 'analyst', 'admin'));

-- The old demo facility codes looked like sign-in codes. They are internal
-- routing keys now.
update public.facilities set code = 'GB-INTAKE' where code = 'GB-DEMO-001';
update public.facilities set code = 'GB-SITE-2' where code = 'GB-DEMO-002';
update public.counsellors c set facility_code = f.code
  from public.facilities f where f.id = c.facility_id and c.facility_code is distinct from f.code;
update public.counsellor_requests r set facility_code = f.code
  from public.facilities f where f.id = r.facility_id and r.facility_code is distinct from f.code;

-- ---------------------------------------------------------------------------
-- 2. professional_profiles
-- ---------------------------------------------------------------------------
create table public.professional_profiles (
  user_id             uuid primary key references public.profiles (user_id) on delete cascade,
  display_name        text not null default '' check (char_length(display_name) <= 120),
  profession          text check (profession in ('genetic_counsellor', 'medical_geneticist', 'physician', 'nurse', 'other')),
  specialties         text[] not null default '{}' check (cardinality(specialties) <= 12),
  languages           text[] not null default '{}' check (cardinality(languages) <= 10),
  years_experience    smallint check (years_experience between 0 and 70),
  facility_name       text check (char_length(facility_name) <= 160),
  bio                 text check (char_length(bio) <= 400),
  photo_path          text check (char_length(photo_path) <= 200),
  notify_email        boolean not null default true,
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'expired', 'suspended')),
  licence_number      text check (char_length(licence_number) <= 64),
  licence_authority   text check (licence_authority in ('doh_abu_dhabi', 'mohap', 'dha', 'other')),
  licence_expiry      date,
  verified_at         timestamptz,
  verified_by         uuid references auth.users (id) on delete set null,
  accepting_patients  boolean not null default false,
  welcome_seen_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint professional_profiles_accepting_only_when_verified
    check (not accepting_patients or verification_status = 'verified')
);

alter table public.professional_profiles enable row level security;

create policy "professional_profiles: read own"
  on public.professional_profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "professional_profiles: update own details"
  on public.professional_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are created by the server at sign-up (service role). The professional
-- may edit only their own details; verification and accepting_patients are
-- not grantable.
revoke all on public.professional_profiles from anon, authenticated;
grant select on public.professional_profiles to authenticated;
grant update (display_name, profession, specialties, languages, years_experience,
              facility_name, bio, photo_path, notify_email, welcome_seen_at)
  on public.professional_profiles to authenticated;

-- Belt and braces: verification fields change only inside the security
-- definer admin functions below (which run as the table owner) or with the
-- service role, even if a column grant is loosened later.
create function public.professional_profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.verification_status is distinct from old.verification_status
      or new.licence_number is distinct from old.licence_number
      or new.licence_authority is distinct from old.licence_authority
      or new.licence_expiry is distinct from old.licence_expiry
      or new.verified_at is distinct from old.verified_at
      or new.verified_by is distinct from old.verified_by
      or new.accepting_patients is distinct from old.accepting_patients
      or new.user_id is distinct from old.user_id)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'verification fields cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger professional_profiles_guard
  before update on public.professional_profiles
  for each row execute function public.professional_profiles_guard();

-- ---------------------------------------------------------------------------
-- 3. The checks everything else uses
-- ---------------------------------------------------------------------------

-- Verified, licence in date, and still a professional. Expiry is checked
-- here too, so access ends on the day the licence expires even before the
-- daily job runs.
create function public.is_verified_professional(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pp.verification_status = 'verified'
           and (pp.licence_expiry is null or pp.licence_expiry >= current_date)
      from public.professional_profiles pp
      join public.profiles p on p.user_id = pp.user_id and p.role = 'professional'
     where pp.user_id = uid), false)
$$;

-- Verified and accepting new patients: the directory, new conversations and
-- patient bookings.
create function public.is_bookable_professional(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_professional(uid)
     and coalesce((select pp.accepting_patients from public.professional_profiles pp where pp.user_id = uid), false)
$$;

-- Any professional, verified or not: for the proxy, so unverified
-- professionals can reach their own /pro dashboard (which shows locked
-- pages and holds no patient data).
create function public.pro_is_professional()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'professional')
$$;

create function public.kyc_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
$$;

-- ---------------------------------------------------------------------------
-- 4. Task 07's chokepoints now require a verified professional
-- ---------------------------------------------------------------------------
create or replace function public.my_counsellor()
returns table (counsellor_id uuid, facility_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.facility_id
    from public.counsellors c
   where c.user_id = auth.uid()
     and public.is_verified_professional(c.user_id)
$$;

create or replace function pro_private.require_counsellor(out counsellor_id uuid, out facility_id uuid, out user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select c.id, c.facility_id, c.user_id into counsellor_id, facility_id, user_id
    from public.counsellors c
   where c.user_id = auth.uid()
     and public.is_verified_professional(c.user_id);
  if counsellor_id is null then
    raise exception 'verified professional required' using errcode = '42501';
  end if;
end;
$$;

-- Workspace actions (server actions) check this. Verified only.
create or replace function public.pro_is_counsellor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_verified_professional(auth.uid())
$$;

-- Reading a shared family map (task 13): the grantee must be verified now.
create or replace function public.family_map_readable(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = auth.uid()
      or (
        public.is_verified_professional(auth.uid())
        and exists (
          select 1 from public.share_grants g
           where g.owner_id = p_owner and g.grantee_id = auth.uid()
             and g.resource = 'family_map' and g.revoked_at is null
        )
      )
$$;

-- Live share levels count only for verified professionals, so a suspended
-- professional's old grants read as nothing.
create or replace function pro_private.grant_level(p_owner uuid, p_grantee uuid, p_resource text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select g.level from public.share_grants g
   where g.owner_id = p_owner and g.grantee_id = p_grantee
     and g.resource = p_resource and g.revoked_at is null
     and public.is_verified_professional(p_grantee)
   order by g.granted_at desc
   limit 1
$$;

revoke all on function pro_private.require_counsellor() from public, anon, authenticated;
revoke all on function pro_private.grant_level(uuid, uuid, text) from public, anon, authenticated;

-- Patients see only verified professionals' names.
drop policy if exists "counsellors: signed-in users can list" on public.counsellors;
create policy "counsellors: verified professionals are listed"
  on public.counsellors for select to authenticated
  using (public.is_verified_professional(user_id));

-- ---------------------------------------------------------------------------
-- 5. Guards on patient-facing writes
-- ---------------------------------------------------------------------------

-- share_grants: never to an unverified professional. Grants between
-- partners (individuals) are unaffected.
create function public.share_grants_professional_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where user_id = new.grantee_id and role in ('professional', 'admin', 'analyst'))
     and not public.is_verified_professional(new.grantee_id) then
    raise exception 'professional not available' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger share_grants_professional_guard
  before insert on public.share_grants
  for each row execute function public.share_grants_professional_guard();

-- access_log: a professional viewer must be verified. Partners' reads
-- (couple view) are unaffected.
create function public.access_log_professional_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.viewer_id is not null
     and exists (select 1 from public.profiles where user_id = new.viewer_id and role <> 'individual')
     and not public.is_verified_professional(new.viewer_id) then
    raise exception 'verified professional required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger access_log_professional_guard
  before insert on public.access_log
  for each row execute function public.access_log_professional_guard();

-- bookings: the professional must be verified; anyone else booking them
-- (a patient, or the seed) also needs them to be accepting patients. A
-- verified professional starting a session on a request they already hold
-- (pro_start_session) needs only to be verified.
alter table public.bookings
  add column flagged_at  timestamptz,
  add column flag_reason text check (flag_reason in ('suspended', 'expired'));

create function public.bookings_professional_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pro uuid;
begin
  select c.user_id into pro from public.counsellors c where c.id = new.counsellor_id;
  if pro is null or not public.is_verified_professional(pro) then
    raise exception 'professional not available' using errcode = '42501';
  end if;
  if pro is distinct from auth.uid() and not public.is_bookable_professional(pro) then
    raise exception 'professional not accepting patients' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger bookings_professional_guard
  before insert on public.bookings
  for each row execute function public.bookings_professional_guard();

-- Admins see bookings that need a new professional.
create index bookings_flagged_idx on public.bookings (flagged_at) where flagged_at is not null;

-- ---------------------------------------------------------------------------
-- 6. Conversations between a patient and a professional
-- ---------------------------------------------------------------------------
-- The tables and their rules; the directory and messaging screens arrive
-- with task 15. A professional reads nothing unless verified, a patient can
-- start a conversation only with a verified professional who is accepting
-- patients, and nobody can send a message while the professional is
-- unverified, expired, suspended or rejected.
create table public.pro_conversations (
  id              uuid primary key default gen_random_uuid(),
  patient_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  professional_id uuid not null references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (patient_id, professional_id),
  constraint pro_conversations_not_self check (patient_id <> professional_id)
);

create index pro_conversations_professional_idx on public.pro_conversations (professional_id);

create table public.pro_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.pro_conversations (id) on delete cascade,
  sender_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now()
);

create index pro_messages_conversation_idx on public.pro_messages (conversation_id, created_at);

alter table public.pro_conversations enable row level security;
alter table public.pro_messages enable row level security;

create policy "pro_conversations: patient or verified professional reads"
  on public.pro_conversations for select to authenticated
  using (
    patient_id = (select auth.uid())
    or (professional_id = (select auth.uid()) and public.is_verified_professional(professional_id))
  );

create policy "pro_conversations: patient starts with a bookable professional"
  on public.pro_conversations for insert to authenticated
  with check (
    patient_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.user_id = (select auth.uid()) and p.role = 'individual')
    and public.is_bookable_professional(professional_id)
  );

create function public.pro_conversation_open_to(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_conversations c
     where c.id = p_conversation
       and public.is_verified_professional(c.professional_id)
       and (c.patient_id = p_user or c.professional_id = p_user)
  )
$$;

create function public.pro_conversation_readable_by(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pro_conversations c
     where c.id = p_conversation
       and (c.patient_id = p_user
            or (c.professional_id = p_user and public.is_verified_professional(p_user)))
  )
$$;

create policy "pro_messages: participants read"
  on public.pro_messages for select to authenticated
  using (public.pro_conversation_readable_by(conversation_id, (select auth.uid())));

create policy "pro_messages: participants send while verified"
  on public.pro_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.pro_conversation_open_to(conversation_id, (select auth.uid()))
  );

revoke all on public.pro_conversations, public.pro_messages from anon, authenticated;
grant select, insert on public.pro_conversations to authenticated;
grant select, insert on public.pro_messages to authenticated;

-- The patient's conversations, with whether the professional is available.
-- When they're not, the app shows "This professional is currently
-- unavailable. Choose another professional."
create function public.my_pro_conversations()
returns table (id uuid, professional_id uuid, professional_name text, available boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.professional_id, pp.display_name, public.is_verified_professional(c.professional_id), c.created_at
    from public.pro_conversations c
    left join public.professional_profiles pp on pp.user_id = c.professional_id
   where c.patient_id = auth.uid()
   order by c.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- 7. The directory (task 15 builds the screen on this)
-- ---------------------------------------------------------------------------
create function public.professional_directory()
returns table (
  user_id          uuid,
  display_name     text,
  profession       text,
  specialties      text[],
  languages        text[],
  years_experience smallint,
  facility_name    text,
  bio              text
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.user_id, pp.display_name, pp.profession, pp.specialties, pp.languages,
         pp.years_experience, pp.facility_name, pp.bio
    from public.professional_profiles pp
   where auth.uid() is not null
     and public.is_bookable_professional(pp.user_id)
   order by pp.display_name
$$;

-- ---------------------------------------------------------------------------
-- 8. Weekly availability (saved now, shown to patients from task 15, and
--    only for verified professionals)
-- ---------------------------------------------------------------------------
create table public.professional_availability (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.professional_profiles (user_id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  starts_at  time not null,
  ends_at    time not null,
  constraint professional_availability_order check (ends_at > starts_at),
  unique (user_id, weekday, starts_at)
);

alter table public.professional_availability enable row level security;

create policy "professional_availability: own"
  on public.professional_availability for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.professional_availability from anon, authenticated;
grant select, insert, update, delete on public.professional_availability to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Verification submissions and the audit trail
-- ---------------------------------------------------------------------------
create table public.verification_submissions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references public.professional_profiles (user_id) on delete cascade,
  -- Government ID (front, and back if needed), the licence (one or more
  -- pages) and an optional selfie. Encrypted files in kyc-documents.
  -- Cleared after the decision.
  id_document_paths       text[] not null default '{}' check (cardinality(id_document_paths) <= 2),
  licence_document_paths  text[] not null default '{}' check (cardinality(licence_document_paths) <= 5),
  selfie_path             text,
  entered_licence_number  text not null check (char_length(btrim(entered_licence_number)) between 2 and 64),
  entered_authority       text not null check (entered_authority in ('doh_abu_dhabi', 'mohap', 'dha', 'other')),
  entered_authority_other text check (char_length(entered_authority_other) <= 120),
  entered_expiry          date not null,
  -- AI pre-check (lib/kyc/precheck.ts). Assists the admin; never decides.
  ai_precheck             jsonb,
  status                  text not null default 'submitted'
                          check (status in ('submitted', 'in_review', 'approved', 'rejected', 'needs_more_info')),
  reviewer_id             uuid references auth.users (id) on delete set null,
  reviewer_notes          text check (char_length(reviewer_notes) <= 2000),
  decided_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- One open submission per professional.
create unique index verification_submissions_open_idx
  on public.verification_submissions (user_id) where status in ('submitted', 'in_review');
create index verification_submissions_queue_idx
  on public.verification_submissions (created_at) where status in ('submitted', 'in_review');

alter table public.verification_submissions enable row level security;

-- Every stored path must sit in the caller's own folder.
create function public.kyc_paths_owned(p_paths text[], p_user uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(p like p_user::text || '/%' and p !~ '\.\.'), true) from unnest(p_paths) p
$$;

-- May this professional submit now? Not while one is open, and not when
-- verified or suspended. Answers only for the caller, so it reveals nothing
-- about anyone else.
create function public.kyc_can_submit(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = auth.uid()
  and exists (
    select 1 from public.professional_profiles pp
      join public.profiles p on p.user_id = pp.user_id and p.role = 'professional'
     where pp.user_id = p_user and pp.verification_status in ('unverified', 'rejected', 'expired')
  )
  and not exists (
    select 1 from public.verification_submissions s
     where s.user_id = p_user and s.status in ('submitted', 'in_review')
  )
$$;

create policy "verification_submissions: professional reads own"
  on public.verification_submissions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "verification_submissions: professional creates own"
  on public.verification_submissions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.kyc_can_submit((select auth.uid()))
    and cardinality(id_document_paths) >= 1
    and cardinality(licence_document_paths) >= 1
    and public.kyc_paths_owned(id_document_paths || licence_document_paths || array_remove(array[selfie_path], null), (select auth.uid()))
  );

-- The professional sees their own status and the reviewer's message, never
-- the AI pre-check or the storage paths. Only the typed fields are
-- insertable, so status, ai_precheck and reviewer fields can't be forged.
revoke all on public.verification_submissions from anon, authenticated;
grant select (id, user_id, entered_licence_number, entered_authority, entered_authority_other,
              entered_expiry, status, reviewer_notes, decided_at, created_at)
  on public.verification_submissions to authenticated;
grant insert (id_document_paths, licence_document_paths, selfie_path, entered_licence_number,
              entered_authority, entered_authority_other, entered_expiry)
  on public.verification_submissions to authenticated;

-- Append-only. No foreign keys, so the trail outlives the submission and
-- the accounts. subject_user_id is the professional the action is about.
create table public.verification_audit (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid,
  subject_user_id uuid,
  actor_id        uuid,
  action          text not null check (action in (
                    'submitted', 'precheck_completed', 'viewed', 'document_viewed', 'registry_opened',
                    'approved', 'needs_more_info', 'rejected', 'documents_deleted', 'suspended', 'expired')),
  created_at      timestamptz not null default now()
);

create index verification_audit_submission_idx on public.verification_audit (submission_id, created_at);
create index verification_audit_subject_idx on public.verification_audit (subject_user_id, created_at);

alter table public.verification_audit enable row level security;
revoke all on public.verification_audit from anon, authenticated;

create function public.verification_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'verification_audit is append-only' using errcode = '42501';
end;
$$;

create trigger verification_audit_append_only
  before update or delete on public.verification_audit
  for each row execute function public.verification_audit_append_only();

create function public.kyc_audit(p_submission uuid, p_subject uuid, p_action text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.verification_audit (submission_id, subject_user_id, actor_id, action)
  values (p_submission, p_subject, auth.uid(), p_action)
$$;
revoke all on function public.kyc_audit(uuid, uuid, text) from public, anon, authenticated;

-- In-app notifications at each status change.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('access_request', 'referral_created', 'referral_updated', 'kyc_status'));
alter table public.notifications
  add column kyc_status text check (kyc_status in ('pending', 'verified', 'rejected', 'needs_more_info', 'expired', 'suspended'));

create function public.kyc_notify(p_user uuid, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, kyc_status) values (p_user, 'kyc_status', p_status)
$$;
revoke all on function public.kyc_notify(uuid, text) from public, anon, authenticated;

-- A new submission: status becomes pending, audit and notify.
create function public.verification_submissions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.professional_profiles set verification_status = 'pending' where user_id = new.user_id;
  perform public.kyc_audit(new.id, new.user_id, 'submitted');
  perform public.kyc_notify(new.user_id, 'pending');
  return new;
end;
$$;

create trigger verification_submissions_after_insert
  after insert on public.verification_submissions
  for each row execute function public.verification_submissions_after_insert();

create function public.verification_submissions_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger verification_submissions_touch
  before update on public.verification_submissions
  for each row execute function public.verification_submissions_touch();

-- ---------------------------------------------------------------------------
-- 10. Admin functions
-- ---------------------------------------------------------------------------
create function public.kyc_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.kyc_is_admin() then
    raise exception 'admin role required' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;
revoke all on function public.kyc_require_admin() from public, anon, authenticated;

-- Counts of passed / failed / unclear checks in a pre-check, for the queue.
create function public.kyc_precheck_counts(p jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'passed',  count(*) filter (where c.value = 'passed'),
    'failed',  count(*) filter (where c.value = 'failed'),
    'unclear', count(*) filter (where c.value = 'unclear'))
    from jsonb_each_text(coalesce(p -> 'checks', '{}'::jsonb)) c
$$;

-- Pending submissions, oldest first.
create function public.kyc_admin_queue()
returns table (
  id                uuid,
  user_id           uuid,
  display_name      text,
  profession        text,
  entered_authority text,
  status            text,
  precheck_status   text,
  precheck_counts   jsonb,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kyc_require_admin();
  return query
    select s.id, s.user_id, pp.display_name, pp.profession, s.entered_authority, s.status,
           coalesce(s.ai_precheck ->> 'status', 'pending'), public.kyc_precheck_counts(s.ai_precheck), s.created_at
      from public.verification_submissions s
      join public.professional_profiles pp on pp.user_id = s.user_id
     where s.status in ('submitted', 'in_review')
     order by s.created_at;
end;
$$;

-- Professionals who are (or were) verified, for suspending.
create function public.kyc_admin_professionals()
returns table (
  user_id             uuid,
  display_name        text,
  profession          text,
  verification_status text,
  licence_number      text,
  licence_authority   text,
  licence_expiry      date,
  accepting_patients  boolean,
  verified_at         timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kyc_require_admin();
  return query
    select pp.user_id, pp.display_name, pp.profession, pp.verification_status, pp.licence_number,
           pp.licence_authority, pp.licence_expiry, pp.accepting_patients, pp.verified_at
      from public.professional_profiles pp
     where pp.verification_status in ('verified', 'suspended', 'expired')
     order by pp.display_name;
end;
$$;

-- One submission for review. Opening it moves it to in_review and is
-- audited.
create function public.kyc_admin_submission(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := public.kyc_require_admin();
  s     public.verification_submissions;
  pp    public.professional_profiles;
begin
  select * into s from public.verification_submissions where id = p_id;
  if s.id is null then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;
  if s.status = 'submitted' then
    update public.verification_submissions set status = 'in_review', reviewer_id = admin where id = s.id
    returning * into s;
  end if;
  select * into pp from public.professional_profiles where user_id = s.user_id;
  perform public.kyc_audit(s.id, s.user_id, 'viewed');

  return jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'status', s.status,
    'created_at', s.created_at,
    'decided_at', s.decided_at,
    'reviewer_notes', s.reviewer_notes,
    'entered_licence_number', s.entered_licence_number,
    'entered_authority', s.entered_authority,
    'entered_authority_other', s.entered_authority_other,
    'entered_expiry', s.entered_expiry,
    'id_document_paths', to_jsonb(s.id_document_paths),
    'licence_document_paths', to_jsonb(s.licence_document_paths),
    'selfie_path', s.selfie_path,
    'ai_precheck', s.ai_precheck,
    'professional', jsonb_build_object(
      'display_name', pp.display_name,
      'profession', pp.profession,
      'specialties', to_jsonb(pp.specialties),
      'languages', to_jsonb(pp.languages),
      'years_experience', pp.years_experience,
      'facility_name', pp.facility_name,
      'verification_status', pp.verification_status)
  );
end;
$$;

-- Document views and registry lookups from the review screen.
create function public.kyc_admin_log(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject uuid;
begin
  perform public.kyc_require_admin();
  if p_action not in ('document_viewed', 'registry_opened') then
    raise exception 'unknown action' using errcode = '22023';
  end if;
  select s.user_id into subject from public.verification_submissions s where s.id = p_id;
  if subject is null then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;
  perform public.kyc_audit(p_id, subject, p_action);
end;
$$;

-- Is this storage path part of this open submission? The document route
-- serves only paths that are.
create function public.kyc_admin_document_allowed(p_id uuid, p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kyc_require_admin();
  return exists (
    select 1 from public.verification_submissions s
     where s.id = p_id
       and p_path = any (s.id_document_paths || s.licence_document_paths || array_remove(array[s.selfie_path], null))
  );
end;
$$;

-- Shared by the three decisions: records the outcome, keeps only the
-- pre-check's pass/fail chips (no names or numbers read from the
-- documents), clears the paths and returns them so the server deletes the
-- files.
create function public.kyc_close_submission(p_id uuid, p_status text, p_notes text, out paths text[], out subject uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin uuid := public.kyc_require_admin();
  s     public.verification_submissions;
begin
  select * into s from public.verification_submissions where id = p_id for update;
  if s.id is null then
    raise exception 'submission not found' using errcode = 'P0002';
  end if;
  if s.status not in ('submitted', 'in_review') then
    raise exception 'submission already decided' using errcode = '22023';
  end if;
  paths := s.id_document_paths || s.licence_document_paths || array_remove(array[s.selfie_path], null);
  subject := s.user_id;
  update public.verification_submissions
     set status = p_status,
         reviewer_id = admin,
         reviewer_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         decided_at = now(),
         id_document_paths = '{}',
         licence_document_paths = '{}',
         selfie_path = null,
         ai_precheck = case when ai_precheck is null then null
                            else jsonb_build_object('status', ai_precheck -> 'status', 'checks', ai_precheck -> 'checks') end
   where id = s.id;
end;
$$;
revoke all on function public.kyc_close_submission(uuid, text, text) from public, anon, authenticated;

create function public.kyc_admin_approve(p_id uuid, p_licence_number text, p_authority text, p_expiry date)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin   uuid := public.kyc_require_admin();
  closed  record;
  pp      public.professional_profiles;
  intake  uuid;
begin
  if char_length(btrim(coalesce(p_licence_number, ''))) not between 2 and 64 then
    raise exception 'licence number required' using errcode = '22023';
  end if;
  if p_authority not in ('doh_abu_dhabi', 'mohap', 'dha', 'other') then
    raise exception 'unknown authority' using errcode = '22023';
  end if;
  if p_expiry is null or p_expiry <= current_date then
    raise exception 'licence must not be expired' using errcode = '22023';
  end if;

  select * into closed from public.kyc_close_submission(p_id, 'approved', null);

  update public.professional_profiles
     set verification_status = 'verified',
         licence_number = btrim(p_licence_number),
         licence_authority = p_authority,
         licence_expiry = p_expiry,
         verified_at = now(),
         verified_by = admin,
         accepting_patients = false
   where user_id = closed.subject
  returning * into pp;

  -- The workspace record (task 07): joins the programme's intake queue.
  select f.id into intake from public.facilities f order by f.code limit 1;
  if intake is null then
    insert into public.facilities (name, code) values ('[Facility name]', 'GB-INTAKE') returning id into intake;
  end if;
  insert into public.counsellors (user_id, name, languages, facility_id)
  values (closed.subject, coalesce(nullif(pp.display_name, ''), 'Professional'), pp.languages, intake)
  on conflict (user_id) do update set name = excluded.name, languages = excluded.languages;

  perform public.kyc_audit(p_id, closed.subject, 'approved');
  perform public.kyc_notify(closed.subject, 'verified');
  return closed.paths;
end;
$$;

create function public.kyc_admin_request_info(p_id uuid, p_message text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed record;
begin
  perform public.kyc_require_admin();
  if char_length(btrim(coalesce(p_message, ''))) < 2 then
    raise exception 'message required' using errcode = '22023';
  end if;
  select * into closed from public.kyc_close_submission(p_id, 'needs_more_info', p_message);
  update public.professional_profiles set verification_status = 'unverified' where user_id = closed.subject;
  perform public.kyc_audit(p_id, closed.subject, 'needs_more_info');
  perform public.kyc_notify(closed.subject, 'needs_more_info');
  return closed.paths;
end;
$$;

create function public.kyc_admin_reject(p_id uuid, p_reason text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed record;
begin
  perform public.kyc_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 2 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  select * into closed from public.kyc_close_submission(p_id, 'rejected', p_reason);
  update public.professional_profiles
     set verification_status = 'rejected', accepting_patients = false
   where user_id = closed.subject;
  perform public.kyc_audit(p_id, closed.subject, 'rejected');
  perform public.kyc_notify(closed.subject, 'rejected');
  return closed.paths;
end;
$$;

-- After the server deleted the files.
create function public.kyc_admin_documents_deleted(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  subject uuid;
begin
  perform public.kyc_require_admin();
  select s.user_id into subject from public.verification_submissions s where s.id = p_id;
  perform public.kyc_audit(p_id, subject, 'documents_deleted');
end;
$$;

-- Flags a professional's upcoming bookings for an admin to rehome.
create function public.kyc_flag_bookings(p_user uuid, p_reason text)
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
    from public.counsellors c
   where c.id = b.counsellor_id and c.user_id = p_user
     and b.starts_at > now() and b.attended_at is null and b.flagged_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.kyc_flag_bookings(uuid, text) from public, anon, authenticated;

-- Suspends a verified professional at any time. They disappear from
-- patients immediately (every check above reads verification_status).
create function public.kyc_admin_suspend(p_user uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest uuid;
  flagged integer;
begin
  perform public.kyc_require_admin();
  if char_length(btrim(coalesce(p_reason, ''))) < 2 then
    raise exception 'reason required' using errcode = '22023';
  end if;
  update public.professional_profiles
     set verification_status = 'suspended', accepting_patients = false
   where user_id = p_user and verification_status in ('verified', 'expired', 'pending', 'unverified', 'rejected');
  if not found then
    raise exception 'professional not found' using errcode = 'P0002';
  end if;
  flagged := public.kyc_flag_bookings(p_user, 'suspended');
  select s.id into latest from public.verification_submissions s where s.user_id = p_user order by s.created_at desc limit 1;
  perform public.kyc_audit(latest, p_user, 'suspended');
  perform public.kyc_notify(p_user, 'suspended');
  return flagged;
end;
$$;

-- Bookings flagged for an admin (suspended or expired professionals).
create function public.kyc_admin_flagged_bookings()
returns table (id uuid, professional_name text, starts_at timestamptz, flag_reason text, flagged_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.kyc_require_admin();
  return query
    select b.id, c.name, b.starts_at, b.flag_reason, b.flagged_at
      from public.bookings b join public.counsellors c on c.id = b.counsellor_id
     where b.flagged_at is not null and b.starts_at > now() and b.attended_at is null
     order by b.starts_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. Professional-side functions
-- ---------------------------------------------------------------------------

-- "Accepting new patients". Only a verified professional can turn it on.
create function public.pro_set_accepting(p_accepting boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_verified_professional(auth.uid()) then
    raise exception 'verified professional required' using errcode = '42501';
  end if;
  update public.professional_profiles set accepting_patients = coalesce(p_accepting, false)
   where user_id = auth.uid();
  return coalesce(p_accepting, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 12. Daily jobs (service role only)
-- ---------------------------------------------------------------------------

-- Licences past their expiry date: status expired, not accepting, upcoming
-- bookings flagged, notified, audited. Returns the professionals expired.
create function public.kyc_expire_licences()
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  for uid in
    select pp.user_id from public.professional_profiles pp
     where pp.verification_status = 'verified' and pp.licence_expiry < current_date
     for update
  loop
    update public.professional_profiles
       set verification_status = 'expired', accepting_patients = false
     where user_id = uid;
    perform public.kyc_flag_bookings(uid, 'expired');
    insert into public.verification_audit (subject_user_id, action) values (uid, 'expired');
    perform public.kyc_notify(uid, 'expired');
    insert into public.events (user_id, name, props) values (uid, 'pro_expired', '{}'::jsonb);
    return next uid;
  end loop;
end;
$$;

-- Uploaded documents that no submission references (abandoned drafts, or
-- files left behind if a deletion failed). Deleted by the daily cleanup.
create function public.kyc_orphaned_objects(p_age_seconds integer default 86400, p_limit integer default 500)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
   where o.bucket_id = 'kyc-documents'
     and o.created_at < now() - make_interval(secs => greatest(p_age_seconds, 3600))
     and not exists (
       select 1 from public.verification_submissions s
        where o.name = any (s.id_document_paths || s.licence_document_paths || array_remove(array[s.selfie_path], null))
     )
   limit least(greatest(p_limit, 1), 1000)
$$;

-- ---------------------------------------------------------------------------
-- 13. Storage
-- ---------------------------------------------------------------------------
-- kyc-documents: private and with NO policies for signed-in users. Files are
-- encrypted by the server (AES-256-GCM) before upload, written and read
-- only with the service role, and served to admins by /api/kyc/document
-- after kyc_admin_document_allowed().
-- pro-photos: a professional's own profile photo, owner-only. Patients see
-- it only through server-signed URLs for verified professionals (task 15).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kyc-documents', 'kyc-documents', false, 12582912, array['application/octet-stream']),
  ('pro-photos', 'pro-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pro-photos: owner insert" on storage.objects;
drop policy if exists "pro-photos: owner read" on storage.objects;
drop policy if exists "pro-photos: owner update" on storage.objects;
drop policy if exists "pro-photos: owner delete" on storage.objects;

create policy "pro-photos: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'pro-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pro-photos: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'pro-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pro-photos: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'pro-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "pro-photos: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'pro-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 14. Existing counsellors become verified professionals (synthetic)
-- ---------------------------------------------------------------------------
insert into public.professional_profiles (
  user_id, display_name, profession, specialties, languages, verification_status,
  licence_number, licence_authority, licence_expiry, verified_at, accepting_patients)
select c.user_id, c.name, 'genetic_counsellor', array['carrier_screening', 'haemoglobin_disorders'],
       case when cardinality(c.languages) > 0 then c.languages else array['en', 'ar'] end,
       'verified', '[SYNTHETIC-LICENCE]', 'doh_abu_dhabi', (current_date + interval '2 years')::date, now(), true
  from public.counsellors c
  join public.profiles p on p.user_id = c.user_id and p.role = 'professional'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 15. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.is_verified_professional(uuid) from public, anon;
revoke all on function public.is_bookable_professional(uuid) from public, anon;
revoke all on function public.pro_is_professional() from public, anon;
revoke all on function public.kyc_is_admin() from public, anon;
revoke all on function public.my_counsellor() from public, anon;
revoke all on function public.pro_is_counsellor() from public, anon;
revoke all on function public.family_map_readable(uuid) from public, anon;
revoke all on function public.pro_conversation_open_to(uuid, uuid) from public, anon;
revoke all on function public.pro_conversation_readable_by(uuid, uuid) from public, anon;
revoke all on function public.my_pro_conversations() from public, anon;
revoke all on function public.professional_directory() from public, anon;
revoke all on function public.kyc_paths_owned(text[], uuid) from public, anon;
revoke all on function public.kyc_can_submit(uuid) from public, anon;
revoke all on function public.kyc_precheck_counts(jsonb) from public, anon;
revoke all on function public.kyc_admin_queue() from public, anon;
revoke all on function public.kyc_admin_professionals() from public, anon;
revoke all on function public.kyc_admin_submission(uuid) from public, anon;
revoke all on function public.kyc_admin_log(uuid, text) from public, anon;
revoke all on function public.kyc_admin_document_allowed(uuid, text) from public, anon;
revoke all on function public.kyc_admin_approve(uuid, text, text, date) from public, anon;
revoke all on function public.kyc_admin_request_info(uuid, text) from public, anon;
revoke all on function public.kyc_admin_reject(uuid, text) from public, anon;
revoke all on function public.kyc_admin_documents_deleted(uuid) from public, anon;
revoke all on function public.kyc_admin_suspend(uuid, text) from public, anon;
revoke all on function public.kyc_admin_flagged_bookings() from public, anon;
revoke all on function public.pro_set_accepting(boolean) from public, anon;
-- Daily jobs and trigger functions: service role / database only.
revoke all on function public.kyc_expire_licences() from public, anon, authenticated;
revoke all on function public.kyc_orphaned_objects(integer, integer) from public, anon, authenticated;
revoke all on function public.professional_profiles_guard() from public, anon, authenticated;
revoke all on function public.share_grants_professional_guard() from public, anon, authenticated;
revoke all on function public.access_log_professional_guard() from public, anon, authenticated;
revoke all on function public.bookings_professional_guard() from public, anon, authenticated;
revoke all on function public.verification_submissions_after_insert() from public, anon, authenticated;
revoke all on function public.verification_submissions_touch() from public, anon, authenticated;
revoke all on function public.verification_audit_append_only() from public, anon, authenticated;

grant execute on function public.is_verified_professional(uuid) to authenticated;
grant execute on function public.is_bookable_professional(uuid) to authenticated;
grant execute on function public.pro_is_professional() to authenticated;
grant execute on function public.kyc_is_admin() to authenticated;
grant execute on function public.my_counsellor() to authenticated;
grant execute on function public.pro_is_counsellor() to authenticated;
grant execute on function public.family_map_readable(uuid) to authenticated;
grant execute on function public.pro_conversation_open_to(uuid, uuid) to authenticated;
grant execute on function public.pro_conversation_readable_by(uuid, uuid) to authenticated;
grant execute on function public.my_pro_conversations() to authenticated;
grant execute on function public.professional_directory() to authenticated;
grant execute on function public.kyc_paths_owned(text[], uuid) to authenticated;
grant execute on function public.kyc_can_submit(uuid) to authenticated;
grant execute on function public.kyc_precheck_counts(jsonb) to authenticated;
-- Every kyc_admin_* function checks the admin role itself and raises for
-- anyone else.
grant execute on function public.kyc_admin_queue() to authenticated;
grant execute on function public.kyc_admin_professionals() to authenticated;
grant execute on function public.kyc_admin_submission(uuid) to authenticated;
grant execute on function public.kyc_admin_log(uuid, text) to authenticated;
grant execute on function public.kyc_admin_document_allowed(uuid, text) to authenticated;
grant execute on function public.kyc_admin_approve(uuid, text, text, date) to authenticated;
grant execute on function public.kyc_admin_request_info(uuid, text) to authenticated;
grant execute on function public.kyc_admin_reject(uuid, text) to authenticated;
grant execute on function public.kyc_admin_documents_deleted(uuid) to authenticated;
grant execute on function public.kyc_admin_suspend(uuid, text) to authenticated;
grant execute on function public.kyc_admin_flagged_bookings() to authenticated;
grant execute on function public.pro_set_accepting(boolean) to authenticated;
