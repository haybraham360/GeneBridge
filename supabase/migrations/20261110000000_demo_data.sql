-- Task 15, section 1: demo data is marked and removable.
--
-- Every seeded row has is_demo = true. GeneBridge works with real people, so
-- the demo personas (PROJECT.md section 10) must be removable in one step,
-- by `npm run purge:demo` or /admin/demo-data, without touching real
-- accounts or the synthetic analytics set (task 05, profiles.is_synthetic,
-- which keeps its own flag and clear script).
--
-- How rows get the flag:
--   - profiles.is_demo is set by the seed scripts (service role only).
--   - Every other table in demo_private.flagged_tables inherits it from its
--     owner on insert and update: a row belongs to the demo if the person it
--     belongs to does. So a booking Mariam makes during a demo is demo data
--     too. The owner columns are the ones that cascade when the account is
--     deleted, so the purge removes exactly what deleting the account would,
--     plus the rows that don't cascade (results, counsellor rows, bookings).
--   - The browser can never set or clear the flag. Only the service role (or
--     a migration) can set it directly, for rows with no owner yet, such as
--     unclaimed demo results.

create schema if not exists demo_private;
revoke all on schema demo_private from public, anon, authenticated;
alter default privileges in schema demo_private
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Which tables carry the flag, who owns each row, and the delete order
-- ---------------------------------------------------------------------------
-- owners: each entry is either a column holding a user id ('user_id'), or a
-- column referencing another flagged table's id ('request_id>counsellor_requests').
-- purge_order: children first, so nothing is blocked by a foreign key.
create table demo_private.flagged_tables (
  table_name  text primary key,
  owners      text[] not null,
  purge_order smallint not null unique
);

insert into demo_private.flagged_tables (table_name, owners, purge_order) values
  ('pro_messages',              array['sender_id', 'conversation_id>pro_conversations'], 10),
  ('pro_conversations',         array['patient_id', 'professional_id'],                  20),
  ('notifications',             array['user_id'],                                        30),
  ('access_log',                array['resource_owner_id'],                              40),
  ('access_requests',           array['owner_id', 'request_id>counsellor_requests'],     50),
  ('session_notes',             array['request_id>counsellor_requests'],                 60),
  ('share_grants',              array['owner_id', 'grantee_id'],                         70),
  ('referrals',                 array['user_id'],                                        80),
  ('bookings',                  array['request_id>counsellor_requests', 'counsellor_id>counsellors'], 90),
  ('counsellor_requests',       array['user_id'],                                       100),
  ('values_answers',            array['user_id'],                                       110),
  ('counselling_prep',          array['user_id'],                                       120),
  ('family_member_conditions',  array['owner_id'],                                      130),
  ('family_links',              array['owner_id'],                                      140),
  ('family_members',            array['owner_id'],                                      150),
  ('notice_sends',              array['sender_id'],                                     160),
  ('family_notifications',      array['sender_id'],                                     170),
  ('followed_conditions',       array['user_id'],                                       180),
  ('wellbeing_checkins',        array['user_id'],                                       190),
  ('talk_drafts',               array['user_id'],                                       200),
  ('assistant_messages',        array['user_id'],                                       210),
  ('assistant_conversations',   array['user_id'],                                       220),
  ('couple_links',              array['inviter_id', 'invitee_id'],                      230),
  ('consents',                  array['user_id'],                                       240),
  ('events',                    array['user_id'],                                       250),
  ('screening_results',         array['owner_id'],                                      260),
  ('verification_submissions',  array['user_id'],                                       270),
  ('professional_availability', array['user_id'],                                       280),
  ('professional_profiles',     array['user_id'],                                       290),
  ('counsellors',               array['user_id'],                                       300);

revoke all on demo_private.flagged_tables from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The column
-- ---------------------------------------------------------------------------
alter table public.profiles add column is_demo boolean not null default false;
create index profiles_demo_idx on public.profiles (user_id) where is_demo;

