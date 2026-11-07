-- Task 15, section 1 fix: the server (service role) can update profiles again.
--
-- profiles_demo_guard runs as the caller and called demo_private.privileged(),
-- but only signed-in users had USAGE on demo_private. Supabase's service role
-- doesn't bypass schema privileges, so every server-side profile update
-- failed with "permission denied for schema demo_private" (seed:auth, the
-- purge tests, admin approvals).
--
-- The guard now checks the role inline and touches no other schema, and the
-- service role can reach demo_private like signed-in users can.

create or replace function public.profiles_demo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo
     and coalesce(auth.role(), '') not in ('service_role', '') then
    new.is_demo := old.is_demo;
  end if;
  return new;
end;
$$;

grant usage on schema demo_private to service_role;
grant execute on function demo_private.privileged() to service_role;
