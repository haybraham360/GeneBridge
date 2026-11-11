-- Blind Match (task 17, docs/specs/17-blind-match.md).
--
-- Two people find out whether they both carry a change in the same gene
-- without either of them seeing the other's result:
--
--   - One person starts a session and shows a short code (QR or typed).
--     The other joins with it. Each agrees on their own phone.
--   - When the second agreement lands, blind_match_resolve() compares
--     their verified, unflagged findings for autosomal recessive conditions
--     and stores only the answer: 'shared', 'none' or 'not_comparable'
--     (no condition screened for both). Never which condition.
--   - A shared condition is named only if both tap "Show us which
--     condition"; it is recomputed then and never stored.
--   - Every compare writes access_log for both people (guardrail 10).
--   - Sessions are deleted 7 days after the answer (cron). Outcomes are
--     counted only in blind_match_daily, which has no user id (guardrail 11).
--
-- Every table has row-level security on and no policies: all access goes
-- through the functions below. No AI is involved (guardrail 5).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- The conditions Blind Match compares: autosomal recessive conditions in
-- the catalogue (content/library/en/conditions, inheritance =
-- 'autosomal_recessive'). 'sickle_cell' is the older code for
-- sickle_cell_disease. Keep in sync with lib/blind-match/conditions.ts.
create table public.blind_match_conditions (
  condition_code text primary key
);
insert into public.blind_match_conditions (condition_code) values
  ('bardet_biedl_syndrome'), ('beta_thalassemia'), ('biotinidase_deficiency'),
  ('congenital_adrenal_hyperplasia'), ('cystic_fibrosis'), ('familial_mediterranean_fever'),
  ('fanconi_anemia'), ('friedreich_ataxia'), ('galactosemia'), ('gaucher_disease'),
  ('gjb2_hearing_loss'), ('glanzmann_thrombasthenia'), ('glutaric_acidemia_type_1'),
  ('homocystinuria'), ('maple_syrup_urine_disease'), ('mcad_deficiency'),
  ('methylmalonic_acidemia'), ('mucopolysaccharidosis_type_1'), ('niemann_pick_disease'),
  ('phenylketonuria'), ('pompe_disease'), ('primary_ciliary_dyskinesia'),
  ('propionic_acidemia'), ('sickle_cell'), ('sickle_cell_disease'),
  ('spinal_muscular_atrophy'), ('tay_sachs_disease'), ('usher_syndrome'), ('wilson_disease');
alter table public.blind_match_conditions enable row level security;
revoke all on public.blind_match_conditions from anon, authenticated;

create table public.blind_match_sessions (
  id                uuid primary key default gen_random_uuid(),
  -- sha256 of the code. The code itself is never stored.
  token_hash        text not null unique,
  starter_id        uuid not null references auth.users (id) on delete cascade,
  joiner_id         uuid references auth.users (id) on delete cascade,
  -- The first name each person chose to show, or null ("Someone").
  starter_label     text check (char_length(starter_label) between 1 and 40),
  joiner_label      text check (char_length(joiner_label) between 1 and 40),
  starter_agreed_at timestamptz,
  joiner_agreed_at  timestamptz,
  status            text not null default 'waiting'
                    check (status in ('waiting', 'joined', 'resolved', 'cancelled')),
  outcome           text check (outcome in ('shared', 'none', 'not_comparable')),
  -- The conditions both were screened for: the panel, never a result.
  screened_codes    text[],
  starter_reveal    boolean not null default false,
  joiner_reveal     boolean not null default false,
  -- Counted once per person when a 'shared' answer leads to the counsellor page.
  starter_counsellor boolean not null default false,
  joiner_counsellor  boolean not null default false,
  expires_at        timestamptz not null default now() + interval '10 minutes',
  resolved_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint blind_match_not_self check (joiner_id is null or joiner_id <> starter_id),
  constraint blind_match_resolved check ((status = 'resolved') = (outcome is not null and resolved_at is not null)),
  constraint blind_match_joined check (status = 'waiting' or status = 'cancelled' or joiner_id is not null)
);
create index blind_match_sessions_starter_idx on public.blind_match_sessions (starter_id, created_at desc);
create index blind_match_sessions_joiner_idx on public.blind_match_sessions (joiner_id, created_at desc);
create index blind_match_sessions_expires_idx on public.blind_match_sessions (expires_at);
alter table public.blind_match_sessions enable row level security;
revoke all on public.blind_match_sessions from anon, authenticated;

