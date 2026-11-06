-- Task 13: "Describe your family" and the family map tables.
--
-- Rubric 4 (privacy-preserving family workflows). Guardrail 8: the family
-- map is private and self-reported.
--   - Owner-only row-level security on all three tables. A counsellor sees
--     a tree only through an unrevoked share_grants row on 'family_map'.
--     A partner sees nothing through the couple link.
--   - Labels are the owner's own words for a relative (a name or "Uncle").
--     They are never sent to the AI: the describe pipeline masks names in
--     the browser and works on a tree without labels.
--   - Only what the owner keeps is saved; AI proposals stay in the browser.
--   - At most 60 people per tree, enforced here as well as in the app.
--   - Describe turns are rate-limited (30 an hour) from the owner's own
--     family_describe_started events, which carry no text.

-- ---------------------------------------------------------------------------
-- An earlier family_members shape (PROJECT.md section 7: parent_ids[],
-- partner_id, condition_status) is moved aside and copied in below. The
-- first family map kept its data in the browser, so most databases have
-- nothing to move.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'family_members' and column_name = 'parent_ids'
  ) then
    alter table public.family_members rename to family_members_legacy;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table public.family_members (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label             text check (label is null or char_length(label) between 1 and 60),
  relation_to_owner text not null check (relation_to_owner ~ '^[a-z_]{2,24}$'),
  side              text not null default 'none' check (side in ('paternal', 'maternal', 'none')),
  -- Needed later for X-linked patterns. Asked only when it matters; never assumed from a name.
  sex               text not null default 'unknown' check (sex in ('female', 'male', 'unknown')),
  generation        integer not null default 0 check (generation between -6 and 6),
  deceased          boolean not null default false,
  created_by        text not null default 'manual' check (created_by in ('manual', 'ai')),
  is_owner          boolean not null default false,
  -- An "unknown" connector added only so the tree can be drawn.
  placeholder       boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint family_members_id_owner unique (id, owner_id),
  constraint family_members_owner_shape check (not is_owner or (relation_to_owner = 'self' and generation = 0 and not placeholder))
);

-- One owner node per tree.
create unique index family_members_one_owner on public.family_members (owner_id) where is_owner;
create index family_members_owner_idx on public.family_members (owner_id);

-- ---------------------------------------------------------------------------
-- Links: parent_of (from = parent, to = child) and partner_of
-- ---------------------------------------------------------------------------
create table public.family_links (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_member    uuid not null,
  to_member      uuid not null,
  type           text not null check (type in ('parent_of', 'partner_of')),
  -- Drawn as the neutral double line: "Marked as a marriage between cousins".
  consanguineous boolean not null default false,
  created_at     timestamptz not null default now(),
  -- Both people belong to the same tree.
  foreign key (from_member, owner_id) references public.family_members (id, owner_id) on delete cascade,
  foreign key (to_member, owner_id) references public.family_members (id, owner_id) on delete cascade,
  constraint family_links_not_self check (from_member <> to_member),
  constraint family_links_consanguineous_partner check (type = 'partner_of' or not consanguineous)
);

create unique index family_links_parent_unique on public.family_links (from_member, to_member) where type = 'parent_of';
create unique index family_links_partner_unique
  on public.family_links (least(from_member, to_member), greatest(from_member, to_member)) where type = 'partner_of';
create index family_links_owner_idx on public.family_links (owner_id);

-- ---------------------------------------------------------------------------
-- Conditions: a catalogue condition, or "Other: <their words>"
-- ---------------------------------------------------------------------------
create table public.family_member_conditions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  member_id    uuid not null,
  condition_id text check (condition_id is null or condition_id ~ '^[a-z0-9_]{2,40}$'),
  other_text   text check (other_text is null or char_length(other_text) between 1 and 120),
  status       text not null check (status in ('known', 'carrier', 'not_sure')),
  source       text not null default 'manual' check (source in ('manual', 'ai')),
  created_at   timestamptz not null default now(),
  foreign key (member_id, owner_id) references public.family_members (id, owner_id) on delete cascade,
  constraint family_member_conditions_what check (condition_id is not null or other_text is not null)
);

create index family_member_conditions_owner_idx on public.family_member_conditions (owner_id);

-- ---------------------------------------------------------------------------
-- Limits and consistency
-- ---------------------------------------------------------------------------
create function public.family_members_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.family_members where owner_id = new.owner_id) >= 60 then
    raise exception 'family_map_full' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger family_members_limit
  before insert on public.family_members
  for each row execute function public.family_members_limit();

-- A parent is one generation above their child; partners share a generation;
-- nobody has more than two parents.
create function public.family_links_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g_from integer;
  g_to   integer;
