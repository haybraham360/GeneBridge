-- Nearby care (docs/nearby-care.md): verified professionals and services
-- near a point.
--
-- Privacy (the spec's "Privacy rules for location"):
--   - Patients have no location column. The point a search sends is rounded
--     to 2 decimals (about 1 km) in the browser, rounded again here, used for
--     one query and never written anywhere.
--   - Professional practice locations and service addresses are public
--     business addresses, not personal data.
--   - Only bookable professionals (verified, licence in date, accepting
--     patients) are returned (guardrail 15). Other users can't read
--     practice_locations directly.
--   - A per-user call counter (no coordinates) stops the functions being
--     used to scrape the directory.

create schema if not exists nearby_private;
revoke all on schema nearby_private from public, anon, authenticated;
alter default privileges in schema nearby_private
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Where professionals see patients in person
-- ---------------------------------------------------------------------------
create table public.practice_locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 120),
  address_en  text check (char_length(address_en) <= 240),
  address_ar  text check (char_length(address_ar) <= 240),
  area_id     text not null check (area_id ~ '^[a-z0-9_]{2,40}$'),
  emirate     text not null check (emirate in ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
  lat         double precision not null check (lat between 22 and 27),
  lng         double precision not null check (lng between 51 and 57),
  show_on_map boolean not null default true,
  created_at  timestamptz not null default now()
);

create index practice_locations_user_idx on public.practice_locations (user_id);

alter table public.practice_locations enable row level security;
revoke all on public.practice_locations from anon, authenticated;
grant select, insert, update, delete on public.practice_locations to authenticated;

create function nearby_private.is_professional()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.role = 'professional')
$$;
grant usage on schema nearby_private to authenticated;
grant execute on function nearby_private.is_professional() to authenticated;

-- Owner only. Everyone else reaches locations through nearby_professionals().
create policy "practice_locations: owner reads"
  on public.practice_locations for select to authenticated using (user_id = auth.uid());
create policy "practice_locations: professional adds own"
  on public.practice_locations for insert to authenticated
  with check (user_id = auth.uid() and nearby_private.is_professional());
create policy "practice_locations: owner changes"
  on public.practice_locations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "practice_locations: owner removes"
  on public.practice_locations for delete to authenticated using (user_id = auth.uid());

-- At most 5 locations each.
create function nearby_private.location_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.practice_locations l where l.user_id = new.user_id) >= 5 then
    raise exception 'too_many_locations' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger practice_locations_limit
  before insert on public.practice_locations
  for each row execute function nearby_private.location_limit();

-- Demo data: inherits is_demo from its owner and is purged with them.
alter table public.practice_locations add column is_demo boolean not null default false;
create index practice_locations_demo_idx on public.practice_locations (is_demo) where is_demo;
insert into demo_private.flagged_tables (table_name, owners, purge_order)
values ('practice_locations', array['user_id'], 286);
create trigger practice_locations_demo_flag
  before insert or update on public.practice_locations
  for each row execute function demo_private.inherit_flag('user_id');

-- ---------------------------------------------------------------------------
-- 2. Service addresses (public listings, placeholders until confirmed)
-- ---------------------------------------------------------------------------
alter table public.services
  add column address_en text,
  add column address_ar text,
  add column emirate    text check (emirate in ('abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah')),
  add column lat        double precision check (lat between 22 and 27),
  add column lng        double precision check (lng between 51 and 57);

-- Placeholder points at city centres (guardrail 12): the real addresses come
-- with the health authority directory. Online-only listings stay off the map.
update public.services set emirate = 'abu_dhabi', lat = 24.47, lng = 54.37
 where area like '%Abu Dhabi' and lat is null;
update public.services set emirate = 'abu_dhabi', lat = 24.21, lng = 55.74
 where area like '%Al Ain' and lat is null;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in km.
