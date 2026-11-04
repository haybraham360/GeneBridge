-- Task 05 (M8): SQL tests for the aggregate analytics functions.
--
--   npm run test:sql        (needs SUPABASE_DB_URL in .env.local)
--
-- Runs in one transaction and rolls back, so it leaves no data behind. It
-- builds a centre of its own ('[Centre boundary test]') and checks that every
-- figure stays null at 9 people (or 9 couples) and appears at 10. It also
-- checks that no analytics function can return an ID, name, phone, email or
-- reference code. Fails on the first broken check (ON_ERROR_STOP).

\set ON_ERROR_STOP on
-- Only the NOTICE lines ("ok: ...") and errors are printed.
\o /dev/null
begin;

-- ---------------------------------------------------------------------------
-- No identifiers in any analytics function's output (signature check)
-- ---------------------------------------------------------------------------
do $$
declare
  bad text;
begin
  select string_agg(p.proname || '.' || a.name || ':' || a.type, ', ')
    into bad
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    cross join lateral (
      select unnest(coalesce(p.proargnames, '{}')) as name,
             format_type(unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])), null) as type,
             unnest(coalesce(p.proargmodes, array_fill('i'::"char", array[p.pronargs]))) as mode
    ) a
   where p.proname like 'analytics\_%'
     and a.mode in ('o', 't', 'b')
     and (a.type = 'uuid'
          or a.name ~* '(^id$|_id$|^user$|uid|phone|email|name|reference|code|owner|partner)');
  if bad is not null then
    raise exception 'analytics function returns an identifier-like column: %', bad;
  end if;
  -- Every public analytics function returns a table or a boolean, never a row type of a raw table.
  select string_agg(p.proname, ', ') into bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
   where p.proname like 'analytics\_%'
     and p.prorettype in (select reltype from pg_class where relnamespace = n.oid);
  if bad is not null then
    raise exception 'analytics function returns a raw table row: %', bad;
  end if;
  raise notice 'ok: no identifier columns in analytics function results';
end;
$$;

-- Private helpers are not callable by API roles.
do $$
begin
  if has_schema_privilege('authenticated', 'analytics_private', 'usage')
     or has_schema_privilege('anon', 'analytics_private', 'usage') then
    raise exception 'API roles can use the analytics_private schema';
  end if;
  if has_function_privilege('anon', 'public.analytics_kpis(integer, text)', 'execute') then
    raise exception 'anon can call analytics_kpis';
  end if;
  raise notice 'ok: private helpers are not reachable from the API';
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- A throwaway analyst. The profile row comes from the new-user trigger.
insert into auth.users (id, raw_user_meta_data)
values ('7e570000-0000-4000-8000-00000000a5a5', '{"locale":"en"}');
-- Only the service role may set a role (profiles_guard).
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.profiles set role = 'analyst'
 where user_id = '7e570000-0000-4000-8000-00000000a5a5';
select set_config('request.jwt.claims', '', true);

-- Adds one fully active person in the test centre: Tagalog, read mode,
-- finished onboarding, viewed their result, teach-back before and after,
-- attended counselling 3 days after viewing.
create function pg_temp.add_person(n integer) returns uuid
language plpgsql as $$
declare
  uid uuid := ('7e570000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
begin
  insert into auth.users (id, raw_user_meta_data) values (uid, '{"locale":"en"}');
  update public.profiles
     set locale = 'tl', learning_mode = 'read', created_at = now() - interval '10 days'
   where user_id = uid;
  insert into public.screening_results
    (owner_id, reference_code, condition_code, status, centre, claimed_at)
  values
    (uid, 'BOUNDARY-TEST-' || n, 'sickle_cell', 'carrier', '[Centre boundary test]', now());
  insert into public.events (user_id, name, props, created_at) values
    (uid, 'onboarding_step_completed', '{"step":1,"skipped":false}', now() - interval '10 days'),
    (uid, 'onboarding_completed', '{"seconds":90}', now() - interval '10 days'),
    (uid, 'result_viewed', '{}', now() - interval '9 days'),
    (uid, 'teachback_answered', '{"phase":"pre","question":"q1","correct":false}', now() - interval '9 days'),
    (uid, 'teachback_answered', '{"phase":"post","question":"q1","correct":true}', now() - interval '9 days'),
    (uid, 'booking_created', '{}', now() - interval '8 days'),
    (uid, 'session_attended', '{}', now() - interval '6 days');
  return uid;
end;
$$;

create function pg_temp.pair(a integer, b integer) returns void
language sql as $$
  insert into public.couple_links (inviter_id, invitee_id, status, accepted_at, created_at)
  values (('7e570000-0000-4000-8000-' || lpad(a::text, 12, '0'))::uuid,
          ('7e570000-0000-4000-8000-' || lpad(b::text, 12, '0'))::uuid,
          'active', now() - interval '9 days', now() - interval '9 days');
$$;

-- Checks every figure for the test centre, as the analyst. people_shown:
-- whether people-based figures should be visible; couples_shown: the same
-- for couple-based ones (10 couples needed); at_risk_shown: the equity
-- table's uptake, which counts people in at-risk couples (10 people needed).
create function pg_temp.check_centre(
  label text, people_shown boolean, couples_shown boolean, at_risk_shown boolean)
returns void
language plpgsql as $$
declare
  c text := '[Centre boundary test]';
  k record;
  r record;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"7e570000-0000-4000-8000-00000000a5a5","role":"authenticated"}', true);

  for k in select * from public.analytics_kpis(30, c) where period = 'current' loop
    if (k.pre_score is not null) <> people_shown
       or (k.post_score is not null) <> people_shown
       or (k.median_days is not null) <> people_shown
       or (k.onboarding_pct is not null) <> people_shown then
      raise exception '%: analytics_kpis people figures wrong: %', label, k;
    end if;
    if (k.uptake_pct is not null) <> couples_shown then
      raise exception '%: analytics_kpis uptake wrong: %', label, k;
    end if;
  end loop;

  for r in select * from public.analytics_funnel(30, c) loop
    if r.step in ('signed_up', 'finished_onboarding', 'viewed_result')
       and (r.value is not null) <> people_shown then
      raise exception '%: funnel step % wrong: %', label, r.step, r.value;
    end if;
    if r.step in ('at_risk_couples', 'booked_counselling', 'attended_counselling')
       and (r.value is not null) <> couples_shown then
      raise exception '%: funnel step % wrong: %', label, r.step, r.value;
    end if;
    if r.value is not null and r.value < 10 then
      raise exception '%: funnel step % shows a group under 10: %', label, r.step, r.value;
    end if;
  end loop;

  for r in select * from public.analytics_learning_modes(30, c) loop
    if r.mode = 'read' and ((r.users is not null) <> people_shown or (r.gain is not null) <> people_shown) then
      raise exception '%: learning mode read wrong: %', label, r;
    end if;
    if r.mode <> 'read' and (r.users is not null or r.gain is not null) then
      raise exception '%: empty learning mode % not hidden: %', label, r.mode, r;
    end if;
  end loop;

  for r in select * from public.analytics_equity(30, c) loop
    if r.language in ('tl', 'all') then
      if (r.users is not null) <> people_shown
         or (r.gain is not null) <> people_shown
         or (r.median_days is not null) <> people_shown
         or (r.uptake_pct is not null) <> at_risk_shown then
        raise exception '%: equity row % wrong: %', label, r.language, r;
      end if;
    elsif r.users is not null or r.gain is not null or r.uptake_pct is not null or r.median_days is not null then
      raise exception '%: empty language % not hidden: %', label, r.language, r;
    end if;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  raise notice 'ok: %', label;
