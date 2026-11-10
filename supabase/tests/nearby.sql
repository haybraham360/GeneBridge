-- Nearby care (docs/nearby-care.md). Run with `npm run test:sql`. Rolls
-- back; leaves nothing behind.

\set ON_ERROR_STOP on
\o /dev/null
begin;

-- Fixtures: patients P and Q; verified professional D (accepting), verified
-- professional N (not accepting), unverified professional U, verified
-- professional H (accepting, location hidden).
insert into auth.users (id, raw_user_meta_data) values
  ('16400000-0000-4000-8000-0000000000a1', '{"display_name":"Patient P"}'),
  ('16400000-0000-4000-8000-0000000000a2', '{"display_name":"Patient Q"}'),
  ('16400000-0000-4000-8000-0000000000d1', '{"display_name":"Dr Near"}'),
  ('16400000-0000-4000-8000-0000000000d2', '{"display_name":"Dr Not Accepting"}'),
  ('16400000-0000-4000-8000-0000000000d3', '{"display_name":"Dr Unverified"}'),
  ('16400000-0000-4000-8000-0000000000d4', '{"display_name":"Dr Hidden"}');

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

select pg_temp.as_service();
update public.profiles set role = 'professional'
 where user_id in ('16400000-0000-4000-8000-0000000000d1', '16400000-0000-4000-8000-0000000000d2',
                   '16400000-0000-4000-8000-0000000000d3', '16400000-0000-4000-8000-0000000000d4');
insert into public.professional_profiles (user_id, display_name, profession, languages, specialties, verification_status,
  licence_number, licence_authority, licence_expiry, accepting_patients) values
  ('16400000-0000-4000-8000-0000000000d1', 'Dr Near', 'genetic_counsellor', '{ar,en}', '{}', 'verified', 'LIC-N1', 'doh_abu_dhabi', current_date + 365, true),
  ('16400000-0000-4000-8000-0000000000d2', 'Dr Not Accepting', 'genetic_counsellor', '{ar}', '{}', 'verified', 'LIC-N2', 'doh_abu_dhabi', current_date + 365, false),
  ('16400000-0000-4000-8000-0000000000d3', 'Dr Unverified', 'nurse', '{ar}', '{}', 'unverified', null, null, null, false),
  ('16400000-0000-4000-8000-0000000000d4', 'Dr Hidden', 'genetic_counsellor', '{en}', '{}', 'verified', 'LIC-N4', 'doh_abu_dhabi', current_date + 365, true);
-- All four in Khalifa City (about 21 km from Abu Dhabi city centre). D also
-- has a second, further location in Al Ain.
insert into public.practice_locations (user_id, label, area_id, emirate, lat, lng, show_on_map) values
  ('16400000-0000-4000-8000-0000000000d1', '[Clinic N1]', 'khalifa_city', 'abu_dhabi', 24.42, 54.58, true),
  ('16400000-0000-4000-8000-0000000000d1', '[Clinic N1 Al Ain]', 'al_ain', 'abu_dhabi', 24.21, 55.74, true),
  ('16400000-0000-4000-8000-0000000000d2', '[Clinic N2]', 'khalifa_city', 'abu_dhabi', 24.42, 54.58, true),
  ('16400000-0000-4000-8000-0000000000d3', '[Clinic N3]', 'khalifa_city', 'abu_dhabi', 24.42, 54.58, true),
  ('16400000-0000-4000-8000-0000000000d4', '[Clinic N4]', 'khalifa_city', 'abu_dhabi', 24.42, 54.58, false);

-- ---------------------------------------------------------------------------
-- Only bookable professionals, once each, at their closest location
-- ---------------------------------------------------------------------------
do $$
declare
  n    int;
  d    numeric;
  lbl  text;
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.nearby_professionals(24.47, 54.37, 50)
   where user_id in ('16400000-0000-4000-8000-0000000000d2', '16400000-0000-4000-8000-0000000000d3', '16400000-0000-4000-8000-0000000000d4');
  if n <> 0 then raise exception 'unverified, not-accepting or hidden professionals appear nearby (%)', n; end if;

  select count(*) into n from public.nearby_professionals(24.47, 54.37, 50) where user_id = '16400000-0000-4000-8000-0000000000d1';
  if n <> 1 then raise exception 'the verified professional should appear exactly once, got %', n; end if;

  select distance_km, label into d, lbl from public.nearby_professionals(24.47, 54.37, 50) where user_id = '16400000-0000-4000-8000-0000000000d1';
  if lbl <> '[Clinic N1]' then raise exception 'not the closest location: %', lbl; end if;
  if d * 2 <> round(d * 2) then raise exception 'distance % is not rounded to 0.5 km', d; end if;
  if d not between 18 and 25 then raise exception 'unexpected distance %', d; end if;

  select count(*) into n from public.nearby_professionals(24.47, 54.37, 5);
  if n <> 0 then raise exception 'a 5 km search returned % professionals 20 km away', n; end if;
  raise notice 'ok: only bookable professionals with visible locations, once each, closest first, rounded';
end $$;

-- Suspending a professional removes them at once.
do $$
declare
  n int;
begin
  perform pg_temp.as_service();
  update public.professional_profiles set verification_status = 'suspended', accepting_patients = false where user_id = '16400000-0000-4000-8000-0000000000d1';
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.nearby_professionals(24.47, 54.37, 50);
  if n <> 0 then raise exception 'a suspended professional still appears nearby'; end if;
  perform pg_temp.as_service();
  update public.professional_profiles set verification_status = 'verified', accepting_patients = true where user_id = '16400000-0000-4000-8000-0000000000d1';
  raise notice 'ok: suspension hides the professional immediately';