create function nearby_private.km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Rate limit: 30 searches a minute per user. Holds a count, never a point.
create table nearby_private.search_rate (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null,
  calls        int not null
);

-- Checks the caller and the input; returns the rounded point.
create function nearby_private.check_search(p_lat double precision, p_lng double precision, p_radius_km int,
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
  if p_lat is null or p_lng is null or p_lat not between 22 and 27 or p_lng not between 51 and 57 then
    raise exception 'outside_uae' using errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km not between 1 and 50 then
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
-- 4. The searches
-- ---------------------------------------------------------------------------
-- Bookable professionals with an in-person location within the radius: each
-- professional once, at their closest location. Distance rounded to 0.5 km.
create function public.nearby_professionals(p_lat double precision, p_lng double precision, p_radius_km int default 25)
returns table (
  user_id     uuid,
  location_id uuid,
  label       text,
  address_en  text,
  address_ar  text,
  area_id     text,
  emirate     text,
  lat         double precision,
  lng         double precision,
  distance_km numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pt record;
begin
  select * into pt from nearby_private.check_search(p_lat, p_lng, p_radius_km);
  return query
    select * from (
      select distinct on (l.user_id)
             l.user_id, l.id, l.label, l.address_en, l.address_ar, l.area_id, l.emirate, l.lat, l.lng,
             round((nearby_private.km(pt.lat, pt.lng, l.lat, l.lng) * 2)::numeric) / 2 as distance_km
        from public.practice_locations l
       where l.show_on_map
         and public.is_bookable_professional(l.user_id)
         and nearby_private.km(pt.lat, pt.lng, l.lat, l.lng) <= p_radius_km
       order by l.user_id, nearby_private.km(pt.lat, pt.lng, l.lat, l.lng)
    ) nearest
    order by nearest.distance_km
    limit 50;
end;
$$;

-- Services with a map point within the radius, optionally by kind.
create function public.nearby_services(p_lat double precision, p_lng double precision, p_radius_km int default 25,
                                       p_kinds text[] default null)
returns table (
  name           text,
  kind           text,
  area           text,
  languages      text[],
  description_en text,
  description_ar text,
  coverage       text,
  women_only     boolean,
  phone          text,
  address_en     text,
  address_ar     text,
  emirate        text,
  lat            double precision,
  lng            double precision,
  distance_km    numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pt record;
begin
  select * into pt from nearby_private.check_search(p_lat, p_lng, p_radius_km);
  return query
    select s.name, s.kind, s.area, s.languages, s.description_en, s.description_ar, s.coverage, s.women_only,
           s.phone, s.address_en, s.address_ar, s.emirate, s.lat, s.lng,
           round((nearby_private.km(pt.lat, pt.lng, s.lat, s.lng) * 2)::numeric) / 2
      from public.services s
     where s.lat is not null and s.lng is not null
       and (p_kinds is null or s.kind = any (p_kinds))
       and nearby_private.km(pt.lat, pt.lng, s.lat, s.lng) <= p_radius_km
     order by 15, s.sort
     limit 50;
end;
$$;

revoke all on function public.nearby_professionals(double precision, double precision, int) from public, anon;
revoke all on function public.nearby_services(double precision, double precision, int, text[]) from public, anon;
grant execute on function public.nearby_professionals(double precision, double precision, int) to authenticated;
grant execute on function public.nearby_services(double precision, double precision, int, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Dashboard: distance to care (rubric 6)
-- ---------------------------------------------------------------------------
-- From nearby_location_method events, which hold the method, the search
-- radius and a distance band for the nearest verified professional found,
-- never a point or an area. Each band is hidden when fewer than 10 people
-- are in it (analytics_private.k).
create function public.analytics_distance_to_care(p_days integer, p_centre text default null)
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
         and e.props ->> 'method' in ('device', 'area')
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

revoke all on function public.analytics_distance_to_care(integer, text) from public, anon;
grant execute on function public.analytics_distance_to_care(integer, text) to authenticated;