end;
$$;

-- ---------------------------------------------------------------------------
-- The group-of-10 rule
-- ---------------------------------------------------------------------------
select pg_temp.add_person(n) from generate_series(1, 9) n;
-- 4 couples among 9 people.
select pg_temp.pair(1, 2); select pg_temp.pair(3, 4); select pg_temp.pair(5, 6); select pg_temp.pair(7, 8);
select pg_temp.check_centre('9 people: every figure hidden', false, false, false);

select pg_temp.add_person(10);
select pg_temp.check_centre('10 people: people figures shown, 4 couples still hidden', true, false, false);

select pg_temp.add_person(n) from generate_series(11, 18) n;
select pg_temp.pair(9, 10); select pg_temp.pair(11, 12); select pg_temp.pair(13, 14);
select pg_temp.pair(15, 16); select pg_temp.pair(17, 18);
-- 9 couples is 18 people: couple counts stay hidden, but the equity
-- table's uptake (a group of 18 people) is shown.
select pg_temp.check_centre('9 couples: couple figures hidden', true, false, true);

select pg_temp.add_person(n) from generate_series(19, 20) n;
select pg_temp.pair(19, 20);
select pg_temp.check_centre('10 couples: couple figures shown', true, true, true);

-- A centre with nobody in it: everything null, nothing raises.
do $$
declare r record;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"7e570000-0000-4000-8000-00000000a5a5","role":"authenticated"}', true);
  for r in select * from public.analytics_funnel(null, '[No such centre]') loop
    if r.value is not null then raise exception 'empty centre shows %', r; end if;
  end loop;
  for r in select * from public.analytics_equity(null, '[No such centre]') loop
    if r.users is not null then raise exception 'empty centre shows %', r; end if;
  end loop;
  execute 'reset role';
  raise notice 'ok: empty centre returns nulls';
end;
$$;

-- ---------------------------------------------------------------------------
-- Access rules
-- ---------------------------------------------------------------------------
-- A normal user can't call the functions; arbitrary windows are refused.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    '{"sub":"7e570000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  begin
    perform * from public.analytics_kpis(90, null);
    raise exception 'a normal user called analytics_kpis';
  exception when insufficient_privilege then null;
  end;
  if public.analytics_is_analyst() then
    raise exception 'a normal user is reported as an analyst';
  end if;

  perform set_config('request.jwt.claims',
    '{"sub":"7e570000-0000-4000-8000-00000000a5a5","role":"authenticated"}', true);
  begin
    perform * from public.analytics_funnel(31, null);
    raise exception 'a 31-day window was accepted';
  exception when invalid_parameter_value then null;
  end;
  -- The analyst sees no raw rows, not even their own profile.
  if exists (select 1 from public.profiles) then
    raise exception 'the analyst can read profiles';
  end if;
  begin
    perform 1 from public.events limit 1;
    raise exception 'the analyst can read events';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.screening_results) then
    raise exception 'the analyst can read screening results';
  end if;
  execute 'reset role';
  raise notice 'ok: access rules';
end;
$$;

rollback;
