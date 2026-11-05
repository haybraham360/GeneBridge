-- Task 05 (M8): health authority dashboard. Aggregate-only analytics.
--
-- Guardrail 11: analysts never read raw rows. Every figure comes from the
-- security-definer functions below, which return aggregates only and return
-- null for any group of fewer than 10 people. No function returns a name,
-- phone number, reference code or user ID.
--
-- Never collected, never shown: marriage status, engagement cancellations and
-- decisions about pregnancy. There are no columns, events or functions for them.

-- ---------------------------------------------------------------------------
-- profiles: synthetic marker and analyst lock-out
-- ---------------------------------------------------------------------------
-- Synthetic demo users (scripts/seed-analytics.ts) are marked so they can be
-- removed with one command (scripts/clear-synthetic.ts). Not grantable to
-- users: only the service role sets it.
alter table public.profiles
  add column is_synthetic boolean not null default false;

create index profiles_synthetic_idx on public.profiles (is_synthetic) where is_synthetic;

-- Analysts get no rows from raw tables, not even their own profile. The app
-- learns the role through analytics_is_analyst() instead.
drop policy "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) and role <> 'analyst');

-- Event names the dashboard reads, and the new export event. Indexed for the
-- per-user lookups below.
create index events_user_name_idx on public.events (user_id, name, created_at);

-- ---------------------------------------------------------------------------
-- analytics_private: helpers that touch row-level data
-- ---------------------------------------------------------------------------
-- Not exposed through the API (only `public` is), and no API role may use it.
-- These functions return user IDs internally, so they must never be callable
-- from outside. The public wrappers further down aggregate their output.
create schema analytics_private;
revoke all on schema analytics_private from public, anon, authenticated;
alter default privileges in schema analytics_private
  revoke execute on functions from public, anon, authenticated;

-- The minimum group size. Change it here only.
create function analytics_private.min_group()
returns integer
language sql
immutable
set search_path = ''
as $$ select 10 $$;

-- A value computed over `n` people, or null when the group is too small.
create function analytics_private.k(n bigint, v numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$ select case when n >= analytics_private.min_group() then v end $$;

create function analytics_private.require_analyst()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'analyst'
  ) then
    raise exception 'analyst role required' using errcode = '42501';
  end if;
end;
$$;

