-- Task 04 (M3): onboarding answers, screening results (claimed by reference
-- code) and partner invites. Tables from PROJECT.md section 7.

-- ---------------------------------------------------------------------------
-- profiles: onboarding answers
-- ---------------------------------------------------------------------------
-- Urdu, Hindi and Tagalog can be chosen now; their screens fall back to
-- English text until translations arrive.
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles
  add constraint profiles_locale_check check (locale in ('ar', 'en', 'ur', 'hi', 'tl'));

alter table public.profiles drop constraint if exists profiles_learning_mode_check;
alter table public.profiles
  add constraint profiles_learning_mode_check
  check (learning_mode in ('read', 'listen', 'read_listen'));

alter table public.profiles
  add constraint profiles_reason_check
  check (reason in ('premarital_result', 'family_condition', 'just_learning'));

-- Timestamps for the "seconds taken" analytics event; nothing personal.
alter table public.profiles
  add column onboarding_started_at   timestamptz,
  add column onboarding_completed_at timestamptz;

-- Only the onboarding server actions write these, as the signed-in user.
grant update (onboarding_started_at, onboarding_completed_at)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- consents: the onboarding privacy step
-- ---------------------------------------------------------------------------
alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents
  add constraint consents_kind_check
  check (kind in ('terms', 'privacy_basics', 'couple_view', 'compare_values'));

-- ---------------------------------------------------------------------------
-- screening_results
-- ---------------------------------------------------------------------------
-- Holds the interpretation only (condition, status, flags), never raw genome
-- data (guardrail 9). Rows arrive from the screening centre unclaimed
-- (owner_id null) and are linked to an account by reference code.
create table public.screening_results (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users (id) on delete set null,
  reference_code text not null unique check (reference_code = upper(reference_code)),
  condition_code text not null,
  status         text not null check (status in ('carrier', 'affected', 'no_variant', 'uncertain')),
  genotype       text,
  flagged        boolean not null default false,
  flag_reason    text check (flag_reason in ('vus', 'severe', 'x_linked', 'conflicting')),
  reported_at    timestamptz,
  centre         text,
  claimed_at     timestamptz,
  created_at     timestamptz not null default now(),
  -- Guardrail 4: an uncertain result is always flagged, and a flag has a reason.
  constraint screening_results_uncertain_flagged check (status <> 'uncertain' or flagged),
  constraint screening_results_flag_reason check (flagged = (flag_reason is not null)),
  constraint screening_results_claim check ((owner_id is null) = (claimed_at is null))
);

create index screening_results_owner_idx on public.screening_results (owner_id);

alter table public.screening_results enable row level security;

-- Each person reads only their own result. Partners, relatives and
-- counsellors get access through share_grants in a later task, never through
-- couple_links.
create policy "screening_results: read own"
  on public.screening_results for select to authenticated
  using (owner_id = (select auth.uid()));

-- No insert, update or delete for users. Claiming goes through
-- claim_screening_result() below.
revoke all on public.screening_results from anon, authenticated;
grant select on public.screening_results to authenticated;

-- Failed claim attempts, to slow down guessing reference codes. Server-only.
create table public.result_claim_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index result_claim_attempts_user_idx
  on public.result_claim_attempts (user_id, attempted_at);

alter table public.result_claim_attempts enable row level security;
revoke all on public.result_claim_attempts from anon, authenticated;