end $$;

-- ---------------------------------------------------------------------------
-- Practice locations are owner-only
-- ---------------------------------------------------------------------------
do $$
declare
  n int;
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.practice_locations;
  if n <> 0 then raise exception 'a patient can read practice_locations directly (%)', n; end if;
  begin
    insert into public.practice_locations (user_id, label, area_id, emirate, lat, lng)
    values ('16400000-0000-4000-8000-0000000000a1', 'Home', 'mussafah', 'abu_dhabi', 24.35, 54.5);
    raise exception 'a patient added a practice location';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.practice_locations set lat = 25 where user_id = '16400000-0000-4000-8000-0000000000d1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'a patient changed a professional''s location'; end if;
  end;

  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000d2');
  select count(*) into n from public.practice_locations;
  if n <> 1 then raise exception 'a professional should see only their own location, saw %', n; end if;
  raise notice 'ok: practice locations are readable and writable by their owner only';
end $$;

-- At most 5 each.
do $$
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000d2');
  insert into public.practice_locations (user_id, label, area_id, emirate, lat, lng)
  select '16400000-0000-4000-8000-0000000000d2', 'Extra ' || g, 'mussafah', 'abu_dhabi', 24.35, 54.5 from generate_series(1, 4) g;
  begin
    insert into public.practice_locations (user_id, label, area_id, emirate, lat, lng)
    values ('16400000-0000-4000-8000-0000000000d2', 'Sixth', 'mussafah', 'abu_dhabi', 24.35, 54.5);
    raise exception 'a sixth location was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'too_many_locations' then raise; end if;
  end;
  raise notice 'ok: at most 5 locations';
end $$;

-- ---------------------------------------------------------------------------
-- Input checks, rounding and nothing stored
-- ---------------------------------------------------------------------------
do $$
declare
  n      int;
  before int;
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  begin
    perform * from public.nearby_professionals(95, 10, 25);
    raise exception 'an impossible point was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'bad_point' then raise; end if;
  end;
  begin
    perform * from public.nearby_services(24.47, 54.37, 101);
    raise exception 'a 101 km radius was accepted';
  exception when invalid_parameter_value then
    if sqlerrm <> 'bad_radius' then raise; end if;
  end;
  perform * from public.nearby_services(24.47, 54.37, 100);

  -- A precise point gives the same answer as its rounded value.
  if (select array_agg(user_id order by user_id) from public.nearby_professionals(24.473218, 54.371987, 50))
     is distinct from (select array_agg(user_id order by user_id) from public.nearby_professionals(24.47, 54.37, 50)) then
    raise exception 'a precise point was not rounded';
  end if;

  -- Placeholder services have map points.
  select count(*) into n from public.nearby_services(24.47, 54.37, 25);
  if n = 0 then raise exception 'no services near Abu Dhabi city'; end if;
  select count(*) into n from public.nearby_services(24.47, 54.37, 25, array['genetic_counselling']) where kind <> 'genetic_counselling';
  if n <> 0 then raise exception 'the kind filter let other kinds through'; end if;

  perform pg_temp.as_service();
  select count(*) into before from public.events;
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  perform * from public.nearby_professionals(24.47, 54.37, 25);
  perform pg_temp.as_service();
  select count(*) - before into n from public.events;
  if n <> 0 then raise exception 'a search wrote % events from the database', n; end if;

  -- The only thing kept is a call count: no coordinate columns anywhere.
  select count(*) into n from information_schema.columns
   where table_schema = 'nearby_private' and column_name ~ '(lat|lng|point|area|emirate)';
  if n <> 0 then raise exception 'nearby_private holds location columns'; end if;
  raise notice 'ok: inputs checked, points rounded, nothing about where the person is stored';
end $$;

-- Worldwide: a verified professional in London is found from London, not
-- from Abu Dhabi.
do $$
declare
  n int;
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000d4');
  insert into public.practice_locations (user_id, label, country_code, lat, lng)
  values ('16400000-0000-4000-8000-0000000000d4', '[London clinic]', 'GB', 51.5072, -0.1276);
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.nearby_professionals(51.51, -0.13, 10) where user_id = '16400000-0000-4000-8000-0000000000d4';
  if n <> 1 then raise exception 'a professional in London was not found from London (%)', n; end if;
  select count(*) into n from public.nearby_professionals(24.47, 54.37, 100) where label = '[London clinic]';
  if n <> 0 then raise exception 'a London location was found from Abu Dhabi'; end if;
  raise notice 'ok: worldwide locations and searches';
end $$;

-- Anonymous callers can't search.
do $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  begin
    perform * from public.nearby_professionals(24.47, 54.37, 25);
    raise exception 'an anonymous caller searched';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: signed-in users only';
end $$;

-- Rate limit: 30 searches a minute per user.
do $$
declare
  i int;
begin
  perform pg_temp.as_user('16400000-0000-4000-8000-0000000000a2');
  for i in 1..30 loop
    perform * from public.nearby_services(24.47, 54.37, 25);
  end loop;
  begin
    perform * from public.nearby_services(24.47, 54.37, 25);
    raise exception 'the 31st search in a minute was allowed';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
  raise notice 'ok: rate limited';
end $$;

rollback;
\o
select 'nearby: all checks passed' as result;
