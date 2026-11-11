-- Task 17: Blind Match. Run with `npm run test:sql`. Rolls back; leaves
-- nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

insert into auth.users (id) values
  ('b11d0000-0000-4000-8000-0000000000a1'),  -- A: carrier of beta-thalassaemia, no change for CF
  ('b11d0000-0000-4000-8000-0000000000b2'),  -- B: carrier of beta-thalassaemia
  ('b11d0000-0000-4000-8000-0000000000c3'),  -- C: no change for beta-thalassaemia
  ('b11d0000-0000-4000-8000-0000000000d4'),  -- D: flagged result
  ('b11d0000-0000-4000-8000-0000000000e5'),  -- E: no result
  ('b11d0000-0000-4000-8000-0000000000f6');  -- F: dominant condition only

insert into public.screening_results (owner_id, reference_code, condition_code, status, flagged, flag_reason, claimed_at) values
  ('b11d0000-0000-4000-8000-0000000000a1', 'BMT-A', 'beta_thalassemia', 'carrier', false, null, now()),
  ('b11d0000-0000-4000-8000-0000000000a1', 'BMT-A', 'cystic_fibrosis', 'no_variant', false, null, now()),
  ('b11d0000-0000-4000-8000-0000000000b2', 'BMT-B', 'beta_thalassemia', 'carrier', false, null, now()),
  ('b11d0000-0000-4000-8000-0000000000c3', 'BMT-C', 'beta_thalassemia', 'no_variant', false, null, now()),
  ('b11d0000-0000-4000-8000-0000000000d4', 'BMT-D', 'beta_thalassemia', 'uncertain', true, 'vus', now()),
  ('b11d0000-0000-4000-8000-0000000000f6', 'BMT-F', 'familial_hypercholesterolemia', 'carrier', false, null, now());

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

create temp table t (k text primary key, v text);
grant all on t to authenticated, service_role;

-- Who can take part, checked before any session exists.
do $$
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  if public.blind_match_eligibility() <> 'ok' then raise exception 'A should be eligible'; end if;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000d4');
  if public.blind_match_eligibility() <> 'flagged' then raise exception 'D (flagged) was not stopped'; end if;
  if (public.blind_match_start('D')) ->> 'status' <> 'flagged' then raise exception 'D could start'; end if;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000e5');
  if public.blind_match_eligibility() <> 'no_result' then raise exception 'E (no result) was not stopped'; end if;
  execute 'reset role';
  raise notice 'ok: flagged and no-result people cannot start';
end $$;

-- Start, a wrong code, an ineligible joiner, then the right person joins.
do $$
declare r jsonb;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  r := public.blind_match_start('Mariam');
  if r ->> 'status' <> 'ok' or (r ->> 'code') !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$' then
    raise exception 'unexpected start %', r;
  end if;
  insert into t values ('session', r ->> 'session_id'), ('code', r ->> 'code');
  execute 'reset role';
  if exists (select 1 from public.blind_match_sessions where token_hash = r ->> 'code') then
    raise exception 'the code was stored in plain text';
  end if;

  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000d4');
  if (public.blind_match_join((select v from t where k = 'code'), 'D')) ->> 'status' <> 'flagged' then
    raise exception 'a flagged person could join';
  end if;
  execute 'reset role';
  if (select status from public.blind_match_sessions where id = (select v from t where k = 'session')::uuid) <> 'waiting' then
    raise exception 'a refused join changed the session';
  end if;

  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  if (public.blind_match_join('ZZZZZZ', 'Khalid')) ->> 'status' <> 'not_found' then raise exception 'a wrong code joined'; end if;
  r := public.blind_match_join(lower((select v from t where k = 'code')), 'Khalid');
  if r ->> 'status' <> 'ok' or r ->> 'other_label' <> 'Mariam' then raise exception 'join failed %', r; end if;
  execute 'reset role';
  raise notice 'ok: hashed code, refused joins leave no trace, right code joins';
end $$;

-- Nobody can read the tables or the other person's results directly.
do $$
declare n integer;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  begin
    perform count(*) from public.blind_match_sessions;
    raise exception 'sessions were readable';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.screening_results where owner_id = 'b11d0000-0000-4000-8000-0000000000a1';
  if n <> 0 then raise exception 'B read A''s results'; end if;
  execute 'reset role';
  raise notice 'ok: tables closed, results stay private';
end $$;

