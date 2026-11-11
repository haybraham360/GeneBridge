-- Counsellor copilot (task 16, docs/specs/16-counsellor-copilot.md).
--
--   - Before a session the AI writes the counsellor a brief from what the
--     patient shared. That goes through pro_request_detail() (task 07), which
--     already returns only shared data and writes access_log, so nothing new
--     is stored for it.
--   - After the session the AI drafts a plain-language summary for the
--     patient from the counsellor's own notes. The counsellor edits it and
--     approves it; only then can the patient read it.
--
-- session_summaries has row-level security on and no policies: every read
-- and write goes through the functions below. Patients never see the AI
-- draft, which is kept with the approval for audit. Message text is never
-- an input (guardrail 17). Safe to run once.

-- ---------------------------------------------------------------------------
-- 1. Summaries
-- ---------------------------------------------------------------------------
create table public.session_summaries (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null references public.counsellor_requests (id) on delete cascade,
  counsellor_id uuid not null references public.counsellors (id) on delete cascade,
  -- One summary per person on the request (a couple gets one each, in each
  -- person's own language).
  recipient_id  uuid not null references auth.users (id) on delete cascade,
  locale        text not null check (locale in ('ar', 'en')),
  status        text not null default 'draft' check (status in ('draft', 'approved')),
  -- 'ai' when the latest draft came from the model, 'manual' when the
  -- counsellor wrote it from scratch.
  engine        text not null default 'manual' check (engine in ('ai', 'manual')),
  -- The model's latest draft, unedited. Never shown to the patient.
  ai_draft      text check (char_length(ai_draft) <= 6000),
  body          text not null default '' check (char_length(body) <= 6000),
  -- Problems the safety check found in the draft (categories only).
  problems      text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  approved_at   timestamptz,
  approved_by   uuid references auth.users (id) on delete set null,
  unique (request_id, recipient_id),
  constraint session_summaries_approval check ((status = 'approved') = (approved_at is not null)),
  constraint session_summaries_body check (status = 'draft' or char_length(btrim(body)) > 0)
);

create index session_summaries_recipient_idx on public.session_summaries (recipient_id, approved_at desc)
  where status = 'approved';

alter table public.session_summaries enable row level security;
revoke all on public.session_summaries from anon, authenticated;

-- An approved summary is final: it can't be edited or taken back silently.
create function public.session_summaries_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'approved' then
    raise exception 'summary already approved' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger session_summaries_lock
  before update on public.session_summaries
  for each row execute function public.session_summaries_lock();

-- The patient's bell says "Your counsellor sent your session summary".
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('access_request', 'referral_created', 'referral_updated', 'kyc_status',
                  'new_message', 'booking_requested', 'booking_confirmed', 'booking_declined',
                  'booking_changed', 'booking_cancelled', 'booking_reminder', 'request_offer', 'offer_accepted',
                  'session_summary'));

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create schema if not exists copilot_private;
revoke all on schema copilot_private from public, anon, authenticated;

