-- Task 06: Ask GeneBridge (AI genetics assistant).
--
-- Conversations are owner-only and deleted after 30 days. Counsellor
-- requests are created by the escalation card; counsellors see open
-- requests in their facility (or ones assigned to them) and only the
-- summary the user chose to share. Nothing here stores a user's result in a
-- conversation unless the user shared it into that chat.

-- ---------------------------------------------------------------------------
-- Conversations and messages
-- ---------------------------------------------------------------------------
create table public.assistant_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  locale     text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assistant_conversations_user_idx on public.assistant_conversations (user_id, updated_at desc);

create table public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.assistant_conversations (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (char_length(content) <= 20000),
  -- Display data for a reply: level, source ids, escalation, engine result.
  -- Never the user's raw result.
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index assistant_messages_conversation_idx on public.assistant_messages (conversation_id, created_at);
create index assistant_messages_created_idx on public.assistant_messages (created_at);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy "assistant_conversations: own"
  on public.assistant_conversations for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "assistant_messages: own"
  on public.assistant_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.assistant_conversations c
       where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );

revoke all on public.assistant_conversations, public.assistant_messages from anon;
revoke all on public.assistant_conversations, public.assistant_messages from authenticated;
grant select, insert, delete on public.assistant_conversations to authenticated;
grant update (updated_at) on public.assistant_conversations to authenticated;
grant select, insert, delete on public.assistant_messages to authenticated;

-- 30-day retention. The app also removes the caller's expired messages on
-- every request, so retention holds even before pg_cron is turned on.
create function public.assistant_delete_expired()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.assistant_conversations
   where updated_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  delete from public.assistant_messages
   where created_at < now() - interval '30 days';
  return removed;
end;
$$;

revoke all on function public.assistant_delete_expired() from public, anon, authenticated;

-- Nightly clean-up when pg_cron is available (Supabase: Database →
-- Extensions → pg_cron). Skipped quietly when it isn't.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('assistant-retention', '17 3 * * *', 'select public.assistant_delete_expired()');
  end if;
end;
$$;

-- Messages sent in the last hour by the caller, for the 30-per-hour limit.
-- Counts `ai_question` events, so deleting a conversation doesn't reset it.
create function public.assistant_questions_last_hour()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.events
   where user_id = auth.uid()
     and name = 'ai_question'
     and created_at > now() - interval '1 hour'
$$;

revoke all on function public.assistant_questions_last_hour() from public, anon;
grant execute on function public.assistant_questions_last_hour() to authenticated;

