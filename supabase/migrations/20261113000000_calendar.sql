-- Task 15, section 5: each professional connects their own Google Calendar,
-- so confirmed bookings get a Google Meet link.
--
-- The refresh token is encrypted by the server (AES-256-GCM,
-- CALENDAR_TOKEN_KEY) before it is stored, and the column is never granted
-- to signed-in users: the owner can see that they're connected and with
-- which Google account, never the token. Only the server (service role)
-- writes or reads it. Guardrail 18: events say "GeneBridge session" and
-- carry only a link back to GeneBridge.

create table public.calendar_connections (
  user_id                 uuid primary key references public.professional_profiles (user_id) on delete cascade,
  provider                text not null default 'google' check (provider = 'google'),
  encrypted_refresh_token text not null check (char_length(encrypted_refresh_token) <= 4096),
  google_email            text check (char_length(google_email) <= 320),
  connected_at            timestamptz not null default now(),
  is_demo                 boolean not null default false
);

alter table public.calendar_connections enable row level security;

create policy "calendar_connections: owner reads own"
  on public.calendar_connections for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.calendar_connections from anon, authenticated;
-- Every column except the token.
grant select (user_id, provider, google_email, connected_at) on public.calendar_connections to authenticated;

insert into demo_private.flagged_tables (table_name, owners, purge_order) values ('calendar_connections', array['user_id'], 287);
create trigger calendar_connections_demo_flag before insert or update on public.calendar_connections
  for each row execute function demo_private.inherit_flag('user_id');