-- Only fixed windows are allowed (30 days, 90 days or all time). Arbitrary
-- windows would let someone subtract two overlapping periods and single out
-- one person.
create function analytics_private.check_days(p_days integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_days is not null and p_days not in (30, 90) then
    raise exception 'p_days must be 30, 90 or null' using errcode = '22023';
  end if;
end;
$$;

-- The cohort: people who signed up in [p_from, p_to), optionally only those
-- whose screening result came from p_centre (people without a connected
-- result appear under "All centres" only).
create function analytics_private.cohort(p_from timestamptz, p_to timestamptz, p_centre text)
returns table (user_id uuid, locale text, learning_mode text)
language sql
stable
set search_path = ''
as $$
  select p.user_id, p.locale, p.learning_mode
    from public.profiles p
   where p.role = 'individual'
     and (p_from is null or p.created_at >= p_from)
     and p.created_at < p_to
     and (
       p_centre is null
       or exists (
         select 1 from public.screening_results r
          where r.owner_id = p.user_id and r.centre = p_centre
       )
     )
$$;

-- At-risk couples as of p_to: an active couple link where both partners have
-- a result showing a changed copy (carrier or affected) of the same
-- condition. Booked / attended: either partner logged booking_created /
-- session_attended. This describes access to counselling only; it says
-- nothing about, and is never linked to, any decision the couple makes.
create function analytics_private.at_risk_couples(p_to timestamptz)
returns table (inviter_id uuid, invitee_id uuid, booked boolean, attended boolean)
language sql
stable
set search_path = ''
as $$
  select
    l.inviter_id,
    l.invitee_id,
    exists (
      select 1 from public.events e
       where e.user_id in (l.inviter_id, l.invitee_id)
         and e.name = 'booking_created' and e.created_at < p_to
    ),
    exists (
      select 1 from public.events e
       where e.user_id in (l.inviter_id, l.invitee_id)
         and e.name = 'session_attended' and e.created_at < p_to
    )
  from public.couple_links l
  where l.status = 'active'
    and l.invitee_id is not null
    and coalesce(l.accepted_at, l.created_at) < p_to
    and exists (
      select 1
        from public.screening_results a
        join public.screening_results b on b.condition_code = a.condition_code
       where a.owner_id = l.inviter_id
         and b.owner_id = l.invitee_id
         and a.status in ('carrier', 'affected')
         and b.status in ('carrier', 'affected')
    )
$$;

-- Couples counted for a cohort: at least one partner is in it.
create function analytics_private.cohort_couples(p_from timestamptz, p_to timestamptz, p_centre text)
returns table (booked boolean, attended boolean)
language sql
stable
set search_path = ''
as $$
  with c as (select user_id from analytics_private.cohort(p_from, p_to, p_centre))
  select k.booked, k.attended
    from analytics_private.at_risk_couples(p_to) k
   where k.inviter_id in (select user_id from c)
      or k.invitee_id in (select user_id from c)
$$;

-- One row per cohort member. Facts are as of p_to:
--
--   started / completed   onboarding_step_completed / onboarding_completed
--   viewed                result_viewed
--   pre_score, post_score % of teach-back answers correct (teachback_answered,
--                         props.phase 'pre' or 'post', props.correct boolean)
--   days_to_referral      first result_viewed -> first session_attended
--   at_risk / attended    in an at-risk couple / that couple attended counselling
create function analytics_private.user_facts(p_from timestamptz, p_to timestamptz, p_centre text)
returns table (
  user_id          uuid,
  locale           text,
  learning_mode    text,
  started          boolean,
  completed        boolean,
  viewed           boolean,
  pre_score        numeric,
  post_score       numeric,
  days_to_referral numeric,
  at_risk          boolean,
  attended         boolean
)
language sql
stable
set search_path = ''
as $$
  with cohort as (select * from analytics_private.cohort(p_from, p_to, p_centre)),
  per_user as (
    select
      e.user_id,
      bool_or(e.name in ('onboarding_step_completed', 'onboarding_completed')) as started,
      bool_or(e.name = 'onboarding_completed') as completed,
      bool_or(e.name = 'result_viewed') as viewed,
      100 * avg(case when e.props ->> 'correct' = 'true' then 1.0
                     when e.props ->> 'correct' = 'false' then 0.0 end)
        filter (where e.name = 'teachback_answered' and e.props ->> 'phase' = 'pre') as pre_score,
      100 * avg(case when e.props ->> 'correct' = 'true' then 1.0
                     when e.props ->> 'correct' = 'false' then 0.0 end)
        filter (where e.name = 'teachback_answered' and e.props ->> 'phase' = 'post') as post_score,
      min(e.created_at) filter (where e.name = 'result_viewed') as first_view,
      min(e.created_at) filter (where e.name = 'session_attended') as first_session
    from public.events e
    join cohort c on c.user_id = e.user_id
   where e.created_at < p_to
     and e.name in (
       'onboarding_step_completed', 'onboarding_completed', 'result_viewed',
       'teachback_answered', 'session_attended'
     )
   group by e.user_id
  ),
  couple_members as materialized (
    select k.inviter_id as member, k.attended from analytics_private.at_risk_couples(p_to) k
    union all
    select k.invitee_id, k.attended from analytics_private.at_risk_couples(p_to) k
  ),
  membership as (
    select member, bool_or(attended) as attended from couple_members group by member
  )
  select
    c.user_id,
    c.locale,
    c.learning_mode,
    coalesce(u.started, false),
    coalesce(u.completed, false),
    coalesce(u.viewed, false),
    u.pre_score,
    u.post_score,
    case when u.first_session >= u.first_view
         then extract(epoch from u.first_session - u.first_view) / 86400.0 end,
    m.member is not null,
    coalesce(m.attended, false)
  from cohort c
  left join per_user u on u.user_id = c.user_id
  left join membership m on m.member = c.user_id
$$;

-- The four headline figures for one window, already suppressed.
create function analytics_private.kpis_for(p_from timestamptz, p_to timestamptz, p_centre text)
returns table (
  pre_score       numeric,
  post_score      numeric,
  uptake_pct      numeric,
  median_days     numeric,
  onboarding_pct  numeric
)
language sql
stable
set search_path = ''
as $$
  with f as (select * from analytics_private.user_facts(p_from, p_to, p_centre)),
  tb as (select * from f where pre_score is not null and post_score is not null),
  ref as (select * from f where days_to_referral is not null),
  ob as (select * from f where started),
  cp as (select * from analytics_private.cohort_couples(p_from, p_to, p_centre))
  select
    analytics_private.k((select count(*) from tb), round((select avg(pre_score) from tb), 1)),
    analytics_private.k((select count(*) from tb), round((select avg(post_score) from tb), 1)),
    -- Stricter than 10 people: needs 10 couples.
    analytics_private.k(
      (select count(*) from cp),
      round(100.0 * (select count(*) filter (where attended) from cp)
            / nullif((select count(*) from cp), 0), 1)
    ),
    analytics_private.k(
      (select count(*) from ref),
      round((select percentile_cont(0.5) within group (order by days_to_referral) from ref)::numeric, 1)
    ),
    analytics_private.k(
      (select count(*) from ob),
      round(100.0 * (select count(*) filter (where completed) from ob)
            / nullif((select count(*) from ob), 0), 1)
    )
$$;

-- ---------------------------------------------------------------------------
-- Public analytics functions (analyst only)
-- ---------------------------------------------------------------------------
-- p_days: 30, 90 or null (all time). p_centre: a centre name or null (all).

-- For the proxy and the page: is the caller an analyst? Safe for anyone to
-- call; it reveals only the caller's own role.
create function public.analytics_is_analyst()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
     where user_id = auth.uid() and role = 'analyst'
  )