begin
  select generation into g_from from public.family_members where id = new.from_member;
  select generation into g_to from public.family_members where id = new.to_member;
  if new.type = 'parent_of' then
    if g_to <> g_from + 1 then
      raise exception 'family_generation' using errcode = 'check_violation';
    end if;
    if (select count(*) from public.family_links
         where to_member = new.to_member and type = 'parent_of' and id <> new.id) >= 2 then
      raise exception 'family_two_parents' using errcode = 'check_violation';
    end if;
  elsif g_to <> g_from then
    raise exception 'family_generation' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create constraint trigger family_links_check
  after insert or update on public.family_links
  deferrable initially deferred
  for each row execute function public.family_links_check();

create function public.family_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger family_members_touch
  before update on public.family_members
  for each row execute function public.family_touch();

-- ---------------------------------------------------------------------------
-- Who can read a tree: its owner, or a counsellor the owner shared it with
-- ---------------------------------------------------------------------------
create function public.family_map_readable(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner = auth.uid()
      or exists (
        select 1 from public.share_grants g
         join public.profiles p on p.user_id = g.grantee_id and p.role = 'counsellor'
         where g.owner_id = p_owner and g.grantee_id = auth.uid()
           and g.resource = 'family_map' and g.revoked_at is null
      )
$$;

revoke all on function public.family_map_readable(uuid) from public, anon;
grant execute on function public.family_map_readable(uuid) to authenticated;

alter table public.family_members enable row level security;
alter table public.family_links enable row level security;
alter table public.family_member_conditions enable row level security;

create policy "family_members: owner or shared counsellor reads"
  on public.family_members for select to authenticated
  using ((select public.family_map_readable(owner_id)));
create policy "family_members: owner adds"
  on public.family_members for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "family_members: owner changes"
  on public.family_members for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "family_members: owner removes"
  on public.family_members for delete to authenticated
  using (owner_id = (select auth.uid()) and not is_owner);

create policy "family_links: owner or shared counsellor reads"
  on public.family_links for select to authenticated
  using ((select public.family_map_readable(owner_id)));
create policy "family_links: owner writes"
  on public.family_links for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "family_member_conditions: owner or shared counsellor reads"
  on public.family_member_conditions for select to authenticated
  using ((select public.family_map_readable(owner_id)));
create policy "family_member_conditions: owner writes"
  on public.family_member_conditions for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.family_members, public.family_links, public.family_member_conditions from anon, authenticated;
grant select, insert, update, delete on public.family_members, public.family_links, public.family_member_conditions to authenticated;

-- ---------------------------------------------------------------------------
-- Saving: one transaction for everything the owner kept or edited. Runs as
-- the caller, so the row-level security above still applies.
--   p = { "upsert": { "members": [...], "links": [...], "conditions": [...] },
--         "remove": { "members": [ids], "links": [ids], "conditions": [ids] } }
-- ---------------------------------------------------------------------------
create function public.family_save(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  delete from public.family_member_conditions
   where owner_id = me
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(p -> 'remove' -> 'conditions', '[]'::jsonb)) x);
  delete from public.family_links
   where owner_id = me
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(p -> 'remove' -> 'links', '[]'::jsonb)) x);
  delete from public.family_members
   where owner_id = me and not is_owner
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(p -> 'remove' -> 'members', '[]'::jsonb)) x);

  insert into public.family_members as m
         (id, owner_id, label, relation_to_owner, side, sex, generation, deceased, created_by, is_owner, placeholder)
  select r.id, me, nullif(left(r.label, 60), ''), r.relation, r.side, r.sex, r.generation,
         coalesce(r.deceased, false), r.created_by, false, coalesce(r.placeholder, false)
    from jsonb_to_recordset(coalesce(p -> 'upsert' -> 'members', '[]'::jsonb))
         as r(id uuid, label text, relation text, side text, sex text, generation integer, deceased boolean, created_by text, placeholder boolean)
  on conflict (id) do update set
    label = excluded.label,
    -- The owner node always stays "self", generation 0.
    relation_to_owner = case when m.is_owner then 'self' else excluded.relation_to_owner end,
    side = case when m.is_owner then 'none' else excluded.side end,
    sex = excluded.sex,
    generation = case when m.is_owner then 0 else excluded.generation end,
    deceased = excluded.deceased,
    created_by = excluded.created_by,
    placeholder = case when m.is_owner then false else excluded.placeholder end
  where m.owner_id = me;

  insert into public.family_links as l (id, owner_id, from_member, to_member, type, consanguineous)
  select r.id, me, r.from_member, r.to_member, r.type, coalesce(r.consanguineous, false)
    from jsonb_to_recordset(coalesce(p -> 'upsert' -> 'links', '[]'::jsonb))
         as r(id uuid, from_member uuid, to_member uuid, type text, consanguineous boolean)
  on conflict (id) do update set consanguineous = excluded.consanguineous
  where l.owner_id = me;

  insert into public.family_member_conditions as c (id, owner_id, member_id, condition_id, other_text, status, source)
  select r.id, me, r.member_id, r.condition_id, nullif(left(r.other_text, 120), ''), r.status, r.source
    from jsonb_to_recordset(coalesce(p -> 'upsert' -> 'conditions', '[]'::jsonb))
         as r(id uuid, member_id uuid, condition_id text, other_text text, status text, source text)
  on conflict (id) do update set
    condition_id = excluded.condition_id,
    other_text = excluded.other_text,
    status = excluded.status,
    source = excluded.source
  where c.owner_id = me;
