-- Task 08: anonymous family notices and the relative's landing page.
--
-- Rubric 4, and the brief's "avoiding exposure of one family member's
-- information to another without permission". Protecting the sender's
-- identity is the main requirement:
--   - Nobody reads these tables directly (RLS on, no policies, no grants).
--   - The public page reads one notice through family_notice_view(), which
--     returns only status, locale, condition id (if the sender included it)
--     and a signed first name (only if the sender chose to sign).
--   - sender_id never leaves the database through any public function.
--   - Phone numbers are stored only as a salted hash, made by the app server.
--   - notice_events holds aggregate counts only: no user, code or phone hash.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.family_notifications (
  id                   uuid primary key default gen_random_uuid(),
  sender_id            uuid not null references auth.users (id) on delete cascade,
  -- One send from the family map, for the sender's Privacy & consent list.
  batch_id             uuid not null,
  -- 32 random hex characters (122 bits). The only parameter in the link.
  code                 text not null unique check (code ~ '^[A-Za-z0-9_-]{22,64}$'),
  recipient_phone_hash text not null check (recipient_phone_hash ~ '^[0-9a-f]{64}$'),
  channel              text not null check (channel in ('sms', 'whatsapp')),
  locale               text not null check (locale in ('ar', 'en')),
  -- Only when the sender ticked "Include the condition name". A library id.
  condition_id         text check (condition_id in (
                         'alpha_thalassemia', 'beta_thalassemia', 'cystic_fibrosis',
                         'g6pd_deficiency', 'gjb2_hearing_loss', 'phenylketonuria',
                         'sickle_cell_disease', 'spinal_muscular_atrophy')),
  anonymous            boolean not null default true,
  signed_name          text check (char_length(signed_name) between 1 and 40),
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default now() + interval '90 days',
  -- First open only. No device, IP or location data.
  opened_at            timestamptz,
  stopped_at           timestamptz,
  constraint family_notifications_signed_only_when_named
    check ((signed_name is null) or (anonymous = false))
);

create index family_notifications_sender_idx on public.family_notifications (sender_id, created_at desc);
create index family_notifications_phone_idx on public.family_notifications (recipient_phone_hash);

-- Each send's requested recipient count, for the weekly limit. Counted per
-- requested relative (not per created notice), so the limit can't reveal
-- that a relative stopped messages.
create table public.notice_sends (
  id         bigint generated always as identity primary key,
  sender_id  uuid not null references auth.users (id) on delete cascade,
  recipients integer not null check (recipients between 1 and 10),
  created_at timestamptz not null default now()
);

create index notice_sends_sender_idx on public.notice_sends (sender_id, created_at);

-- Numbers here never receive another notice.
create table public.notice_suppressions (
  recipient_phone_hash text primary key check (recipient_phone_hash ~ '^[0-9a-f]{64}$'),
  created_at           timestamptz not null default now()
);