-- Both agree, the answer is shared and the same for both, and it is logged.
do $$
declare s uuid := (select v from t where k = 'session')::uuid; a jsonb; b jsonb; n integer;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  perform public.blind_match_agree(s);
  if (public.blind_match_state(s)) ->> 'status' <> 'joined' then raise exception 'resolved on one agreement'; end if;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  if not ((public.blind_match_state(s)) ->> 'other_agreed')::boolean then raise exception 'A cannot see B agreed'; end if;
  perform public.blind_match_agree(s);
  a := public.blind_match_state(s);
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  b := public.blind_match_state(s);
  if a ->> 'outcome' <> 'shared' or b ->> 'outcome' <> 'shared' then raise exception 'expected shared: % / %', a, b; end if;
  if a -> 'revealed_codes' <> 'null'::jsonb then raise exception 'condition shown before both tapped'; end if;
  execute 'reset role';
  select count(*) into n from public.access_log where level = 'blind_match'
     and resource_owner_id in ('b11d0000-0000-4000-8000-0000000000a1', 'b11d0000-0000-4000-8000-0000000000b2');
  if n <> 2 then raise exception 'expected 2 access_log rows, got %', n; end if;
  if exists (select 1 from public.events where name like 'blind_match%' and props <> '{}'::jsonb) then
    raise exception 'an event carries props';
  end if;
  raise notice 'ok: shared answer, same on both screens, logged for both, no outcome in events';
end $$;

-- The condition is named only once both tap, and never stored.
do $$
declare s uuid := (select v from t where k = 'session')::uuid; r jsonb;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  perform public.blind_match_reveal(s);
  r := public.blind_match_state(s);
  if r -> 'revealed_codes' <> 'null'::jsonb then raise exception 'revealed on one tap'; end if;
  if r ? 'other_revealed' then raise exception 'state shows whether the other tapped'; end if;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  perform public.blind_match_reveal(s);
  r := public.blind_match_state(s);
  if r -> 'revealed_codes' <> '["beta_thalassemia"]'::jsonb then raise exception 'unexpected reveal %', r; end if;
  execute 'reset role';
  raise notice 'ok: mutual reveal only';
end $$;

-- No shared change; only the conditions both were screened for count.
do $$
declare r jsonb; s uuid;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  r := public.blind_match_start(null);
  s := (r ->> 'session_id')::uuid;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000c3');
  perform public.blind_match_join(r ->> 'code', null);
  perform public.blind_match_agree(s);
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000a1');
  perform public.blind_match_agree(s);
  r := public.blind_match_state(s);
  if r ->> 'outcome' <> 'none' or r -> 'screened_codes' <> '["beta_thalassemia"]'::jsonb then
    raise exception 'expected none on beta-thalassaemia only: %', r;
  end if;
  begin
    perform public.blind_match_reveal(s);
    raise exception 'a "none" answer could be revealed';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';
  raise notice 'ok: none, screened list is the overlap only';
end $$;

-- Dominant-only results are never compared.
do $$
declare r jsonb; s uuid;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000f6');
  r := public.blind_match_start(null);
  s := (r ->> 'session_id')::uuid;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  perform public.blind_match_join(r ->> 'code', null);
  perform public.blind_match_agree(s);
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000f6');
  perform public.blind_match_agree(s);
  if (public.blind_match_state(s)) ->> 'outcome' <> 'not_comparable' then raise exception 'dominant condition compared'; end if;
  execute 'reset role';
  raise notice 'ok: not comparable when no recessive condition was screened for both';
end $$;

-- Third match in 30 days is the last; a stranger can't see the session.
do $$
declare s uuid := (select v from t where k = 'session')::uuid;
begin
  -- B has matched with A and F; one more earlier match makes 3.
  insert into public.blind_match_usage (user_id, resolved_at)
  values ('b11d0000-0000-4000-8000-0000000000b2', now() - interval '20 days');
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000b2');
  if public.blind_match_eligibility() <> 'limit' then raise exception 'B passed the limit of 3'; end if;
  if (public.blind_match_start(null)) ->> 'status' <> 'limit' then raise exception 'B could start over the limit'; end if;
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000c3');
  if (public.blind_match_state(s)) ->> 'status' <> 'gone' then raise exception 'a stranger saw the session'; end if;
  begin
    perform public.blind_match_agree(s);
    raise exception 'a stranger could agree';
  exception when no_data_found then null;
  end;
  execute 'reset role';
  raise notice 'ok: rate limit, strangers see nothing';
end $$;

-- Cancel before the answer; cleanup deletes expired sessions (service only).
do $$
declare r jsonb; n integer;
begin
  perform pg_temp.as_user('b11d0000-0000-4000-8000-0000000000c3');
  r := public.blind_match_start(null);
  perform public.blind_match_cancel((r ->> 'session_id')::uuid);
  if (public.blind_match_state((r ->> 'session_id')::uuid)) ->> 'status' <> 'cancelled' then raise exception 'cancel failed'; end if;
  begin
    perform public.blind_match_cleanup();
    raise exception 'a user could run cleanup';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  update public.blind_match_sessions set expires_at = now() - interval '1 second'
   where starter_id = 'b11d0000-0000-4000-8000-0000000000c3';
  perform pg_temp.as_service();
  n := public.blind_match_cleanup();
  if n < 1 then raise exception 'cleanup deleted nothing'; end if;
  execute 'reset role';
  raise notice 'ok: cancel, cleanup';
end $$;

\o
rollback;
