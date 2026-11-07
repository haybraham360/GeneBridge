-- Task 15, section 5: calendar connections. Run with `npm run test:sql`.
-- Rolls back; leaves nothing behind.
--
-- The owner sees that they're connected (and which Google account); nobody
-- signed in, not even the owner, can read the refresh token, and nobody
-- else can see the connection at all.

\set ON_ERROR_STOP on
\o /dev/null
begin;

insert into auth.users (id) values
  ('15500000-0000-4000-8000-0000000000d1'),
  ('15500000-0000-4000-8000-0000000000d2'),
  ('15500000-0000-4000-8000-0000000000a1');
update public.profiles set role = 'professional'
 where user_id in ('15500000-0000-4000-8000-0000000000d1', '15500000-0000-4000-8000-0000000000d2');
insert into public.professional_profiles (user_id, display_name) values
  ('15500000-0000-4000-8000-0000000000d1', 'Pro One'),
  ('15500000-0000-4000-8000-0000000000d2', 'Pro Two');
insert into public.calendar_connections (user_id, encrypted_refresh_token, google_email)
values ('15500000-0000-4000-8000-0000000000d1', 'R0JDMQ-encrypted', 'pro.one@example.test');

create function pg_temp.as_user(id text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', id, 'role', 'authenticated')::text, true);
end $$;

do $$
declare
  ok boolean;
  n int;
  email text;
begin
  -- The owner: connection and email yes, token never.
  perform pg_temp.as_user('15500000-0000-4000-8000-0000000000d1');
  select google_email into email from public.calendar_connections;
  if email is distinct from 'pro.one@example.test' then raise exception 'the owner can''t see their connection'; end if;
  ok := false;
  begin
    perform encrypted_refresh_token from public.calendar_connections;
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'the refresh token is readable by a signed-in user'; end if;
  -- Nor can they write one (only the server does).
  ok := false;
  begin
    insert into public.calendar_connections (user_id, encrypted_refresh_token) values ('15500000-0000-4000-8000-0000000000d1', 'x');
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'a signed-in user can write a connection'; end if;

  -- Another professional and a patient see nothing.
  foreach email in array array['15500000-0000-4000-8000-0000000000d2', '15500000-0000-4000-8000-0000000000a1'] loop
    perform pg_temp.as_user(email);
    select count(*) into n from public.calendar_connections;
    if n <> 0 then raise exception '% sees another person''s calendar connection', email; end if;
  end loop;
  raise notice 'ok: calendar connections are owner-only and the token never reaches the browser';
end $$;

rollback;
\o
select 'calendar: all checks passed' as result;