-- ---------------------------------------------------------------------------
-- Couple summary for the assistant (level 2c)
-- ---------------------------------------------------------------------------
-- Returns the partner's first name and status for the shared condition only
-- when BOTH partners have an unrevoked couple_view consent (guardrail 6) and
-- neither result is flagged. Returns one row with `available = false` and a
-- reason otherwise; never anything about a flagged result.
create function public.assistant_couple_summary()
returns table (
  available      boolean,
  reason         text,
  partner_name   text,
  condition_code text,
  my_status      text,
  partner_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  link    public.couple_links;
  partner uuid;
  mine    public.screening_results;
  theirs  public.screening_results;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into link from public.couple_links
   where status = 'active' and (inviter_id = caller or invitee_id = caller)
   limit 1;
  if link.id is null then
    return query select false, 'no_partner', null::text, null::text, null::text, null::text;
    return;
  end if;
  partner := case when link.inviter_id = caller then link.invitee_id else link.inviter_id end;

  if (
    select count(distinct c.user_id) from public.consents c
     where c.kind = 'couple_view' and c.revoked_at is null
       and c.user_id in (caller, partner)
  ) < 2 then
    return query select false, 'consent_missing', null::text, null::text, null::text, null::text;
    return;
  end if;

  select * into mine from public.screening_results where owner_id = caller order by claimed_at desc limit 1;
  select * into theirs from public.screening_results where owner_id = partner order by claimed_at desc limit 1;
  if mine.id is null or theirs.id is null then
    return query select false, 'result_missing', null::text, null::text, null::text, null::text;
    return;
  end if;
  if mine.flagged or theirs.flagged then
    return query select false, 'flagged', null::text, null::text, null::text, null::text;
    return;
  end if;

  return query
    select true, null::text,
           split_part(coalesce(p.display_name, ''), ' ', 1),
           mine.condition_code,
           mine.status,
           case when theirs.condition_code = mine.condition_code then theirs.status else 'no_variant' end
      from public.profiles p where p.user_id = partner;
end;
$$;

revoke all on function public.assistant_couple_summary() from public, anon;
grant execute on function public.assistant_couple_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Counsellor requests
-- ---------------------------------------------------------------------------
create table public.counsellor_requests (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  -- Category only, never conversation text.
  reason                text not null check (reason in (
                          'flagged_result', 'pregnancy', 'x_linked_or_dominant',
                          'major_decision', 'outside_library', 'distress', 'asked_for_person')),
  urgency               text not null check (urgency in ('standard', 'priority')),
  share_summary         boolean not null default false,
  -- Stored only when the user ticked "Share a short summary".
  summary               text check (char_length(summary) <= 2000),
  status                text not null default 'open' check (status in ('open', 'booked', 'closed')),
  -- Server-only: which facility's counsellors may see it. Never granted to users.
  facility_code         text,
  assigned_counsellor_id uuid references public.counsellors (id) on delete set null,
  created_at            timestamptz not null default now(),
  constraint counsellor_requests_summary_only_if_shared check (share_summary or summary is null)
);

create index counsellor_requests_queue_idx
  on public.counsellor_requests (facility_code, status, urgency, created_at);
create index counsellor_requests_user_idx on public.counsellor_requests (user_id);

alter table public.counsellor_requests enable row level security;

-- The caller's counsellor record, if any. Security definer because facility
-- codes are not readable by users.
create function public.my_counsellor()
returns table (counsellor_id uuid, facility_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.facility_code from public.counsellors c where c.user_id = auth.uid()
$$;

revoke all on function public.my_counsellor() from public, anon, authenticated;

create policy "counsellor_requests: owner reads own"
  on public.counsellor_requests for select to authenticated
  using (user_id = (select auth.uid()));

create policy "counsellor_requests: counsellor reads facility queue"
  on public.counsellor_requests for select to authenticated
  using (
    exists (
      select 1 from public.my_counsellor() m
       where m.counsellor_id = assigned_counsellor_id
          or (status = 'open' and m.facility_code = counsellor_requests.facility_code)
    )
  );

-- Users never write directly; requests go through the function below.
revoke all on public.counsellor_requests from anon, authenticated;
grant select (id, reason, urgency, share_summary, summary, status, created_at)
  on public.counsellor_requests to authenticated;

-- my_counsellor() is called inside the policy as the querying user.
grant execute on function public.my_counsellor() to authenticated;

-- Creates a request for the caller. The summary is kept only if shared.
-- Facility: the demo programme has one; real routing comes with M7.
create function public.create_counsellor_request(
  p_reason text,
  p_urgency text,
  p_share_summary boolean default false,
  p_summary text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  -- At most 5 requests per person per day, to stop accidental floods.
  if (
    select count(*) from public.counsellor_requests
     where user_id = caller and created_at > now() - interval '1 day'
  ) >= 5 then
    raise exception 'too many requests today' using errcode = '54000';
  end if;

  insert into public.counsellor_requests (user_id, reason, urgency, share_summary, summary, facility_code)
  values (
    caller,
    p_reason,
    p_urgency,
    coalesce(p_share_summary, false),
    case when coalesce(p_share_summary, false) then nullif(btrim(p_summary), '') end,
    (select facility_code from public.counsellors order by facility_code limit 1)
  )
  returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_counsellor_request(text, text, boolean, text) from public, anon;
grant execute on function public.create_counsellor_request(text, text, boolean, text) to authenticated;