-- Links an unclaimed result to the caller. Returns 'claimed', 'not_found' or
-- 'rate_limited'. A wrong code and a code someone else already claimed both
-- return 'not_found', so the answer never reveals whether a code exists.
create function public.claim_screening_result(code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller  uuid := auth.uid();
  claimed uuid;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if (
    select count(*) from public.result_claim_attempts
    where user_id = caller and attempted_at > now() - interval '1 hour'
  ) >= 10 then
    return 'rate_limited';
  end if;

  update public.screening_results
     set owner_id = caller, claimed_at = now()
   where reference_code = upper(btrim(code))
     and owner_id is null
  returning id into claimed;

  if claimed is null then
    -- Already claimed by the caller counts as success (e.g. a double click).
    if exists (
      select 1 from public.screening_results
      where reference_code = upper(btrim(code)) and owner_id = caller
    ) then
      return 'claimed';
    end if;
    insert into public.result_claim_attempts (user_id) values (caller);
    return 'not_found';
  end if;

  return 'claimed';
end;
$$;

revoke all on function public.claim_screening_result(text) from public, anon;
grant execute on function public.claim_screening_result(text) to authenticated;

-- ---------------------------------------------------------------------------
-- couple_links
-- ---------------------------------------------------------------------------
-- Connects two accounts. It never shares a result and never unlocks the
-- couple view: that needs both partners' couple_view consent (task 05).
create table public.couple_links (
  id                uuid primary key default gen_random_uuid(),
  inviter_id        uuid not null references auth.users (id) on delete cascade,
  invitee_id        uuid references auth.users (id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'active', 'ended')),
  -- Random and single-use: cleared once the invite is accepted.
  invite_token      text unique,
  invite_expires_at timestamptz not null default now() + interval '14 days',
  accepted_at       timestamptz,
  created_at        timestamptz not null default now(),
  constraint couple_links_not_self check (invitee_id is null or invitee_id <> inviter_id),
  constraint couple_links_pending_token
    check ((status = 'pending') = (invite_token is not null)),
  constraint couple_links_active_invitee
    check (status <> 'active' or invitee_id is not null)
);

create index couple_links_inviter_idx on public.couple_links (inviter_id);
create index couple_links_invitee_idx on public.couple_links (invitee_id);

alter table public.couple_links enable row level security;

-- Only the two people in a link can read it.
create policy "couple_links: read own"
  on public.couple_links for select to authenticated
  using (inviter_id = (select auth.uid()) or invitee_id = (select auth.uid()));

-- Writes go through the functions below. Ending a link arrives in task 05.
revoke all on public.couple_links from anon, authenticated;
grant select on public.couple_links to authenticated;

-- Returns the caller's open invite token, creating one if needed, so sending
-- by WhatsApp and then copying the link doesn't create two invites.
-- Returns null when the caller is already linked to a partner.
create function public.create_partner_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  token  text;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.couple_links
    where status = 'active' and (inviter_id = caller or invitee_id = caller)
  ) then
    return null;
  end if;

  select invite_token into token
    from public.couple_links
   where inviter_id = caller and status = 'pending' and invite_expires_at > now()
   order by created_at desc
   limit 1;

  if token is null then
    -- 64 hex characters from two v4 UUIDs: 244 random bits.
    token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.couple_links (inviter_id, invite_token) values (caller, token);
  end if;

  return token;
end;
$$;

revoke all on function public.create_partner_invite() from public, anon;
grant execute on function public.create_partner_invite() to authenticated;

-- Accepts an invite as the caller. Returns 'accepted', 'own' (the inviter
-- opened their own link), 'already_linked' or 'invalid' (unknown, used or
-- expired: one answer for all three).
create function public.accept_partner_invite(token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  link   public.couple_links;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into link
    from public.couple_links
   where invite_token = token and status = 'pending' and invite_expires_at > now()
   for update;

  if link.id is null then
    return 'invalid';
  end if;

  if link.inviter_id = caller then
    return 'own';
  end if;

  if exists (
    select 1 from public.couple_links
    where status = 'active'
      and (inviter_id in (caller, link.inviter_id) or invitee_id in (caller, link.inviter_id))
  ) then
    return 'already_linked';
  end if;

  update public.couple_links
     set invitee_id = caller,
         status = 'active',
         accepted_at = now(),
         invite_token = null
   where id = link.id;

  -- Any other open invites from the inviter are no longer needed.
  update public.couple_links
     set status = 'ended', invite_token = null
   where inviter_id = link.inviter_id and status = 'pending';

  return 'accepted';
end;
$$;

revoke all on function public.accept_partner_invite(text) from public, anon;
grant execute on function public.accept_partner_invite(text) to authenticated;
