# Nearby care: find the closest health professional

Feature spec. Status: **built; worldwide since migration `20261116000000_nearby_worldwide.sql`; waiting on a design review** (see [What was built](#what-was-built)). Read [PROJECT.md](../PROJECT.md) first; every rule below is checked against its section 3 guardrails.

- [What was built](#what-was-built)
- [Goal](#goal)
- [User flow](#user-flow)
- [Privacy rules for location](#privacy-rules-for-location)
- [Data model](#data-model)
- [Server functions](#server-functions)
- [Map and geocoding](#map-and-geocoding)
- [Screens and copy](#screens-and-copy)
- [Events](#events)
- [Tests](#tests)
- [Build checklist](#build-checklist)
- [Open items](#open-items)

## What was built

| Part | Where |
|---|---|
| Migration: `practice_locations` (owner-only RLS, max 5, `is_demo`), service map points, `nearby_professionals()`, `nearby_services()`, rate limit, `analytics_distance_to_care()` | [20261115000000_nearby_care.sql](../supabase/migrations/20261115000000_nearby_care.sql) |
| Migration: worldwide points, optional area and emirate, `country_code`, radius up to 100 km, method `place` counted | [20261116000000_nearby_worldwide.sql](../supabase/migrations/20261116000000_nearby_worldwide.sql) |
| Place and address search, worldwide, from our server (never logged) | [lib/nearby/geocode.ts](../lib/nearby/geocode.ts), [lib/nearby/places.ts](../lib/nearby/places.ts) |
| Page "Care near you" at `/dashboard/nearby`, linked from Care & services and the counsellor directory ("Find care near you") | [page.tsx](../app/[locale]/(app)/dashboard/nearby/page.tsx), [NearbyFinder.tsx](../components/nearby/NearbyFinder.tsx), [NearbyMap.tsx](../components/nearby/NearbyMap.tsx) |
| Server actions (search, events) | [actions.ts](../app/[locale]/(app)/dashboard/nearby/actions.ts), [lib/nearby/server.ts](../lib/nearby/server.ts) |
| Professionals add, edit, hide and remove locations in `/pro/settings` | [PracticeLocations.tsx](../app/[locale]/(pro)/pro/settings/PracticeLocations.tsx), [locationActions.ts](../app/[locale]/(pro)/pro/settings/locationActions.ts) |
| UAE areas as quick picks, with centre points | [config/uae-areas.ts](../config/uae-areas.ts) |
| Privacy page line "Your location: never stored" | `privacy.data.location` |
| "Distance to care" dashboard panel and CSV rows | [DistancePanel.tsx](../app/[locale]/(app)/admin/analytics/components/DistancePanel.tsx) |
| Copy (ar, en) | `messages/{locale}/nearby.json`, `verify.settings.locations`, `analytics.distance` |
| Tests | [geo.test.ts](../lib/nearby/geo.test.ts), [copy.test.ts](../lib/nearby/copy.test.ts), [supabase/tests/nearby.sql](../supabase/tests/nearby.sql), [tests/e2e/nearby.spec.ts](../tests/e2e/nearby.spec.ts) |

**Where the build differs from the plan below**

- **Its own page**, not a view inside the directory and Services pages: both link to it. The side menu is unchanged (the design has 11 fixed links).
- **Worldwide.** People search near their device location, a typed place anywhere in the world, or a UAE quick-pick area. Professionals find their address anywhere (or paste a "lat, lng" point). Radius options are 5, 10, 25, 50 and 100 km.
- **Geocoder:** OpenStreetMap's public Nominatim server by default (`GEOCODER_URL` to change it). Typed text goes from our server, not the person's browser, is cached for a day by its text only, and is never logged. Place results for patients are rounded to about 1 km; professional addresses keep about 10 m.
- **No facility columns.** Locations live on `practice_locations` only. Service points are placeholder city centres until the health authority directory is confirmed.
- **No saved area on the profile.** The person chooses each visit; nothing about where they are is kept, not even an area.
- **Events carry no emirate.** `nearby_location_method` holds the method, radius and a distance band only, so the dashboard shows bands overall, not by emirate. `booking_created` has no `from_nearby` flag yet; `nearby_result_opened` covers the funnel.
- **If nothing is within range**, the page offers "Search up to 50 km" and a link to every professional (video), rather than showing the nearest three automatically.
- **The emergency number** comes from `config/support-resources.ts`, which is still `[CONFIRM]`.
- **The rate limit** keeps a per-user call count in `nearby_private.search_rate` (no coordinates).

## Goal

Let a person see, on a map, the verified health professionals and care services closest to them (genetic counselling, screening, confirmatory testing, haematology and the other `services.kind` values), and go straight to messaging or booking one.

It extends what already exists rather than replacing it:

- the professional directory (`professional_directory()`, `/dashboard/counsellor`, see [counsellors.md](counsellors.md));
- the care & services directory (`public.services`, migration `20261106030000_services_directory.sql`);
- booking (`book_session()`) and messages (`/dashboard/messages`).

**Rubric:** 5 (safe linkage to services) and 6 (access and equity: time to referral, distance to care by area).

**Not in scope:** emergency care. This is not an emergency finder. Emergency triggers keep the existing behaviour (PROJECT.md section 8: tell the user to call emergency services now).

## User flow

1. On `/dashboard/counsellor` and the Services page, a new **"Near me"** view sits next to the list.
2. The person chooses how to set their location:
   - **Use my location** (browser Geolocation API, asked only after they tap the button, never on page load), or
   - **Choose an area** (emirate + area picker, or a typed place name). This is always offered, so nobody has to share precise location.
3. The map and a list beside it (stacked on mobile) show nearby verified professionals with an in-person practice, and nearby services, each with distance, languages, next free time (professionals) and kind (services).
4. Filters reuse the directory's: language, profession, specialty, available this week, women only, plus **distance** (5 / 10 / 25 / 50 km) and **video also fine** (adds video-only professionals below the nearby list, with no distance).
5. Tapping a professional opens their existing profile page, with **Message** and **Book** as today. Tapping a service shows its card (description, coverage, phone, directions link).
6. **Directions** opens the device's map app with the *destination only* (the facility address). GeneBridge never sends the person's own location to it.
7. If location is denied, unavailable or outside the UAE, the view falls back to "Choose an area" with a friendly message. If nothing is within range, show the nearest three anyway plus video options.

Flagged results: no change. The counsellor handoff screen (guardrail 4) can show a "Near me" link to find someone close, but never a risk number.

## Privacy rules for location

Location is personal data. These rules are part of the feature, not extras.

1. **Asked, never assumed.** Geolocation is requested only after a tap on "Use my location", with a one-line explanation first. No IP-based location.
2. **Coarse before it leaves the device.** The browser rounds coordinates to **2 decimal places (about 1 km)** before sending them to the server. Precise coordinates never leave the browser.
3. **Not stored.** The server uses the rounded point for one query and discards it. It is never written to a table, a log, an event, an email or an AI prompt. The person may optionally save a **chosen area** (emirate + area name, not coordinates) to their profile for next time; they can clear it in Privacy & consent.
4. **Not shared.** A professional never sees a patient's location or distance. Booking an in-person session shares nothing new.
5. **Not sent to AI.** Ask GeneBridge does not receive location. It may link to "Near me" when someone asks for a person (standard escalation).
6. **Aggregate analytics only.** Events record the emirate (when chosen or derived from the rounded point) and the distance band of the nearest result, never coordinates. Dashboard groups keep the minimum size of 10 (guardrail 11).
7. **Third-party map requests.** Map tiles reveal the visible area to the tile server. Use a provider with a no-tracking policy, load tiles only after the person opens the map, and say so in the Privacy page ("Map images are loaded from [MAP PROVIDER]"). Listed in Privacy & consent under "data stored vs never stored": *Your location: never stored.*

## Data model

Professional and facility locations are public business addresses, not personal data. Patients have no location column.

```sql
-- Facilities get an address and a point.
alter table public.facilities
  add column address_en text,
  add column address_ar text,
  add column emirate    text check (emirate in ('abu_dhabi','dubai','sharjah','ajman','umm_al_quwain','ras_al_khaimah','fujairah')),
  add column area       text,
  add column lat        double precision check (lat between 22 and 27),
  add column lng        double precision check (lng between 51 and 57);

-- Services (public.services) get the same columns.
alter table public.services
  add column address_en text, add column address_ar text,
  add column emirate text, add column lat double precision, add column lng double precision;

-- Where a professional sees patients in person. A professional can have several.
create table public.practice_locations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  facility_id      uuid references public.facilities(id),
  label            text check (char_length(label) <= 120),
  address_en       text, address_ar text,
  emirate          text not null,
  lat              double precision not null,
  lng              double precision not null,
  show_on_map      boolean not null default true,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Optional: a person's saved area (no coordinates).
alter table public.profiles
  add column preferred_emirate text,
  add column preferred_area    text;
```

- Distance: start with the haversine formula in SQL (no extension needed for a few hundred rows). Move to PostGIS (`geography(Point)` + GiST index) only if listings grow past a few thousand.
- **RLS:** `practice_locations` writable only by its owner; readable by everyone signed in **only** through `nearby_professionals()` (below), which filters to verified professionals. No direct select policy for other users.
- Seeded and placeholder rows keep `[BRACKETS]` names and set `is_demo = true` (guardrail 12, PROJECT.md section 10). `purge:demo` removes them.

## Server functions

```sql
-- Verified, accepting professionals with an in-person location near a point.
nearby_professionals(p_lat double precision, p_lng double precision,
                     p_radius_km int default 25, p_filters jsonb default '{}')
returns table (professional_id uuid, display_name text, profession text, specialties text[],
               languages text[], location_label text, emirate text, distance_km numeric,
               next_free_at timestamptz, lat double precision, lng double precision)

-- Services near a point, optionally by kind.
nearby_services(p_lat double precision, p_lng double precision,
                p_radius_km int default 25, p_kinds text[] default null)
```

- Both are `security definer`, `stable`, and call `is_verified_professional()` and check `accepting_patients` (guardrail 15). Suspended or expired professionals disappear at once.
- Inputs are validated: coordinates inside the UAE bounding box, already rounded (the function rounds again to 2 decimals so it never handles anything finer), radius ≤ 50 km, result limit 50.
- Returned `distance_km` is rounded to 0.5 km. Returned professional coordinates are the practice location, which is a public address.
- Area-only searches pass the centre point of the chosen area from a static table in `config/uae-areas.ts`, so they work with no geolocation at all.
- Sort: distance, then the directory's existing tie-breakers (language match, specialty match, soonest free time). The list is a directory, not a ranking: no "best", "top" or "recommended" labels (guardrail 1 spirit).
- Rate-limited per user (for example 30 calls a minute) so the function can't be used to map professionals' movements or scrape the directory.

## Map and geocoding

- **Map:** Leaflet (`react-leaflet`) in a client component loaded with `next/dynamic` and `ssr: false`, with tiles from `[MAP PROVIDER]` (decide in open items). Markers are lucide icons with text labels; colour is never the only signal.
- **Geocoding** (address to coordinates) happens **only for professional and facility addresses**, on save, on the server. Patients' typed place names are matched against `config/uae-areas.ts` locally first; a server geocoding call is the fallback and its input is never logged.
- **RTL and Arabic:** map controls placed with logical properties; labels from `next-intl`; addresses shown in the person's locale (`address_ar` / `address_en`).
- **Accessibility:** the list is the primary view and fully usable without the map. The map is `aria-hidden` for decoration-only layers; every marker has a matching list item with keyboard focus. Touch targets 44px.

## Screens and copy

There is **no design for this yet** in `design/`. CLAUDE.md says to build from the design, so a "Near me" screen (list + map, location prompt, empty and denied states) must be added to the design canvas and exported to `design/screens/` before building. Until then, proposed copy to review (en; ar to be written and reviewed):

| Key | Text |
|---|---|
| `nearby.title` | Care near you |
| `nearby.subtitle` | Verified professionals and services close to where you are. |
| `nearby.useLocation` | Use my location |
| `nearby.useLocationHelp` | We use your approximate location once to sort this list. We never store it or share it. |
| `nearby.chooseArea` | Choose an area instead |
| `nearby.denied` | No problem. Choose an area to see care near you. |
| `nearby.none` | No one within {km} km. Here are the closest, and professionals who meet by video. |
| `nearby.distance` | About {km} km away |
| `nearby.directions` | Directions |
| `nearby.notEmergency` | Not for emergencies. If someone is in danger, call {number}. (number from `config/support-resources.ts`) |
| `privacy.location` | Your location: never stored. |

Strings go in `messages/{locale}.json`; any patient-facing explanation longer than a label goes in `content/library/{locale}/`.

Add the view to the onboarding "done" step and the care tracker's "Book counselling" step as a secondary link.

## Events

- `nearby_opened` (props: `source` = directory | services | handoff | tracker)
- `nearby_location_method` (props: `method` = device | area | denied)
- `nearby_result_opened` (props: `type` = professional | service, `distance_band` = <5 | 5–10 | 10–25 | 25+ km)
- `booking_created` already exists; add `from_nearby: true` when it starts here.

Never: coordinates, area name for a single user, professional id together with distance.

Dashboard (`/admin/analytics`): a new "Distance to care" panel showing the share of searches whose nearest verified professional is within each band, by emirate, groups ≥ 10. This shows coverage gaps (rubric 6).

## Tests

- **Vitest:** coordinate rounding in the browser helper; haversine distance; area lookup; filter parsing; copy lint (no "best", "top", "recommended").
- **SQL (`npm run test:sql`):**
  - an unverified, suspended or expired professional never appears in `nearby_professionals()`;
  - a verified professional with `accepting_patients = false` never appears;
  - `show_on_map = false` hides the location;
  - other users can't `select` from `practice_locations` directly;
  - coordinates outside the UAE or a radius over 50 km are rejected;
  - nothing is written to any table during a search.
- **Playwright:** device location granted (mocked) shows sorted results; denied falls back to area; area-only search works with geolocation blocked; Arabic layout mirrors; Message and Book open the existing flows; no request to the server carries more than 2 decimal places.

## Build checklist

Done when:

- [ ] Design for "Care near you" added to `design/` and approved (built from the Services and Counsellor screens' patterns until then)
- [x] Migration adds service and practice locations, with RLS and `is_demo`
- [x] `/pro/settings` lets a professional add, edit, hide and remove practice locations (area + optional pasted point; geocoding waits on the provider)
- [x] `nearby_professionals()` and `nearby_services()` with verification gate, validation and rate limit
- [x] "Care near you" list + optional map, linked from the directory and Services pages, AR/EN, RTL, usable without the map
- [x] Location rounded on device, never stored, never logged, never sent to AI; Privacy page line added
- [x] Events and the "Distance to care" dashboard panel (groups ≥ 10)
- [x] Unit tests (`npx vitest run lib/nearby`) and SQL tests (`supabase/tests/nearby.sql`) pass
- [x] Migration applied to the hosted project; `npx playwright test tests/e2e/nearby.spec.ts` passes against it
- [x] `20261116000000_nearby_worldwide.sql` applied to the hosted project; all 4 browser tests pass, including "worldwide"
- [ ] `npm run test:sql` against the hosted project (needs `SUPABASE_DB_URL` in `.env.local`)

## Open items

- `[MAP PROVIDER]` for tiles and `[GEOCODER]` for place search (no-tracking policy, worldwide coverage, Arabic labels preferred)
- Real facility and service addresses: stay `[BRACKETS]` until the health authority directory is confirmed
- Whether in-person locations need admin review as part of verification (task 14) or are self-declared
- Default search radius by region (rural areas, such as Al Dhafra, need larger distances than cities)
- Arabic copy review for every string above