-- Resolved matches per person, for the rate limit (3 per 30 days). No
-- partner and no outcome. Deleted after 30 days.
create table public.blind_match_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  resolved_at timestamptz not null default now()
);
create index blind_match_usage_user_idx on public.blind_match_usage (user_id, resolved_at desc);
alter table public.blind_match_usage enable row level security;
revoke all on public.blind_match_usage from anon, authenticated;

-- Join attempts per person, for the code-guessing limit (10 per hour).
create table public.blind_match_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index blind_match_attempts_user_idx on public.blind_match_attempts (user_id, attempted_at desc);
alter table public.blind_match_attempts enable row level security;
revoke all on public.blind_match_attempts from anon, authenticated;

-- Aggregate counts for the dashboard. No user id, ever.
create table public.blind_match_daily (
  day    date not null default current_date,
  locale text not null check (locale in ('ar', 'en')),
  metric text not null check (metric in (
    'started', 'joined', 'cancelled',
    'completed_shared', 'completed_none', 'completed_not_comparable',
    'counsellor_after_shared')),
  n      integer not null default 0,
  primary key (day, locale, metric)
);
alter table public.blind_match_daily enable row level security;
revoke all on public.blind_match_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create schema if not exists blind_match_private;
revoke all on schema blind_match_private from public, anon, authenticated;

-- A person's findings Blind Match may use: verified rows only (v1, spec
-- section 2), one per condition, a centre row first, then the newest.
create function blind_match_private.findings(p_user uuid)
returns table (condition_code text, status text, flagged boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with ranked as (
    select r.condition_code, r.status, r.flagged,
           row_number() over (
             partition by r.condition_code
             order by (r.source = 'centre') desc, r.claimed_at desc nulls last
           ) as n
      from public.screening_results r
     where r.owner_id = p_user and r.verified
  )
  select condition_code, status, flagged from ranked where n = 1
$$;

-- 'ok', 'flagged', 'no_result' or 'unverified', for one person.
create function blind_match_private.eligibility(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- Any flagged finding, verified or scanned, goes to a counsellor (guardrail 4).
    when exists (select 1 from public.screening_results r where r.owner_id = p_user and r.flagged) then 'flagged'
    when exists (select 1 from blind_match_private.findings(p_user)) then 'ok'
    when exists (select 1 from public.screening_results r where r.owner_id = p_user) then 'unverified'
    else 'no_result'
  end
$$;

create function blind_match_private.locale_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select case when p.locale = 'en' then 'en' else 'ar' end
                     from public.profiles p where p.user_id = p_user), 'ar')
$$;

create function blind_match_private.count(p_user uuid, p_metric text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.blind_match_daily (day, locale, metric, n)
  values (current_date, blind_match_private.locale_of(p_user), p_metric, 1)
  on conflict (day, locale, metric) do update set n = public.blind_match_daily.n + 1
$$;

-- True when the person has used up their 3 matches in the last 30 days.
create function blind_match_private.over_limit(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 3 from public.blind_match_usage
   where user_id = p_user and resolved_at > now() - interval '30 days'
$$;

-- 6 characters from 31 (no 0, O, 1, I or L), from a v4 UUID's random bytes.
create function blind_match_private.new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := uuid_send(gen_random_uuid());
  code  text := '';
  i     integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5] loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
  end loop;
  return code;
end;
$$;

create function blind_match_private.hash(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(upper(btrim(p_code)), 'UTF8')), 'hex')
$$;

-- The caller's live session by id, locked, or an error. Expired rows count as gone.
create function blind_match_private.my_session(p_session uuid)
returns public.blind_match_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.blind_match_sessions;
begin
  select * into s from public.blind_match_sessions
   where id = p_session and (starter_id = auth.uid() or joiner_id = auth.uid()) and expires_at > now()
   for update;
  if s.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The match
-- ---------------------------------------------------------------------------