do $$
declare
  t text;
begin
  for t in select table_name from demo_private.flagged_tables loop
    execute format('alter table public.%I add column is_demo boolean not null default false', t);
    execute format('create index %I on public.%I (is_demo) where is_demo', t || '_demo_idx', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Inheriting the flag
-- ---------------------------------------------------------------------------
-- The service role, or a session with no signed-in user (psql, migrations).
-- auth.role() is the caller's JWT role, so it stays 'authenticated' inside
-- security definer functions called from the browser.
create function demo_private.privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') in ('service_role', '')
$$;

create function demo_private.user_is_demo(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_demo from public.profiles p where p.user_id = uid), false)
$$;

-- Whether any owner of this row is demo.
create function demo_private.row_owner_is_demo(p_row jsonb, p_owners text[])
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner text;
  col   text;
  ref   text;
  val   text;
  flag  boolean;
begin
  foreach owner in array p_owners loop
    col := split_part(owner, '>', 1);
    ref := nullif(split_part(owner, '>', 2), '');
    val := p_row ->> col;
    continue when val is null;
    if ref is null then
      flag := demo_private.user_is_demo(val::uuid);
    else
      execute format('select is_demo from public.%I where id = $1', ref) into flag using val::uuid;
    end if;
    if coalesce(flag, false) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

-- Trigger arguments are the owner entries for the table.
create function demo_private.inherit_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owners text[] := tg_argv;
  inherited boolean := demo_private.row_owner_is_demo(to_jsonb(new), owners);
begin
  if tg_op = 'INSERT' then
    new.is_demo := inherited or (demo_private.privileged() and new.is_demo);
  elsif demo_private.privileged() then
    new.is_demo := new.is_demo or inherited;
  else
    -- Signed-in users can neither set nor clear it.
    new.is_demo := old.is_demo or inherited;
  end if;
  return new;
end;
$$;

do $$
declare
  r record;
  args text;
begin
  for r in select table_name, owners from demo_private.flagged_tables loop
    select string_agg(quote_literal(o), ', ') into args from unnest(r.owners) o;
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function demo_private.inherit_flag(%s)',
      r.table_name || '_demo_flag', r.table_name, args);
  end loop;
end;
$$;

-- profiles: only the service role changes is_demo (the column isn't granted
-- to signed-in users either; this holds even if the grant is loosened).
create function public.profiles_demo_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_demo is distinct from old.is_demo and not demo_private.privileged() then
    new.is_demo := old.is_demo;
  end if;
  return new;
end;
$$;

-- The guard runs as the caller, so signed-in users need to reach privileged().
grant usage on schema demo_private to authenticated;
grant execute on function demo_private.privileged() to authenticated;

create trigger profiles_demo_guard
  before update on public.profiles
  for each row execute function public.profiles_demo_guard();

-- ---------------------------------------------------------------------------
-- 4. Mark what is already there
-- ---------------------------------------------------------------------------
-- Demo personas and test accounts use @demo.genebridge.app (lib/auth/demoUsers.ts).
-- Synthetic analytics accounts (@synthetic.genebridge.invalid) are not demo.
update public.profiles p
   set is_demo = true
  from auth.users u
 where u.id = p.user_id
   and u.email like '%@demo.genebridge.app'
   and not p.is_synthetic;

-- The demo screening reports, claimed or not (lib/onboarding/demoResults.ts).
update public.screening_results
   set is_demo = true
 where reference_code in ('AD-PMS-2026-048213', 'AD-PMS-2026-048214', 'AD-PMS-2026-048215');

-- Everything owned by them, parents before children (reverse purge order).
do $$
declare
  r     record;
  owner text;
  conds text[];
