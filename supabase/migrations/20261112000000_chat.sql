-- Task 15, section 3: real-time chat between a patient and a verified
-- professional.
--
-- Guardrail 17: messages are read only by the two participants. They never
-- reach an AI model or analytics (events carry the sender's role only), and
-- an admin sees a single message only when one of the participants reports
-- it, with an audit record of every view.
-- Guardrail 15: a professional who is not verified (pending, suspended,
-- expired) can neither read nor send; the patient can still read the
-- history, and the conversation is read-only for both.
-- Starting a conversation shares nothing about the patient. Sharing is an
-- explicit "Share my result summary" in the chat (a share_grants row and a
-- system message), revocable in Privacy & consent.

-- ---------------------------------------------------------------------------
-- 1. Tables (task 14 created them as pro_conversations and pro_messages)
-- ---------------------------------------------------------------------------
alter table public.pro_conversations rename to conversations;
alter table public.pro_messages rename to messages;
alter index if exists pro_conversations_professional_idx rename to conversations_professional_idx;
alter index if exists pro_messages_conversation_idx rename to messages_conversation_idx;

alter table public.conversations
  add column status          text not null default 'active' check (status in ('active', 'closed', 'blocked')),
  add column blocked_by      uuid references auth.users (id) on delete set null,
  add column last_message_at timestamptz;

alter table public.messages
  -- System messages ("You shared your result summary") are written by the
  -- database only; their body is a code the app translates.
  add column kind       text not null default 'text' check (kind in ('text', 'system')),
  add column read_at    timestamptz,
  add column deleted_at timestamptz;

create index conversations_patient_idx on public.conversations (patient_id, last_message_at desc nulls last);
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- Demo data: same tables, new names.
update demo_private.flagged_tables set table_name = 'conversations' where table_name = 'pro_conversations';
update demo_private.flagged_tables
   set table_name = 'messages', owners = array['sender_id', 'conversation_id>conversations']
 where table_name = 'pro_messages';
drop trigger if exists pro_conversations_demo_flag on public.conversations;
drop trigger if exists pro_messages_demo_flag on public.messages;
create trigger conversations_demo_flag before insert or update on public.conversations
  for each row execute function demo_private.inherit_flag('patient_id', 'professional_id');
create trigger messages_demo_flag before insert or update on public.messages
  for each row execute function demo_private.inherit_flag('sender_id', 'conversation_id>conversations');

-- ---------------------------------------------------------------------------
-- 2. Who may read and send
-- ---------------------------------------------------------------------------
-- Sending: either participant, while the professional is verified and the
-- conversation is active (not blocked or closed).
create or replace function public.pro_conversation_open_to(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and c.status = 'active'
       and public.is_verified_professional(c.professional_id)
       and (c.patient_id = p_user or c.professional_id = p_user)
  )
$$;

-- Reading: the patient always (their own history); the professional only
-- while verified.
create or replace function public.pro_conversation_readable_by(p_conversation uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation
       and (c.patient_id = p_user
            or (c.professional_id = p_user and public.is_verified_professional(p_user)))
  )
$$;

drop policy if exists "pro_messages: participants read" on public.messages;
drop policy if exists "pro_messages: participants send while verified" on public.messages;
create policy "messages: participants read"
  on public.messages for select to authenticated
  using (public.pro_conversation_readable_by(conversation_id, (select auth.uid())));
create policy "messages: participants send while open"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and kind = 'text'
    and read_at is null and deleted_at is null
    and public.pro_conversation_open_to(conversation_id, (select auth.uid()))
  );

alter policy "pro_conversations: patient or verified professional reads" on public.conversations
  rename to "conversations: patient or verified professional reads";
alter policy "pro_conversations: patient starts with a bookable professional" on public.conversations
  rename to "conversations: patient starts with a bookable professional";

-- Only the body and conversation come from the browser; everything else is
-- set by defaults or the functions below.
revoke all on public.conversations, public.messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant insert (patient_id, professional_id) on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. After each message: last activity, and one notification per unread
--    conversation (never the message text)
-- ---------------------------------------------------------------------------
create function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.conversations;
  recipient uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id
  returning * into c;
  recipient := case when new.sender_id = c.patient_id then c.professional_id else c.patient_id end;
  if new.kind = 'text' and not exists (
    select 1 from public.notifications n
     where n.user_id = recipient and n.kind = 'new_message'
       and n.conversation_id = c.id and n.read_at is null) then
    insert into public.notifications (user_id, kind, conversation_id, actor_role)
    values (recipient, 'new_message', c.id, case when new.sender_id = c.patient_id then 'patient' else 'professional' end);
  end if;
  -- message_sent: the role only (guardrail 17).
  if new.kind = 'text' then
    insert into public.events (user_id, name, props)
    values (new.sender_id, 'message_sent',
            jsonb_build_object('role', case when new.sender_id = c.patient_id then 'patient' else 'professional' end));
  end if;
  return new;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- ---------------------------------------------------------------------------
