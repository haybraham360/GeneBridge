-- Nearby care works worldwide, not only in the UAE (follow-up to
-- 20261115000000_nearby_care.sql).
--
--   - Practice locations and service points may be anywhere: the UAE-only
--     coordinate, emirate and area checks are dropped, area_id and emirate
--     become optional, and a country code is added.
--   - Searches accept any valid point and a radius up to 100 km.
--   - "Choose an area" also accepts a searched place, so the dashboard counts
--     method 'place' too.
-- The privacy rules are unchanged: the search point is rounded to 2 decimals,
-- used once and never stored. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Drop the UAE-only checks, whatever their generated names
-- ---------------------------------------------------------------------------
do $$
declare
  c record;
begin
  for c in
    select t.relname, k.conname
      from pg_constraint k
      join pg_class t on t.oid = k.conrelid
     where t.relnamespace = 'public'::regnamespace
       and t.relname in ('practice_locations', 'services')
       and k.contype = 'c'
       and (pg_get_constraintdef(k.oid) ~ '\m(lat|lng|emirate|area_id|country_code)\M')
  loop
    execute format('alter table public.%I drop constraint %I', c.relname, c.conname);
  end loop;
end;
$$;

alter table public.practice_locations
  alter column area_id drop not null,
  alter column emirate drop not null,
  add column if not exists country_code text;

alter table public.services add column if not exists country_code text;
update public.services set country_code = 'AE' where emirate is not null and country_code is null;
update public.practice_locations set country_code = 'AE' where emirate is not null and country_code is null;

-- Worldwide checks, added once.
alter table public.practice_locations
  add constraint practice_locations_point_check check (lat between -90 and 90 and lng between -180 and 180),
  add constraint practice_locations_area_id_check check (area_id is null or area_id ~ '^[a-z0-9_]{2,40}$'),
  add constraint practice_locations_emirate_check check (emirate is null or emirate in ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
  add constraint practice_locations_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$');
alter table public.services
  add constraint services_point_check check ((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180)),
  add constraint services_emirate_check check (emirate is null or emirate in ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
  add constraint services_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$');

-- ---------------------------------------------------------------------------
-- 2. Searches: any valid point, radius 1 to 100 km
-- ---------------------------------------------------------------------------
create or replace function nearby_private.check_search(p_lat double precision, p_lng double precision, p_radius_km int,
                                                       out lat double precision, out lng double precision)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  n  int;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'bad_point' using errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km not between 1 and 100 then
    raise exception 'bad_radius' using errcode = '22023';
  end if;

  insert into nearby_private.search_rate as r (user_id, window_start, calls)
  values (me, now(), 1)
  on conflict (user_id) do update
    set calls = case when r.window_start < now() - interval '1 minute' then 1 else r.calls + 1 end,
        window_start = case when r.window_start < now() - interval '1 minute' then now() else r.window_start end
  returning calls into n;
  if n > 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  -- Never handle anything finer than about 1 km.
  lat := round(p_lat::numeric, 2)::double precision;
  lng := round(p_lng::numeric, 2)::double precision;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Dashboard: count searched places too
-- ---------------------------------------------------------------------------
create or replace function public.analytics_distance_to_care(p_days integer, p_centre text default null)
returns table (band text, searches integer, people integer)
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
    with c as (
      select user_id from analytics_private.cohort(null, now_at, p_centre)
    ),
    s as (
      select e.user_id, e.props ->> 'nearest_band' as b
        from public.events e
        join c on c.user_id = e.user_id
       where e.name = 'nearby_location_method'
         and e.props ->> 'method' in ('device', 'area', 'place')
         and (w_from is null or e.created_at >= w_from)
         and e.created_at < now_at
    ),
    bands (b, ord) as (
      values ('lt5', 1), ('5to10', 2), ('10to25', 3), ('25plus', 4), ('none', 5)
    )
    select bands.b,
           analytics_private.k(count(distinct s.user_id), count(s.user_id))::integer,
           analytics_private.k(count(distinct s.user_id), count(distinct s.user_id))::integer
      from bands
      left join s on s.b = bands.b
     group by bands.b, bands.ord
     order by bands.ord;
end;
$$;
