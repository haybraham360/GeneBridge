-- Task 03 (M2): auth tables, profile trigger and row-level security.
-- Tables from PROJECT.md section 7. Others arrive in later tasks.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users (id) on delete cascade,
  display_name    text,
  locale          text not null default 'ar' check (locale in ('ar', 'en')),
  learning_mode   text check (learning_mode in ('read', 'listen')),
  reason          text,
  onboarding_step smallint not null default 0 check (onboarding_step between 0 and 8),
  role            text not null default 'individual'
                  check (role in ('individual', 'counsellor', 'analyst')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No insert or delete policy: rows are created by the trigger below and
-- removed with the auth user.

-- Users may update only these columns. `role`, `user_id` and timestamps are
-- not grantable, so `update profiles set role = ...` fails with
-- "permission denied" before any policy runs.
revoke insert, update, delete on public.profiles from anon, authenticated;
revoke select on public.profiles from anon;
grant select on public.profiles to authenticated;
grant update (display_name, locale, learning_mode, reason, onboarding_step)
  on public.profiles to authenticated;

-- Belt and braces: block role changes from any non-service session, even if
-- the column grant is loosened by mistake later.
create function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'role cannot be changed' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- New auth user → profile row. Locale comes from sign-up metadata, which the
-- auth page sets from the page's locale.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_locale text := new.raw_user_meta_data ->> 'locale';
begin
  insert into public.profiles (user_id, display_name, locale, role, onboarding_step)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    case when chosen_locale in ('ar', 'en') then chosen_locale else 'ar' end,
    'individual',
    0
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- consents
-- ---------------------------------------------------------------------------
create table public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('terms', 'couple_view', 'compare_values')),
  scope      text,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index consents_user_kind_idx on public.consents (user_id, kind);

alter table public.consents enable row level security;

create policy "consents: read own"
  on public.consents for select to authenticated
  using (user_id = (select auth.uid()));

create policy "consents: insert own"
  on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()) and revoked_at is null);

-- Revoking arrives with the privacy task (M5).
revoke all on public.consents from anon;
revoke update, delete on public.consents from authenticated;
grant select, insert on public.consents to authenticated;

-- ---------------------------------------------------------------------------
-- counsellors
-- ---------------------------------------------------------------------------
create table public.counsellors (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users (id) on delete set null,
  name          text not null,
  languages     text[] not null default '{}',
  facility_code text not null unique
);

alter table public.counsellors enable row level security;

create policy "counsellors: signed-in users can list"
  on public.counsellors for select to authenticated
  using (true);

-- Facility codes are never readable from the browser; they are checked
-- server-side with the service role.
revoke all on public.counsellors from anon, authenticated;
grant select (id, name, languages) on public.counsellors to authenticated;

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_name_created_idx on public.events (name, created_at);

alter table public.events enable row level security;

-- Write-only for users: analytics read aggregates server-side (M8).
create policy "events: insert own"
  on public.events for insert to authenticated
  with check (user_id = (select auth.uid()));

revoke all on public.events from anon, authenticated;
grant insert on public.events to authenticated;