-- 4. Conversation actions
-- ---------------------------------------------------------------------------
create schema if not exists chat_private;
revoke all on schema chat_private from public, anon, authenticated;
alter default privileges in schema chat_private
  revoke execute on functions from public, anon, authenticated;

-- The caller's role in a conversation, or an error that doesn't reveal it.
create function chat_private.participant(p_conversation uuid, out c public.conversations, out role text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  select * into c from public.conversations where id = p_conversation;
  if c.id is not null and c.patient_id = auth.uid() then
    role := 'patient';
  elsif c.id is not null and c.professional_id = auth.uid() and public.is_verified_professional(auth.uid()) then
    role := 'professional';
  else
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Patients start (or reopen) a conversation with a bookable professional.
-- Nothing about the patient is shared by starting it.
create function public.start_conversation(p_professional uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  existing uuid;
  created uuid;
begin
  if caller is null or not exists (select 1 from public.profiles where user_id = caller and role = 'individual') then
    raise exception 'patients only' using errcode = '42501';
  end if;
  select id into existing from public.conversations where patient_id = caller and professional_id = p_professional;
  if existing is not null then
    return existing;
  end if;
  if not public.is_bookable_professional(p_professional) then
    raise exception 'professional not available' using errcode = '42501';
  end if;
  insert into public.conversations (patient_id, professional_id) values (caller, p_professional)
  returning id into created;
  insert into public.events (user_id, name, props) values (caller, 'conversation_started', '{}'::jsonb);
  return created;
end;
$$;

-- "Seen": marks the other side's messages read, and their notifications.
create function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from chat_private.participant(p_conversation);
  update public.messages set read_at = now()
   where conversation_id = p_conversation and sender_id <> auth.uid() and read_at is null;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and conversation_id = p_conversation and kind = 'new_message' and read_at is null;
end;
$$;

-- "Share my result summary" (and values or family map): a share grant, as
-- in task 07, plus a system message both sides see. Revoked in Privacy &
-- consent.
create function public.share_in_chat(p_conversation uuid, p_resource text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  if p_resource not in ('result', 'values_summary', 'family_map') then
    raise exception 'invalid resource' using errcode = '22023';
  end if;
  select * into p from chat_private.participant(p_conversation);
  if p.role <> 'patient' then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  if not public.pro_conversation_open_to(p_conversation, auth.uid()) then
    raise exception 'conversation is read-only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.share_grants g
                  where g.owner_id = auth.uid() and g.grantee_id = (p.c).professional_id
                    and g.resource = p_resource and g.revoked_at is null) then
    insert into public.share_grants (owner_id, grantee_id, resource, level)
    values (auth.uid(), (p.c).professional_id, p_resource, 'summary');
  end if;
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (p_conversation, auth.uid(), 'shared:' || p_resource, 'system');
  insert into public.events (user_id, name, props)
  values (auth.uid(), 'result_shared_in_chat', jsonb_build_object('resource', p_resource));
end;
$$;

-- Deleting your own message removes its text for both sides.
create function public.delete_message(p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.messages set deleted_at = now(), body = '-'
   where id = p_message and sender_id = auth.uid() and kind = 'text' and deleted_at is null;
  if not found then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Either side can block the other: the conversation becomes read-only.
-- Only the person who blocked can unblock.
create function public.set_conversation_blocked(p_conversation uuid, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from chat_private.participant(p_conversation);
  if p_blocked then
    update public.conversations set status = 'blocked', blocked_by = auth.uid() where id = p_conversation;
    insert into public.events (user_id, name, props) values (auth.uid(), 'conversation_blocked', jsonb_build_object('role', p.role));
  else
    if (p.c).blocked_by is distinct from auth.uid() then
      raise exception 'only the person who blocked can unblock' using errcode = '42501';
    end if;
    update public.conversations set status = 'active', blocked_by = null where id = p_conversation;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reading conversations
-- ---------------------------------------------------------------------------
-- The caller's conversations, patient or professional, with the other
-- person's name (the patient's first name only), unread count and whether
-- the professional is still available.
create function public.my_conversations()
returns table (
  id uuid, other_id uuid, other_name text, my_role text, status text, blocked_by_me boolean,
  last_message_at timestamptz, unread integer, professional_available boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id,
         case when c.patient_id = auth.uid() then c.professional_id else c.patient_id end,
         case when c.patient_id = auth.uid() then pp.display_name
              else coalesce(nullif(split_part(btrim(coalesce(pa.display_name, '')), ' ', 1), ''), 'Patient') end,
         case when c.patient_id = auth.uid() then 'patient' else 'professional' end,
         c.status, c.blocked_by = auth.uid(),
         c.last_message_at,
         (select count(*)::integer from public.messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null and m.kind = 'text'),
         public.is_verified_professional(c.professional_id),
         c.created_at
    from public.conversations c
    left join public.professional_profiles pp on pp.user_id = c.professional_id
    left join public.profiles pa on pa.user_id = c.patient_id
   where c.patient_id = auth.uid()
      or (c.professional_id = auth.uid() and public.is_verified_professional(auth.uid()))
   order by coalesce(c.last_message_at, c.created_at) desc
$$;

-- Task 14's patient list keeps working on the new table.
create or replace function public.my_pro_conversations()
returns table (id uuid, professional_id uuid, professional_name text, available boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.professional_id, pp.display_name, public.is_verified_professional(c.professional_id), c.created_at
    from public.conversations c
    left join public.professional_profiles pp on pp.user_id = c.professional_id
   where c.patient_id = auth.uid()
   order by c.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- 6. The professional's side panel: what the patient shared
-- ---------------------------------------------------------------------------
-- Live grants from the patient to the caller (no data).
create function public.pro_shared_in_conversation(p_conversation uuid)
returns table (resource text, level text, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from chat_private.participant(p_conversation);
  if p.role <> 'professional' then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  return query
    select g.resource, g.level, g.granted_at from public.share_grants g
     where g.owner_id = (p.c).patient_id and g.grantee_id = auth.uid() and g.revoked_at is null
       and g.resource in ('result', 'values_summary', 'family_map')
     order by g.granted_at;
end;
$$;

-- Opening one shared item: the summary only, and the read goes to the
-- patient's access log (guardrail 10).
create function public.pro_open_shared(p_conversation uuid, p_resource text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p      record;
  level  text;
  owner  uuid;
  result jsonb;
begin
  select * into p from chat_private.participant(p_conversation);
  if p.role <> 'professional' then
    raise exception 'conversation not found' using errcode = 'P0002';
  end if;
  owner := (p.c).patient_id;
  level := pro_private.grant_level(owner, auth.uid(), p_resource);
  if level is null then
    raise exception 'not shared' using errcode = '42501';
  end if;

  if p_resource = 'result' then
    select coalesce(jsonb_agg(jsonb_build_object(
             'condition_code', s.condition_code, 'status', s.status, 'flagged', s.flagged,
             'flag_reason', s.flag_reason, 'unverified', s.source = 'scan' and not s.verified)
             order by s.flagged desc, s.condition_code), '[]'::jsonb)
      into result
      from public.screening_results s
     where s.owner_id = owner and s.claimed_at is not null and s.status in ('carrier', 'affected', 'uncertain');
  elsif p_resource = 'values_summary' then
    select coalesce(jsonb_agg(jsonb_build_object('question_id', v.question_id, 'band', pro_private.band(v.value)) order by v.question_id), '[]'::jsonb)
      into result
      from public.values_answers v where v.user_id = owner;
  else
    select coalesce(jsonb_agg(jsonb_build_object('relation', m.relation_to_owner, 'generation', m.generation) order by m.generation), '[]'::jsonb)
      into result
      from public.family_members m where m.owner_id = owner and not m.is_owner;
  end if;

  perform pro_private.log_access(owner, p_resource, level, null);
  return jsonb_build_object('resource', p_resource, 'level', level, 'items', result);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Reports: one message, reviewed by an admin, every view audited
-- ---------------------------------------------------------------------------
create table public.message_reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason      text not null check (reason in ('harassment', 'inappropriate', 'safety', 'spam', 'other')),
  status      text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  is_demo     boolean not null default false,
  unique (message_id, reporter_id)
);

alter table public.message_reports enable row level security;
revoke all on public.message_reports from anon, authenticated;

-- Append-only, no foreign keys: outlives the message and the accounts.
create table public.message_report_audit (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid,
  actor_id   uuid,
  action     text not null check (action in ('reported', 'viewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);
alter table public.message_report_audit enable row level security;
revoke all on public.message_report_audit from anon, authenticated;

create function public.message_report_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'message_report_audit is append-only' using errcode = '42501';
end;
$$;
create trigger message_report_audit_append_only
  before update or delete on public.message_report_audit
  for each row execute function public.message_report_audit_append_only();

insert into demo_private.flagged_tables (table_name, owners, purge_order)
values ('message_reports', array['reporter_id', 'message_id>messages'], 5);
create trigger message_reports_demo_flag before insert or update on public.message_reports
  for each row execute function demo_private.inherit_flag('reporter_id', 'message_id>messages');

-- A participant reports the other person's message.
create function public.report_message(p_message uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
  p record;
  rid uuid;
begin
  if p_reason not in ('harassment', 'inappropriate', 'safety', 'spam', 'other') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  select * into m from public.messages where id = p_message;
  if m.id is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  select * into p from chat_private.participant(m.conversation_id);
  if m.sender_id = auth.uid() or m.kind <> 'text' then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  insert into public.message_reports (message_id, reporter_id, reason) values (p_message, auth.uid(), p_reason)
  on conflict (message_id, reporter_id) do nothing
  returning id into rid;
  if rid is not null then
    insert into public.message_report_audit (report_id, actor_id, action) values (rid, auth.uid(), 'reported');
    insert into public.events (user_id, name, props) values (auth.uid(), 'message_reported', jsonb_build_object('role', p.role, 'reason', p_reason));
  end if;
end;
$$;

-- The admin's review list: no message text.
create function public.admin_message_reports()
returns table (id uuid, reason text, status text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  return query select r.id, r.reason, r.status, r.created_at from public.message_reports r
    order by (r.status = 'open') desc, r.created_at desc limit 100;
end;
$$;

-- Opening a report shows that one message, and is audited.
create function public.admin_open_report(p_report uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.message_reports;
  m public.messages;
  c public.conversations;
begin
  perform demo_private.require_admin();
  select * into r from public.message_reports where id = p_report;
  if r.id is null then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  select * into m from public.messages where id = r.message_id;
  select * into c from public.conversations where id = m.conversation_id;
  insert into public.message_report_audit (report_id, actor_id, action) values (r.id, auth.uid(), 'viewed');
  return jsonb_build_object(
    'id', r.id, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at,
    'body', case when m.deleted_at is null then m.body end,
    'sent_at', m.created_at,
    'sender_role', case when m.sender_id = c.patient_id then 'patient' else 'professional' end);
end;
$$;

create function public.admin_resolve_report(p_report uuid, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform demo_private.require_admin();
  if p_outcome not in ('dismissed', 'actioned') then
    raise exception 'invalid outcome' using errcode = '22023';
  end if;
  update public.message_reports set status = p_outcome, reviewed_by = auth.uid(), reviewed_at = now() where id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  insert into public.message_report_audit (report_id, actor_id, action) values (p_report, auth.uid(), p_outcome);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Live updates and grants
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.conversations, public.messages;
  end if;
end;
$$;

revoke all on function public.messages_after_insert() from public, anon, authenticated;
revoke all on function public.message_report_audit_append_only() from public, anon, authenticated;
revoke all on function public.start_conversation(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.share_in_chat(uuid, text) from public, anon;
revoke all on function public.delete_message(uuid) from public, anon;
revoke all on function public.set_conversation_blocked(uuid, boolean) from public, anon;
revoke all on function public.my_conversations() from public, anon;
revoke all on function public.my_pro_conversations() from public, anon;
revoke all on function public.pro_shared_in_conversation(uuid) from public, anon;
revoke all on function public.pro_open_shared(uuid, text) from public, anon;
revoke all on function public.report_message(uuid, text) from public, anon;
revoke all on function public.admin_message_reports() from public, anon;
revoke all on function public.admin_open_report(uuid) from public, anon;
revoke all on function public.admin_resolve_report(uuid, text) from public, anon;

grant execute on function public.start_conversation(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.share_in_chat(uuid, text) to authenticated;
grant execute on function public.delete_message(uuid) to authenticated;
grant execute on function public.set_conversation_blocked(uuid, boolean) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.my_pro_conversations() to authenticated;
grant execute on function public.pro_shared_in_conversation(uuid) to authenticated;
grant execute on function public.pro_open_shared(uuid, text) to authenticated;
grant execute on function public.report_message(uuid, text) to authenticated;
grant execute on function public.admin_message_reports() to authenticated;
grant execute on function public.admin_open_report(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text) to authenticated;