$$;

-- Centres with at least 10 people, for the centre filter.
create function public.analytics_centres()
returns table (centre text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform analytics_private.require_analyst();
  return query
    select r.centre
      from public.screening_results r
      join public.profiles p on p.user_id = r.owner_id and p.role = 'individual'
     where r.centre is not null
     group by r.centre
    having count(distinct r.owner_id) >= analytics_private.min_group()
     order by r.centre;
end;
$$;

-- Headline figures for the chosen window ('current') and the window of the
-- same length just before it ('previous'; all null for all time).
create function public.analytics_kpis(p_days integer, p_centre text default null)
returns table (
  period          text,
  pre_score       numeric,
  post_score      numeric,
  uptake_pct      numeric,
  median_days     numeric,
  onboarding_pct  numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := now();
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);

  return query
    select 'current'::text, k.*
      from analytics_private.kpis_for(
        case when p_days is null then null else now_at - make_interval(days => p_days) end,
        now_at, p_centre) k;

  if p_days is null then
    return query select 'previous'::text, null::numeric, null::numeric, null::numeric,
                        null::numeric, null::numeric;
  else
    return query
      select 'previous'::text, k.*
        from analytics_private.kpis_for(
          now_at - make_interval(days => 2 * p_days),
          now_at - make_interval(days => p_days), p_centre) k;
  end if;
end;
$$;

-- "From sign-up to counselling". The first three steps count people, the
-- last three count couples.
create function public.analytics_funnel(p_days integer, p_centre text default null)
returns table (step text, step_order integer, value integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := now();
  w_from timestamptz := case when p_days is null then null else now_at - make_interval(days => p_days) end;
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);

  return query
    with f as (select * from analytics_private.user_facts(w_from, now_at, p_centre)),
    cp as (select * from analytics_private.cohort_couples(w_from, now_at, p_centre)),
    counts (step, step_order, n) as (
      values
        ('signed_up',           1, (select count(*) from f)),
        ('finished_onboarding', 2, (select count(*) from f where completed)),
        ('viewed_result',       3, (select count(*) from f where viewed)),
        ('at_risk_couples',     4, (select count(*) from cp)),
        ('booked_counselling',  5, (select count(*) from cp where booked)),
        ('attended_counselling',6, (select count(*) from cp where attended))
    )
    select c.step, c.step_order, analytics_private.k(c.n, c.n)::integer
      from counts c
     order by c.step_order;
end;
$$;

-- "Read vs listen": average teach-back gain (post minus pre, in points) by
-- learning mode, among people who answered both.
create function public.analytics_learning_modes(p_days integer, p_centre text default null)
returns table (mode text, users integer, gain numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := now();
  w_from timestamptz := case when p_days is null then null else now_at - make_interval(days => p_days) end;
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);

  return query
    with f as (
      select * from analytics_private.user_facts(w_from, now_at, p_centre)
       where pre_score is not null and post_score is not null
    ),
    modes (mode, sort) as (values ('read', 1), ('listen', 2), ('read_listen', 3))
    select
      m.mode,
      analytics_private.k(count(f.user_id), count(f.user_id))::integer,
      analytics_private.k(count(f.user_id), round(avg(f.post_score - f.pre_score), 1))
    from modes m
    left join f on f.learning_mode = m.mode
    group by m.mode, m.sort
    order by m.sort;
end;
$$;

-- "Equity by language". One row per language plus an 'all' row (the same
-- measures across everyone), used to flag languages more than 5 points below.
-- uptake_pct here counts people in at-risk couples, by their own language.
create function public.analytics_equity(p_days integer, p_centre text default null)
returns table (
  language    text,
  users       integer,
  gain        numeric,
  uptake_pct  numeric,
  median_days numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := now();
  w_from timestamptz := case when p_days is null then null else now_at - make_interval(days => p_days) end;
begin
  perform analytics_private.require_analyst();
  perform analytics_private.check_days(p_days);

  return query
    with f as (select * from analytics_private.user_facts(w_from, now_at, p_centre)),
    langs (language, sort) as (
      values ('ar', 1), ('en', 2), ('ur', 3), ('hi', 4), ('tl', 5), ('all', 6)
    ),
    g as (
      select l.language, l.sort, f.*
        from langs l
        left join f on (l.language = 'all' or f.locale = l.language)
    )
    select
      g.language,
      analytics_private.k(count(g.user_id), count(g.user_id))::integer,
      analytics_private.k(
        count(*) filter (where g.pre_score is not null and g.post_score is not null),
        round(avg(g.post_score - g.pre_score), 1)
      ),
      analytics_private.k(
        count(*) filter (where g.at_risk),
        round(100.0 * count(*) filter (where g.at_risk and g.attended)
              / nullif(count(*) filter (where g.at_risk), 0), 1)
      ),
      analytics_private.k(
        count(g.days_to_referral),
        round((percentile_cont(0.5) within group (order by g.days_to_referral))::numeric, 1)
      )
    from g
    group by g.language, g.sort
    order by g.sort;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Private helpers: nobody but the function owner.
revoke all on all functions in schema analytics_private from public, anon, authenticated;

-- Public functions: signed-in users may call them; each one checks the
-- analyst role itself and raises for anyone else.
revoke all on function public.analytics_is_analyst() from public, anon;
revoke all on function public.analytics_centres() from public, anon;
revoke all on function public.analytics_kpis(integer, text) from public, anon;
revoke all on function public.analytics_funnel(integer, text) from public, anon;
revoke all on function public.analytics_learning_modes(integer, text) from public, anon;
revoke all on function public.analytics_equity(integer, text) from public, anon;

grant execute on function public.analytics_is_analyst() to authenticated;
grant execute on function public.analytics_centres() to authenticated;
grant execute on function public.analytics_kpis(integer, text) to authenticated;
grant execute on function public.analytics_funnel(integer, text) to authenticated;
grant execute on function public.analytics_learning_modes(integer, text) to authenticated;
grant execute on function public.analytics_equity(integer, text) to authenticated;
