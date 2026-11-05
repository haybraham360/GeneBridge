-- Task 11: personalised paths (result or exploring).
--
-- Exploring users have no result yet; they choose conditions to learn
-- about: one in their family, one they think they may have, or out of
-- interest. Choosing a condition is never a diagnosis.
--   - followed_conditions is private to its owner: owner-only RLS, never
--     read by any partner, relative, counsellor or analyst function.
--   - The analytics panel counts only aggregate path events, with the
--     group-of-10 rule.

-- ---------------------------------------------------------------------------
-- Onboarding reason: "I think I may have a condition"
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_reason_check;
alter table public.profiles
  add constraint profiles_reason_check
  check (reason in ('premarital_result', 'family_condition', 'think_condition', 'just_learning'));

-- ---------------------------------------------------------------------------
-- Followed conditions
-- ---------------------------------------------------------------------------
create table public.followed_conditions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- A content library id (content/library/{locale}/conditions).
  condition_id text not null check (condition_id ~ '^[a-z0-9_]{2,64}$'),
  reason       text not null check (reason in ('family_history', 'think_i_have', 'learning')),
  created_at   timestamptz not null default now(),
  unique (user_id, condition_id)
);

create index followed_conditions_user_idx on public.followed_conditions (user_id, created_at);

alter table public.followed_conditions enable row level security;

create policy "followed_conditions: owner reads own"
  on public.followed_conditions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "followed_conditions: owner adds own"
  on public.followed_conditions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "followed_conditions: owner changes own"
  on public.followed_conditions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "followed_conditions: owner removes own"
  on public.followed_conditions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.followed_conditions from anon, authenticated;
grant select, insert, update, delete on public.followed_conditions to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard: "Exploring to tested" (rubric 6, improved access)
-- ---------------------------------------------------------------------------
-- Of the people who started on the exploring path (user_path_set with
-- path = exploring), how many later added a result (exploring_result_added).
-- Aggregate only; both figures hidden for groups under 10.
create function public.analytics_exploring_to_tested(p_days integer, p_centre text default null)
returns table (explorers integer, tested integer, tested_pct numeric)
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
      select user_id from analytics_private.cohort(w_from, now_at, p_centre)
    ),
    explorers as (
      select distinct e.user_id from public.events e
        join c on c.user_id = e.user_id
       where e.name = 'user_path_set' and e.props ->> 'path' = 'exploring'
    ),
    tested as (
      select distinct e.user_id from public.events e
        join explorers x on x.user_id = e.user_id
       where e.name = 'exploring_result_added'
    )
    select
      analytics_private.k((select count(*) from explorers), (select count(*) from explorers))::integer,
      analytics_private.k((select count(*) from explorers), (select count(*) from tested))::integer,
      analytics_private.k(
        (select count(*) from explorers),
        round(100.0 * (select count(*) from tested) / nullif((select count(*) from explorers), 0), 1)
      );
end;
$$;

revoke all on function public.analytics_exploring_to_tested(integer, text) from public, anon;
grant execute on function public.analytics_exploring_to_tested(integer, text) to authenticated;