-- Can the caller take part? Asked before any session exists, so someone
-- who can't take part is never visible to the other person.
create function public.blind_match_eligibility()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if blind_match_private.eligibility(auth.uid()) <> 'ok' then
    return blind_match_private.eligibility(auth.uid());
  end if;
  if blind_match_private.over_limit(auth.uid()) then
    return 'limit';
  end if;
  return 'ok';
end;
$$;

-- Starts a session. Returns the code once; only its hash is stored.
create function public.blind_match_start(p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  verdict text;
  code   text;
  s      public.blind_match_sessions;
begin
  verdict := public.blind_match_eligibility();
  if verdict <> 'ok' then
    return jsonb_build_object('status', verdict);
  end if;

  -- One live session at a time: starting again cancels any open one.
  update public.blind_match_sessions
     set status = 'cancelled', expires_at = now() + interval '1 hour'
   where starter_id = caller and status in ('waiting', 'joined');

  loop
    code := blind_match_private.new_code();
    begin
      insert into public.blind_match_sessions (token_hash, starter_id, starter_label)
      values (blind_match_private.hash(code), caller, nullif(btrim(left(coalesce(p_label, ''), 40)), ''))
      returning * into s;
      exit;
    exception when unique_violation then
      null; -- that code is in use: try another
    end;
  end loop;

  perform blind_match_private.count(caller, 'started');
  insert into public.events (user_id, name) values (caller, 'blind_match_started');
  return jsonb_build_object('status', 'ok', 'session_id', s.id, 'code', code, 'expires_at', s.expires_at);
end;
$$;

-- Joins with a code. A wrong, used or expired code all answer 'not_found'.
create function public.blind_match_join(p_code text, p_label text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  verdict text;
  s      public.blind_match_sessions;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.blind_match_attempts
       where user_id = caller and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into public.blind_match_attempts (user_id) values (caller);

  verdict := public.blind_match_eligibility();
  if verdict <> 'ok' then
    return jsonb_build_object('status', verdict);
  end if;

  select * into s from public.blind_match_sessions
   where token_hash = blind_match_private.hash(coalesce(p_code, ''))
     and status = 'waiting' and expires_at > now()
   for update;
  if s.id is null or s.starter_id = caller then
    return jsonb_build_object('status', 'not_found');
  end if;

  update public.blind_match_sessions
     set joiner_id = caller,
         joiner_label = nullif(btrim(left(coalesce(p_label, ''), 40)), ''),
         status = 'joined',
         expires_at = now() + interval '10 minutes'
   where id = s.id;

  perform blind_match_private.count(caller, 'joined');
  return jsonb_build_object('status', 'ok', 'session_id', s.id, 'other_label', s.starter_label);
end;
$$;

-- Compares the two people. Called only from blind_match_agree(), with the
-- session row locked. Reads results here and nowhere else, and returns
-- nothing from them: only the outcome is stored.
create function blind_match_private.resolve(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.blind_match_sessions;
  screened text[];
  shared   boolean;
  result   text;
begin
  select * into s from public.blind_match_sessions where id = p_session;

  -- Results can change between joining and agreeing. If either person can
  -- no longer take part, end it as a plain cancel: the other learns nothing.
  if blind_match_private.eligibility(s.starter_id) <> 'ok' or blind_match_private.eligibility(s.joiner_id) <> 'ok' then
    update public.blind_match_sessions
       set status = 'cancelled', expires_at = now() + interval '1 hour'
     where id = s.id;
    return;
  end if;

  with a as (select * from blind_match_private.findings(s.starter_id)),
       b as (select * from blind_match_private.findings(s.joiner_id))
  select coalesce(array_agg(a.condition_code order by a.condition_code), '{}'),
         coalesce(bool_or(a.status in ('carrier', 'affected') and b.status in ('carrier', 'affected')), false)
    into screened, shared
    from a
    join b on b.condition_code = a.condition_code
    join public.blind_match_conditions c on c.condition_code = a.condition_code;

  result := case when cardinality(screened) = 0 then 'not_comparable' when shared then 'shared' else 'none' end;

  update public.blind_match_sessions
     set status = 'resolved', outcome = result, screened_codes = screened,
         resolved_at = now(), expires_at = now() + interval '7 days'
   where id = s.id;

  -- Each person's result was read once, by the compare, on the other's behalf.
  insert into public.access_log (resource_owner_id, viewer_id, resource, level)
  values (s.starter_id, s.joiner_id, 'result', 'blind_match'),
         (s.joiner_id, s.starter_id, 'result', 'blind_match');

  insert into public.blind_match_usage (user_id) values (s.starter_id), (s.joiner_id);
  perform blind_match_private.count(s.starter_id, 'completed_' || result);
  perform blind_match_private.count(s.joiner_id, 'completed_' || result);
  insert into public.events (user_id, name) values (s.starter_id, 'blind_match_completed'), (s.joiner_id, 'blind_match_completed');
end;
$$;

-- The caller agrees. The starter can agree only once someone has joined,
-- so they know who they are agreeing with. The second agreement resolves.
create function public.blind_match_agree(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.blind_match_sessions;
begin
  s := blind_match_private.my_session(p_session);
  if s.status <> 'joined' then
    raise exception 'not ready' using errcode = '22023';
  end if;
  if s.starter_id = auth.uid() then
    update public.blind_match_sessions set starter_agreed_at = coalesce(starter_agreed_at, now()) where id = s.id
    returning * into s;
  else
    update public.blind_match_sessions set joiner_agreed_at = coalesce(joiner_agreed_at, now()) where id = s.id
    returning * into s;
  end if;
  if s.starter_agreed_at is not null and s.joiner_agreed_at is not null then
    perform blind_match_private.resolve(s.id);
  end if;
end;
$$;

-- Either person, until the answer exists.
create function public.blind_match_cancel(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.blind_match_sessions;
begin
  s := blind_match_private.my_session(p_session);
  if s.status in ('waiting', 'joined') then
    update public.blind_match_sessions
       set status = 'cancelled', expires_at = now() + interval '1 hour'
     where id = s.id;
    perform blind_match_private.count(auth.uid(), 'cancelled');
  end if;
end;
$$;

-- The shared conditions, recomputed. Only once both tapped; never stored.
create function blind_match_private.shared_codes(s public.blind_match_sessions)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(a.condition_code order by a.condition_code), '{}')
    from blind_match_private.findings(s.starter_id) a
    join blind_match_private.findings(s.joiner_id) b on b.condition_code = a.condition_code
    join public.blind_match_conditions c on c.condition_code = a.condition_code
   where a.status in ('carrier', 'affected') and b.status in ('carrier', 'affected')
$$;

-- "Show us which condition". Records the caller's tap. When both have
-- tapped, logs the reveal for both people once.
create function public.blind_match_reveal(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s      public.blind_match_sessions;
  before boolean;
begin
  s := blind_match_private.my_session(p_session);
  if s.status <> 'resolved' or s.outcome <> 'shared' then
    raise exception 'nothing to reveal' using errcode = '22023';
  end if;
  before := s.starter_reveal and s.joiner_reveal;
  if s.starter_id = auth.uid() then
    update public.blind_match_sessions set starter_reveal = true where id = s.id returning * into s;
  else
    update public.blind_match_sessions set joiner_reveal = true where id = s.id returning * into s;
  end if;
  if not before and s.starter_reveal and s.joiner_reveal then
    insert into public.access_log (resource_owner_id, viewer_id, resource, level)
    values (s.starter_id, s.joiner_id, 'result', 'blind_match_reveal'),
           (s.joiner_id, s.starter_id, 'result', 'blind_match_reveal');
  end if;
end;
$$;

-- A 'shared' answer that led to the counsellor page, counted once per person.
create function public.blind_match_counsellor(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s     public.blind_match_sessions;
  first boolean := false;
begin
  s := blind_match_private.my_session(p_session);
  if s.status <> 'resolved' or s.outcome <> 'shared' then return; end if;
  if s.starter_id = auth.uid() and not s.starter_counsellor then
    update public.blind_match_sessions set starter_counsellor = true where id = s.id;
    first := true;
  elsif s.joiner_id = auth.uid() and not s.joiner_counsellor then
    update public.blind_match_sessions set joiner_counsellor = true where id = s.id;
    first := true;
  end if;
  if first then
    perform blind_match_private.count(auth.uid(), 'counsellor_after_shared');
  end if;
end;
$$;

-- What the caller's screen shows. Never whether the other person tapped
-- "show which condition", and never anything from either result.
create function public.blind_match_state(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  s      public.blind_match_sessions;
  me_starter boolean;
begin
  select * into s from public.blind_match_sessions
   where id = p_session and (starter_id = caller or joiner_id = caller) and expires_at > now();
  if s.id is null then
    return jsonb_build_object('status', 'gone');
  end if;
  me_starter := s.starter_id = caller;
  return jsonb_build_object(
    'status', s.status,
    'role', case when me_starter then 'starter' else 'joiner' end,
    'other_label', case when me_starter then s.joiner_label else s.starter_label end,
    'me_agreed', case when me_starter then s.starter_agreed_at is not null else s.joiner_agreed_at is not null end,
    'other_agreed', case when me_starter then s.joiner_agreed_at is not null else s.starter_agreed_at is not null end,
    'outcome', s.outcome,
    'screened_codes', to_jsonb(s.screened_codes),
    'resolved_at', s.resolved_at,
    'me_revealed', case when me_starter then s.starter_reveal else s.joiner_reveal end,
    'revealed_codes', case when s.status = 'resolved' and s.outcome = 'shared' and s.starter_reveal and s.joiner_reveal
                           then to_jsonb(blind_match_private.shared_codes(s)) end,
    'expires_at', s.expires_at
  );
end;
$$;

-- The caller's answers from the last 7 days: never which condition.
create function public.my_blind_matches()
returns table (id uuid, resolved_at timestamptz, other_label text, outcome text, screened_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.resolved_at,
         case when s.starter_id = auth.uid() then s.joiner_label else s.starter_label end,
         s.outcome, cardinality(s.screened_codes)
    from public.blind_match_sessions s
   where (s.starter_id = auth.uid() or s.joiner_id = auth.uid())
     and s.status = 'resolved' and s.expires_at > now()
   order by s.resolved_at desc
   limit 20
$$;

-- Cron (app/api/cron/blind-match): delete what has expired.
create function public.blind_match_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.blind_match_sessions where expires_at <= now();
  get diagnostics n = row_count;
  delete from public.blind_match_usage where resolved_at <= now() - interval '30 days';
  delete from public.blind_match_attempts where attempted_at <= now() - interval '1 day';
  return n;
end;
$$;

-- Dashboard: daily counts by language, groups under 10 hidden (guardrail 11).
create function public.analytics_blind_match()
returns table (locale text, metric text, n bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select d.locale, d.metric, sum(d.n)::bigint
    from public.blind_match_daily d
   where exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role in ('analyst', 'admin'))
   group by d.locale, d.metric
  having sum(d.n) >= 10
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
revoke all on all functions in schema blind_match_private from public, anon, authenticated;
revoke all on function public.blind_match_eligibility() from public, anon;
revoke all on function public.blind_match_start(text) from public, anon;
revoke all on function public.blind_match_join(text, text) from public, anon;
revoke all on function public.blind_match_agree(uuid) from public, anon;
revoke all on function public.blind_match_cancel(uuid) from public, anon;
revoke all on function public.blind_match_reveal(uuid) from public, anon;
revoke all on function public.blind_match_counsellor(uuid) from public, anon;
revoke all on function public.blind_match_state(uuid) from public, anon;
revoke all on function public.my_blind_matches() from public, anon;
revoke all on function public.blind_match_cleanup() from public, anon, authenticated;
revoke all on function public.analytics_blind_match() from public, anon;
grant execute on function public.blind_match_eligibility() to authenticated;
grant execute on function public.blind_match_start(text) to authenticated;
grant execute on function public.blind_match_join(text, text) to authenticated;
grant execute on function public.blind_match_agree(uuid) to authenticated;
grant execute on function public.blind_match_cancel(uuid) to authenticated;
grant execute on function public.blind_match_reveal(uuid) to authenticated;
grant execute on function public.blind_match_counsellor(uuid) to authenticated;
grant execute on function public.blind_match_state(uuid) to authenticated;
grant execute on function public.my_blind_matches() to authenticated;
grant execute on function public.blind_match_cleanup() to service_role;
grant execute on function public.analytics_blind_match() to authenticated;