-- "Report misuse" from the page. Reviewers can follow notice_id to the
-- sender server-side; the recipient is never shown anything about them.
create table public.notice_reports (
  id         uuid primary key default gen_random_uuid(),
  notice_id  uuid references public.family_notifications (id) on delete set null,
  reason     text not null check (reason in ('not_family', 'harassment', 'unwanted', 'other')),
  status     text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

-- Aggregate counts only (task 08 section 5). Deliberately no user_id, code,
-- notice id or phone hash column.
create table public.notice_events (
  id         bigint generated always as identity primary key,
  name       text not null check (name in (
               'notice_sent', 'notice_opened', 'notice_testing_clicked',
               'notice_question_clicked', 'notice_stopped')),
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index notice_events_name_created_idx on public.notice_events (name, created_at);

-- Public Ask GeneBridge usage: timestamps only, for a global hourly cap.
create table public.public_ask_usage (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

create index public_ask_usage_created_idx on public.public_ask_usage (created_at);

alter table public.family_notifications enable row level security;
alter table public.notice_sends enable row level security;
alter table public.notice_suppressions enable row level security;
alter table public.notice_reports enable row level security;
alter table public.notice_events enable row level security;
alter table public.public_ask_usage enable row level security;
revoke all on public.family_notifications, public.notice_sends, public.notice_suppressions, public.notice_reports,
  public.notice_events, public.public_ask_usage from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Services: the Services design's screening and counselling listings, public
-- through notice_testing_services() only. Placeholders (guardrail 12).
-- ---------------------------------------------------------------------------
alter table public.services drop constraint if exists services_kind_check;
alter table public.services
  add constraint services_kind_check check (kind in (
    'genetic_counselling', 'screening', 'confirmatory_testing', 'haematology',
    'ivf_embryo_testing', 'support_group'));
alter table public.services
  add column area      text,
  add column languages text[] not null default '{}';

update public.services set area = '[Area], Abu Dhabi', languages = '{ar,en,hi}'
 where name = '[Confirmatory testing lab]';
update public.services set area = '[Area], Abu Dhabi', languages = '{ar,en}'
 where name = '[Haematology clinic]';
update public.services set area = '[Area], Abu Dhabi', languages = '{ar,en,fr}'
 where name = '[Fertility centre]';

insert into public.services (kind, name, sort, area, languages) values
  ('screening', '[Premarital screening centre]', 4, '[Area], Abu Dhabi', '{ar,en,tl}'),
  ('genetic_counselling', '[Genetic counselling clinic A]', 5, '[Area], Abu Dhabi', '{ar,en}'),
  ('genetic_counselling', '[Genetic counselling clinic B]', 6, '[Area], Al Ain', '{ar,en,ur}')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.notice_log(p_name text, p_props jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notice_events (name, props) values (p_name, coalesce(p_props, '{}'::jsonb))
$$;

revoke all on function public.notice_log(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public page (anon and signed-in)
-- ---------------------------------------------------------------------------

-- One notice, as the page needs it. Returns the same shape for every code:
--   status: 'valid' | 'invalid' | 'expired' | 'stopped'
--   locale, condition_id, signed_name: only for 'valid' (locale also for
--   expired and stopped, so the page speaks the right language).
-- Never returns sender_id, phone hash, channel or timestamps.
-- p_mark_open: the notice page sets opened_at once; stop and report pages don't.
create function public.family_notice_view(p_code text, p_mark_open boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.family_notifications;
  st text;
begin
  select * into n from public.family_notifications
   where code = coalesce(p_code, '') and coalesce(p_code, '') ~ '^[A-Za-z0-9_-]{22,64}$';

  if n.id is null then
    st := 'invalid';
  elsif n.stopped_at is not null then
    st := 'stopped';
  elsif n.expires_at <= now() then
    st := 'expired';
  else
    st := 'valid';
  end if;

  if st = 'valid' and p_mark_open and n.opened_at is null then
    update public.family_notifications set opened_at = now() where id = n.id;
    perform public.notice_log('notice_opened');
  end if;

  return jsonb_build_object(
    'status', st,
    'locale', case when st <> 'invalid' then n.locale end,
    'condition_id', case when st = 'valid' then n.condition_id end,
    'signed_name', case when st = 'valid' and not n.anonymous then n.signed_name end
  );
end;
$$;

-- "Stop them": suppresses the number straight away. Returns the new status.
create function public.family_notice_stop(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.family_notifications;
begin
  select * into n from public.family_notifications where code = coalesce(p_code, '');
  if n.id is null then return 'invalid'; end if;
  insert into public.notice_suppressions (recipient_phone_hash)
  values (n.recipient_phone_hash) on conflict do nothing;
  update public.family_notifications set stopped_at = coalesce(stopped_at, now())
   where recipient_phone_hash = n.recipient_phone_hash;
  if n.stopped_at is null then perform public.notice_log('notice_stopped'); end if;
  return 'stopped';
end;
$$;

-- Undo from the same link: messages can arrive again.
create function public.family_notice_undo_stop(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n public.family_notifications;
begin
  select * into n from public.family_notifications where code = coalesce(p_code, '');
  if n.id is null then return 'invalid'; end if;
  delete from public.notice_suppressions where recipient_phone_hash = n.recipient_phone_hash;
  update public.family_notifications set stopped_at = null
   where recipient_phone_hash = n.recipient_phone_hash;
  return case when n.expires_at <= now() then 'expired' else 'valid' end;
end;
$$;

-- "Report misuse": a review record. Returns 'reported' for any code, so the
-- answer can't be used to probe codes.
create function public.family_notice_report(p_code text, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_id uuid;
begin
  if p_reason not in ('not_family', 'harassment', 'unwanted', 'other') then
    raise exception 'unknown reason' using errcode = '22023';
  end if;
  select id into n_id from public.family_notifications where code = coalesce(p_code, '');
  if n_id is not null and (
    select count(*) from public.notice_reports where notice_id = n_id
  ) < 5 then
    insert into public.notice_reports (notice_id, reason) values (n_id, p_reason);
  end if;
  return 'reported';
end;
$$;

-- The page's counted clicks. Allow-listed names, no identifiers.
create function public.notice_log_event(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name not in ('notice_testing_clicked', 'notice_question_clicked') then
    raise exception 'unknown event' using errcode = '22023';
  end if;
  perform public.notice_log(p_name);
end;
$$;

-- Screening and counselling services for the public testing list.
create function public.notice_testing_services()
returns table (kind text, name text, area text, languages text[])
language sql
stable
security definer
set search_path = ''
as $$
  select s.kind, s.name, s.area, s.languages from public.services s
   where s.kind in ('screening', 'genetic_counselling', 'confirmatory_testing')
   order by case s.kind when 'screening' then 1 when 'genetic_counselling' then 2 else 3 end, s.sort, s.name
$$;

-- Public Ask GeneBridge: a global cap per hour (no per-person data stored).
-- Returns true if the question may go ahead.
create function public.public_ask_take(p_limit integer default 300)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.public_ask_usage where created_at < now() - interval '1 hour';
  if (select count(*) from public.public_ask_usage) >= least(greatest(p_limit, 1), 1000) then
    return false;
  end if;
  insert into public.public_ask_usage default values;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sender side (signed in)
-- ---------------------------------------------------------------------------

-- Creates one notice per recipient hash. Templates only: there is no message
-- text parameter. Max 10 relatives per sender per 7 days (error 'P0001'
-- with message 'rate_limited:<remaining>'). Suppressed numbers are skipped
-- silently, so the sender can't tell that a relative stopped messages.
-- Returns the created codes with the index of their recipient (1-based).
create function public.send_family_notices(
  p_phone_hashes text[],
  p_channel text,
  p_locale text,
  p_condition_id text default null,
  p_anonymous boolean default true,
  p_signed_name text default null
)
returns table (recipient integer, code text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  caller    uuid := auth.uid();
  batch     uuid := gen_random_uuid();
  recent    integer;
  n         integer := coalesce(cardinality(p_phone_hashes), 0);
  i         integer;
  h         text;
  new_code  text;
  signed    text := case when coalesce(p_anonymous, true) then null
                         else nullif(btrim(coalesce(p_signed_name, '')), '') end;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if n = 0 or n > 10 then
    raise exception 'choose between 1 and 10 relatives' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_phone_hashes) x) <> n then
    raise exception 'duplicate recipients' using errcode = '22023';
  end if;
  if p_channel not in ('sms', 'whatsapp') or p_locale not in ('ar', 'en') then
    raise exception 'unknown channel or language' using errcode = '22023';
  end if;
  if not coalesce(p_anonymous, true) and signed is null then
    raise exception 'signed name required' using errcode = '22023';
  end if;

  -- Serialise sends per sender so two tabs can't both pass the limit.
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 8));
  select coalesce(sum(s.recipients), 0) into recent from public.notice_sends s
   where s.sender_id = caller and s.created_at > now() - interval '7 days';
  if recent + n > 10 then
    raise exception 'rate_limited:%', greatest(10 - recent, 0) using errcode = 'P0001';
  end if;
  insert into public.notice_sends (sender_id, recipients) values (caller, n);

  for i in 1 .. n loop
    h := p_phone_hashes[i];
    if h !~ '^[0-9a-f]{64}$' then
      raise exception 'bad recipient' using errcode = '22023';
    end if;
    continue when exists (select 1 from public.notice_suppressions s where s.recipient_phone_hash = h);
    new_code := replace(gen_random_uuid()::text, '-', '');
    insert into public.family_notifications
      (sender_id, batch_id, code, recipient_phone_hash, channel, locale, condition_id, anonymous, signed_name)
    values
      (caller, batch, new_code, h, p_channel, p_locale, p_condition_id, coalesce(p_anonymous, true), signed);
    recipient := i;
    code := new_code;
    return next;
  end loop;

  -- Counted per requested recipient, so suppressions don't show in totals.
  for i in 1 .. n loop
    perform public.notice_log('notice_sent', jsonb_build_object(
      'channel', p_channel, 'condition_included', p_condition_id is not null));
  end loop;
end;
$$;

-- The sender's own sends, one row per send, for Privacy & consent. Never
-- says whether a relative opened or stopped a notice: the relative's page
-- promises that opening it tells no one.
create function public.my_family_notices()
returns table (sent_at timestamptz, recipients integer, anonymous boolean, condition_included boolean, channel text)
language sql
stable
security definer
set search_path = ''
as $$
  select min(n.created_at), count(*)::integer, bool_and(n.anonymous),
         bool_or(n.condition_id is not null), min(n.channel)
    from public.family_notifications n
   where n.sender_id = auth.uid()
   group by n.batch_id
   order by min(n.created_at) desc
   limit 20
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.family_notice_view(text, boolean) from public;
revoke all on function public.family_notice_stop(text) from public;
revoke all on function public.family_notice_undo_stop(text) from public;
revoke all on function public.family_notice_report(text, text) from public;
revoke all on function public.notice_log_event(text) from public;
revoke all on function public.notice_testing_services() from public;
revoke all on function public.public_ask_take(integer) from public;
revoke all on function public.send_family_notices(text[], text, text, text, boolean, text) from public, anon;
revoke all on function public.my_family_notices() from public, anon;

grant execute on function public.family_notice_view(text, boolean) to anon, authenticated;
grant execute on function public.family_notice_stop(text) to anon, authenticated;
grant execute on function public.family_notice_undo_stop(text) to anon, authenticated;
grant execute on function public.family_notice_report(text, text) to anon, authenticated;
grant execute on function public.notice_log_event(text) to anon, authenticated;
grant execute on function public.notice_testing_services() to anon, authenticated;
grant execute on function public.public_ask_take(integer) to anon, authenticated;
grant execute on function public.send_family_notices(text[], text, text, text, boolean, text) to authenticated;
grant execute on function public.my_family_notices() to authenticated;