begin
  for r in select table_name, owners from demo_private.flagged_tables order by purge_order desc loop
    conds := '{}';
    foreach owner in array r.owners loop
      if position('>' in owner) > 0 then
        conds := conds || format('%I in (select id from public.%I where is_demo)',
                                 split_part(owner, '>', 1), split_part(owner, '>', 2));
      else
        conds := conds || format('%I in (select user_id from public.profiles where is_demo)', owner);
      end if;
    end loop;
    execute format('update public.%I set is_demo = true where not is_demo and (%s)',
                   r.table_name, array_to_string(conds, ' or '));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Audit of every removal (append-only, no foreign keys so it outlives
--    the accounts it describes)
-- ---------------------------------------------------------------------------
create table public.demo_purge_audit (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid,
  via             text not null check (via in ('script', 'admin_page')),
  scope           text not null check (scope in ('all', 'account')),
  action          text not null check (action in ('rows_deleted', 'accounts_deleted')),
  subject_user_id uuid,
  counts          jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

alter table public.demo_purge_audit enable row level security;
revoke all on public.demo_purge_audit from anon, authenticated;

create function public.demo_purge_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'demo_purge_audit is append-only' using errcode = '42501';
end;
$$;

create trigger demo_purge_audit_append_only
  before update or delete on public.demo_purge_audit
  for each row execute function public.demo_purge_audit_append_only();

-- ---------------------------------------------------------------------------
-- 6. Admin and script functions
-- ---------------------------------------------------------------------------
-- The service role (the purge script) or a signed-in admin (/admin/demo-data).
create function demo_private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return;
  end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') then
    raise exception 'admin only' using errcode = '42501';
  end if;
end;
$$;

-- SQL condition: rows of p_table that belong to p_user, following references
-- to other flagged tables (bookings → counsellors → the professional).
create function demo_private.linked_condition(p_table text, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owners text[];
  owner  text;
  conds  text[] := '{}';
begin
  select f.owners into owners from demo_private.flagged_tables f where f.table_name = p_table;
  foreach owner in array owners loop
    if position('>' in owner) > 0 then
      conds := conds || format('%I in (select id from public.%I where %s)',
                               split_part(owner, '>', 1), split_part(owner, '>', 2),
                               demo_private.linked_condition(split_part(owner, '>', 2), p_user));
    else
      conds := conds || format('%I = %L::uuid', owner, p_user);
    end if;
  end loop;
  return '(' || array_to_string(conds, ' or ') || ')';
end;
$$;

-- Counts of demo rows per table, plus demo accounts. For the admin page and
-- the purge summary.
create function public.demo_admin_counts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t      text;
  n      bigint;
  result jsonb;
begin
  perform demo_private.require_admin();
  select jsonb_build_object('accounts', count(*)) into result from public.profiles where is_demo;
  for t in select table_name from demo_private.flagged_tables order by purge_order loop
    execute format('select count(*) from public.%I where is_demo', t) into n;
    result := result || jsonb_build_object(t, n);
  end loop;
  return result;
end;
$$;

-- The demo accounts, for removing one at a time.
create function public.demo_admin_accounts()
returns table (user_id uuid, display_name text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  return query
    select p.user_id, p.display_name, p.role, p.created_at
      from public.profiles p
     where p.is_demo
     order by p.role, p.display_name;
end;
$$;

-- Deletes every demo row (all of them, or only those linked to one demo
-- account) and audits it. Accounts, their profiles and storage files are
-- removed afterwards by the caller with the service role (lib/demo/purge.ts),
-- which audits that too. Returns rows deleted per table.
create function demo_private.purge_rows(p_user uuid, p_via text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t      text;
  n      bigint;
  result jsonb := '{}';
  cond   text;
begin
  for t in select table_name from demo_private.flagged_tables order by purge_order loop
    cond := 'is_demo';
    if p_user is not null then
      cond := cond || ' and ' || demo_private.linked_condition(t, p_user);
    end if;
    execute format('delete from public.%I where %s', t, cond);
    get diagnostics n = row_count;
    if n > 0 then
      result := result || jsonb_build_object(t, n);
    end if;
  end loop;

  insert into public.demo_purge_audit (actor_id, via, scope, action, subject_user_id, counts)
  values (auth.uid(), p_via, case when p_user is null then 'all' else 'account' end, 'rows_deleted', p_user, result);
  return result;
end;
$$;

create function public.demo_admin_purge_all(p_via text default 'admin_page')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  if p_via not in ('script', 'admin_page') then
    raise exception 'invalid via' using errcode = '22023';
  end if;
  return demo_private.purge_rows(null, p_via);
end;
$$;

create function public.demo_admin_purge_account(p_user uuid, p_via text default 'admin_page')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  if p_via not in ('script', 'admin_page') then
    raise exception 'invalid via' using errcode = '22023';
  end if;
  -- Never a real account.
  if not demo_private.user_is_demo(p_user) then
    raise exception 'not a demo account' using errcode = '22023';
  end if;
  return demo_private.purge_rows(p_user, p_via);
end;
$$;

-- The second half of the audit: accounts and files removed.
create function public.demo_admin_record_accounts_deleted(
  p_scope text, p_subject uuid, p_counts jsonb, p_via text default 'admin_page')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  if p_scope not in ('all', 'account') or p_via not in ('script', 'admin_page') then
    raise exception 'invalid input' using errcode = '22023';
  end if;
  insert into public.demo_purge_audit (actor_id, via, scope, action, subject_user_id, counts)
  values (auth.uid(), p_via, p_scope, 'accounts_deleted', p_subject, coalesce(p_counts, '{}'));
end;
$$;

-- Whether any synthetic analytics data exists. With demo mode off, the
-- "Synthetic demo data" label shows only while it does (guardrail 12).
create function public.synthetic_data_present()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where is_synthetic)
$$;

revoke all on function public.demo_admin_counts() from public, anon;
revoke all on function public.demo_admin_accounts() from public, anon;
revoke all on function public.demo_admin_purge_all(text) from public, anon;
revoke all on function public.demo_admin_purge_account(uuid, text) from public, anon;
revoke all on function public.demo_admin_record_accounts_deleted(text, uuid, jsonb, text) from public, anon;
revoke all on function public.synthetic_data_present() from public, anon;
revoke all on function public.profiles_demo_guard() from public, anon, authenticated;
revoke all on function public.demo_purge_audit_append_only() from public, anon, authenticated;

grant execute on function public.demo_admin_counts() to authenticated, service_role;
grant execute on function public.demo_admin_accounts() to authenticated, service_role;
grant execute on function public.demo_admin_purge_all(text) to authenticated, service_role;
grant execute on function public.demo_admin_purge_account(uuid, text) to authenticated, service_role;
grant execute on function public.demo_admin_record_accounts_deleted(text, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.synthetic_data_present() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Privacy & consent on real data (no more hard-coded demo rows)
-- ---------------------------------------------------------------------------
-- The caller's share grants, live and revoked, with the grantee's name. The
-- live ones are "Who can see my result"; all of them feed the consent history.
create function public.my_share_grants()
returns table (
  id uuid, grantee_id uuid, grantee_name text, grantee_role text,
  resource text, level text, granted_at timestamptz, revoked_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.grantee_id,
         coalesce(nullif(pp.display_name, ''), c.name, split_part(coalesce(p.display_name, ''), ' ', 1)),
         case when p.role = 'professional' then 'professional' else 'partner' end,
         g.resource, g.level, g.granted_at, g.revoked_at
    from public.share_grants g
    left join public.profiles p on p.user_id = g.grantee_id
    left join public.professional_profiles pp on pp.user_id = g.grantee_id
    left join public.counsellors c on c.user_id = g.grantee_id
   where g.owner_id = auth.uid()
   order by g.granted_at desc
   limit 200
$$;

revoke all on function public.my_share_grants() from public, anon;
grant execute on function public.my_share_grants() to authenticated;