end;
$$;

revoke all on function public.family_save(jsonb) from public, anon;
grant execute on function public.family_save(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Describe rate limit: turns by the caller in the last hour (no text stored)
-- ---------------------------------------------------------------------------
create function public.family_describe_last_hour()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.events
   where user_id = auth.uid() and name = 'family_describe_started' and created_at > now() - interval '1 hour'
$$;

revoke all on function public.family_describe_last_hour() from public, anon;
grant execute on function public.family_describe_last_hour() to authenticated;

-- ---------------------------------------------------------------------------
-- Copy an earlier family_members shape, if there was one
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.family_members_legacy') is null then
    return;
  end if;

  -- Generations from the owner's own row (relation 'self'), following parent_ids.
  create temporary table legacy_gen on commit drop as
  with recursive walk(id, owner_id, generation) as (
    select id, owner_id, 0 from public.family_members_legacy where relation = 'self'
    union
    select n.id, n.owner_id, n.generation
      from walk w
      cross join lateral (
        -- Parents of someone already placed are one generation up…
        select p.id, p.owner_id, w.generation - 1 as generation
          from public.family_members_legacy c
          join public.family_members_legacy p on p.id = any (c.parent_ids)
         where c.id = w.id and w.generation > -6
        union all
        -- …their children one generation down…
        select k.id, k.owner_id, w.generation + 1
          from public.family_members_legacy k
         where w.id = any (k.parent_ids) and w.generation < 6
        union all
        -- …and their partners in the same generation.
        select pa.id, pa.owner_id, w.generation
          from public.family_members_legacy pa
         where pa.partner_id = w.id
            or pa.id = (select x.partner_id from public.family_members_legacy x where x.id = w.id)
      ) n
  )
  select distinct on (id) id, owner_id, generation from walk order by id, abs(generation);

  insert into public.family_members (id, owner_id, label, relation_to_owner, generation, is_owner, created_by)
  select l.id, l.owner_id, nullif(left(l.label, 60), ''),
         case when l.relation ~ '^[a-z_]{2,24}$' then l.relation else 'relative' end,
         coalesce(g.generation, 0), l.relation = 'self', 'manual'
    from public.family_members_legacy l
    left join legacy_gen g on g.id = l.id;

  insert into public.family_links (owner_id, from_member, to_member, type)
  select c.owner_id, p.parent_id, c.id, 'parent_of'
    from public.family_members_legacy c
    cross join lateral unnest(c.parent_ids) as p(parent_id)
    join public.family_members pm on pm.id = p.parent_id and pm.owner_id = c.owner_id
    join public.family_members cm on cm.id = c.id
   where cm.generation = pm.generation + 1;

  insert into public.family_links (owner_id, from_member, to_member, type, consanguineous)
  select distinct on (least(l.id, l.partner_id), greatest(l.id, l.partner_id))
         l.owner_id, l.id, l.partner_id, 'partner_of', coalesce(l.is_consanguineous_union, false)
    from public.family_members_legacy l
    join public.family_members a on a.id = l.id
    join public.family_members b on b.id = l.partner_id and b.owner_id = l.owner_id
   where l.partner_id is not null and a.generation = b.generation;

  -- The old single status had no condition name: kept as "Other", for the owner to complete.
  insert into public.family_member_conditions (owner_id, member_id, other_text, status, source)
  select l.owner_id, l.id, 'Condition not named',
         case l.condition_status when 'known_condition' then 'known' when 'carrier' then 'carrier' else 'not_sure' end,
         'manual'
    from public.family_members_legacy l
   where l.condition_status in ('known_condition', 'carrier', 'not_sure');
end $$;
