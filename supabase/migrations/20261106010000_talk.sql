-- Task 09: talking to your partner and family.
--
-- Rubric 1, 2 and 4. The page must never pressure anyone and never
-- encourage sharing someone else's information without permission.
--   - Feelings check-ins are private to the person: owner-only RLS, never
--     read by any pro_* function, never in analytics. The only event is
--     checkin_completed, with no feeling value.
--   - Message drafts stay in the browser unless the person taps "Save
--     draft". GeneBridge never sends these messages itself.

-- ---------------------------------------------------------------------------
-- Feelings check-in
-- ---------------------------------------------------------------------------
create table public.wellbeing_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feeling    text not null check (feeling in ('calm', 'unsure', 'worried', 'overwhelmed')),
  created_at timestamptz not null default now()
);

create index wellbeing_checkins_user_idx on public.wellbeing_checkins (user_id, created_at desc);

alter table public.wellbeing_checkins enable row level security;

create policy "wellbeing_checkins: owner reads own"
  on public.wellbeing_checkins for select to authenticated
  using (user_id = (select auth.uid()));

create policy "wellbeing_checkins: owner adds own"
  on public.wellbeing_checkins for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "wellbeing_checkins: owner deletes own"
  on public.wellbeing_checkins for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.wellbeing_checkins from anon, authenticated;
grant select, insert, delete on public.wellbeing_checkins to authenticated;

-- ---------------------------------------------------------------------------
-- Saved message draft: one per person, only when they tap "Save draft"
-- ---------------------------------------------------------------------------
create table public.talk_drafts (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  recipient  text not null check (recipient in ('partner', 'parents', 'relatives', 'other')),
  body       text not null check (char_length(body) <= 2000),
  updated_at timestamptz not null default now()
);

alter table public.talk_drafts enable row level security;

create policy "talk_drafts: own"
  on public.talk_drafts for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.talk_drafts from anon, authenticated;
grant select, insert, update, delete on public.talk_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- Bookings: "I'd like a family member to join" (from /counsellor?topic=family)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column family_member_invited boolean not null default false;

-- ---------------------------------------------------------------------------
-- Drafting rate limit: tone rewrites by the caller in the last hour,
-- counted from their own talk_draft_tone_used events (no text stored).
-- ---------------------------------------------------------------------------
create function public.talk_drafts_last_hour()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.events
   where user_id = auth.uid()
     and name = 'talk_draft_tone_used'
     and created_at > now() - interval '1 hour'
$$;

revoke all on function public.talk_drafts_last_hour() from public, anon;
grant execute on function public.talk_drafts_last_hour() to authenticated;