-- The user id for 'user' or 'partner' on a request.
create function copilot_private.person_id(r public.counsellor_requests, p_person text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_person = 'user' then return r.user_id; end if;
  if p_person = 'partner' and r.partner_user_id is not null then return r.partner_user_id; end if;
  raise exception 'unknown person' using errcode = '22023';
end;
$$;

create function copilot_private.locale_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Arabic unless the person chose English (Arabic is the default locale).
  select coalesce((select case when p.locale = 'en' then 'en' else 'ar' end
                     from public.profiles p where p.user_id = p_user), 'ar')
$$;

-- ---------------------------------------------------------------------------
-- 3. The counsellor's side
-- ---------------------------------------------------------------------------

-- Everything the summary panel needs, without reading any shared result:
-- each person's language, the referrals the counsellor actually made for
-- them, and their summary so far.
create function public.pro_copilot_context(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me     record;
  r      public.counsellor_requests;
  b      public.bookings;
  people jsonb := '[]'::jsonb;
  person text;
  uid    uuid;
  s      public.session_summaries;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  b := booking_private.current_booking(r.id);

  foreach person in array case when r.partner_user_id is null then array['user'] else array['user', 'partner'] end loop
    uid := copilot_private.person_id(r, person);
    select * into s from public.session_summaries where request_id = r.id and recipient_id = uid;
    people := people || jsonb_build_array(jsonb_build_object(
      'role', person,
      'first_name', pro_private.first_name(uid, me.user_id, r.partner_user_id is not null),
      'initial', pro_private.initial(uid),
      'locale', copilot_private.locale_of(uid),
      'referrals', (select coalesce(jsonb_agg(distinct x.step), '[]'::jsonb)
                      from public.referrals x
                     where x.request_id = r.id and x.user_id = uid and x.status <> 'cancelled'),
      'summary', case when s.id is null then null else jsonb_build_object(
        'status', s.status, 'engine', s.engine, 'body', s.body, 'problems', to_jsonb(s.problems),
        'updated_at', s.updated_at, 'approved_at', s.approved_at,
        'mine', s.counsellor_id = me.counsellor_id) end
    ));
  end loop;

  return jsonb_build_object(
    'is_couple', r.partner_user_id is not null,
    'session_ended_at', case when b.attended_at is not null or b.status = 'completed' then coalesce(b.ends_at, b.attended_at) end,
    'people', people
  );
end;
$$;

-- Saves a draft. A new AI draft also replaces ai_draft (the server action
-- passes it straight from the model); an edit passes null and keeps it.
create function public.pro_save_summary(
  p_request_id uuid, p_person text, p_body text, p_ai_draft text default null, p_problems text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me  record;
  r   public.counsellor_requests;
  uid uuid;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  uid := copilot_private.person_id(r, p_person);
  if char_length(coalesce(p_body, '')) > 6000 or char_length(coalesce(p_ai_draft, '')) > 6000 then
    raise exception 'summary too long' using errcode = '22001';
  end if;
  if exists (select 1 from unnest(coalesce(p_problems, '{}')) p
              where p !~ '^[a-z_]{2,40}$') then
    raise exception 'bad problems' using errcode = '22023';
  end if;
  perform pro_private.claim(r.id, me.counsellor_id);

  insert into public.session_summaries as s
    (request_id, counsellor_id, recipient_id, locale, engine, ai_draft, body, problems)
  values (r.id, me.counsellor_id, uid, copilot_private.locale_of(uid),
          case when p_ai_draft is null then 'manual' else 'ai' end,
          p_ai_draft, coalesce(p_body, ''), coalesce(p_problems, '{}'))
  on conflict (request_id, recipient_id) do update
    set body = excluded.body,
        counsellor_id = excluded.counsellor_id,
        engine = case when p_ai_draft is null then s.engine else 'ai' end,
        ai_draft = coalesce(p_ai_draft, s.ai_draft),
        problems = case when p_ai_draft is null then s.problems else excluded.problems end;
end;
$$;

-- Approve and send: the only way a patient ever sees a summary. Records who
-- approved it and when, notifies the patient and logs categories only.
create function public.pro_approve_summary(p_request_id uuid, p_person text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     record;
  r      public.counsellor_requests;
  b      public.bookings;
  uid    uuid;
  s      public.session_summaries;
  ended  timestamptz;
begin
  select * into me from pro_private.require_counsellor();
  r := pro_private.visible_request(p_request_id, me.counsellor_id, me.facility_id);
  uid := copilot_private.person_id(r, p_person);
  if char_length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'empty summary' using errcode = '22023';
  end if;

  perform public.pro_save_summary(p_request_id, p_person, p_body);
  update public.session_summaries
     set status = 'approved', approved_at = now(), approved_by = me.user_id
   where request_id = r.id and recipient_id = uid
  returning * into s;

  insert into public.notifications (user_id, kind, counsellor_id, request_id, actor_role)
  values (uid, 'session_summary', me.counsellor_id, r.id, 'professional');

  b := booking_private.current_booking(r.id);
  ended := coalesce(b.ends_at, b.attended_at);
  insert into public.events (user_id, name, props)
  values (me.user_id, 'copilot_summary_approved', jsonb_build_object(
    'engine', s.engine,
    'edited', s.engine = 'ai' and s.body is distinct from s.ai_draft,
    'minutes_after_session', case when ended is not null and ended <= now()
                                  then floor(extract(epoch from now() - ended) / 60)::integer end));
end;
$$;

-- How many copilot calls the counsellor made in the last hour (rate limit).
create function public.pro_copilot_calls_last_hour()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.events
   where user_id = auth.uid()
     and name in ('copilot_brief_opened', 'copilot_summary_drafted')
     and created_at > now() - interval '1 hour'
$$;

-- ---------------------------------------------------------------------------
-- 4. The patient's side: approved summaries only, never the AI draft
-- ---------------------------------------------------------------------------
create function public.my_session_summaries()
returns table (id uuid, body text, locale text, engine text, approved_at timestamptz, counsellor_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.body, s.locale, s.engine, s.approved_at,
         coalesce(pp.display_name, c.name)
    from public.session_summaries s
    join public.counsellors c on c.id = s.counsellor_id
    left join public.professional_profiles pp on pp.user_id = c.user_id
   where s.recipient_id = auth.uid() and s.status = 'approved'
   order by s.approved_at desc
   limit 20
$$;

revoke all on function copilot_private.person_id(public.counsellor_requests, text) from public, anon, authenticated;
revoke all on function copilot_private.locale_of(uuid) from public, anon, authenticated;
revoke all on function public.session_summaries_lock() from public, anon, authenticated;
revoke all on function public.pro_copilot_context(uuid) from public, anon;
revoke all on function public.pro_save_summary(uuid, text, text, text, text[]) from public, anon;
revoke all on function public.pro_approve_summary(uuid, text, text) from public, anon;
revoke all on function public.pro_copilot_calls_last_hour() from public, anon;
revoke all on function public.my_session_summaries() from public, anon;
grant execute on function public.pro_copilot_context(uuid) to authenticated;
grant execute on function public.pro_save_summary(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.pro_approve_summary(uuid, text, text) to authenticated;
grant execute on function public.pro_copilot_calls_last_hour() to authenticated;
grant execute on function public.my_session_summaries() to authenticated;
