-- Friends system for the public edition: friend requests, friendships,
-- blocks, and per-person privacy (Everyone / Friends / Only me) enforced by
-- the database's read rules.
--
-- The public project needs it before its code runs. On the friends project
-- nothing changes for anyone (can_view() keeps that edition's rule, every
-- signed-in user reads everything; the new tables stay empty and its pages
-- never touch them), so there it's housekeeping: run it any time, at the
-- latest before the next `npm run db:dump`, so production stays the schema
-- source. Safe to re-run.

-- ── Privacy settings, per person ────────────────────────────────────────────
-- What other people may see of you. You always see all of your own.
alter table public.profiles
  add column if not exists privacy_profile      text not null default 'everyone',
  add column if not exists privacy_games        text not null default 'everyone',
  add column if not exists privacy_achievements text not null default 'everyone',
  add column if not exists privacy_activity     text not null default 'friends',
  add column if not exists privacy_tickets      text not null default 'friends';

do $$
declare c text;
begin
  foreach c in array array['privacy_profile','privacy_games','privacy_achievements','privacy_activity','privacy_tickets'] loop
    if not exists (select 1 from pg_constraint where conname = 'profiles_' || c || '_check') then
      execute format(
        'alter table public.profiles add constraint %I check (%I in (''everyone'', ''friends'', ''only_me''))',
        'profiles_' || c || '_check', c);
    end if;
  end loop;
end $$;

-- People may change their own privacy settings directly (like their display
-- name); everything else on profiles stays server-only.
grant update (privacy_profile, privacy_games, privacy_achievements, privacy_activity, privacy_tickets)
  on public.profiles to authenticated;

-- ── Tables ──────────────────────────────────────────────────────────────────
-- Every write goes through the server-only functions below, so none of these
-- has a write policy.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);
create index if not exists friend_requests_to_idx on public.friend_requests (to_user);
alter table public.friend_requests enable row level security;
drop policy if exists "Read your own friend requests" on public.friend_requests;
create policy "Read your own friend requests" on public.friend_requests
  for select using (auth.uid() = from_user or auth.uid() = to_user);

-- One row per pair, the smaller id first, so a pair can't be stored twice.
create table if not exists public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists friendships_b_idx on public.friendships (user_b);
alter table public.friendships enable row level security;
drop policy if exists "Read your own friendships" on public.friendships;
create policy "Read your own friendships" on public.friendships
  for select using (auth.uid() = user_a or auth.uid() = user_b);

-- Only the blocker can see a block (the blocked person isn't told).
create table if not exists public.blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index if not exists blocks_blocked_idx on public.blocks (blocked);
alter table public.blocks enable row level security;
drop policy if exists "Read your own blocks" on public.blocks;
create policy "Read your own blocks" on public.blocks
  for select using (auth.uid() = blocker);

-- ── Read helpers (used by the read rules, so everyone may call them) ────────

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.friendships
     where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
     where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

-- May the person asking (auth.uid(), or a logged-out visitor) see `p_owner`'s
-- `p_item` (profile, games, achievements, activity, tickets)?
--   Friends edition: any signed-in user, exactly as before.
--   Public edition: yourself always; nobody across a block; otherwise the
--   owner's setting (everyone includes logged-out visitors).
create or replace function public.can_view(p_owner uuid, p_item text)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_setting text;
begin
  if not public.edition_is_public() then
    return auth.role() = 'authenticated';
  end if;
  if v_me is not null and v_me = p_owner then
    return true;
  end if;
  if v_me is not null and public.is_blocked(v_me, p_owner) then
    return false;
  end if;

  select case p_item
           when 'profile'      then privacy_profile
           when 'games'        then privacy_games
           when 'achievements' then privacy_achievements
           when 'activity'     then privacy_activity
           when 'tickets'      then privacy_tickets
         end
    into v_setting
    from public.profiles where id = p_owner;

  return case v_setting
    when 'everyone' then true
    when 'friends'  then public.are_friends(v_me, p_owner)
    else false
  end;
end;
$$;

-- ── Writes (server only: they take the acting user's id) ────────────────────
-- Each locks the pair's two profile rows (in id order, so two requests can't
-- deadlock) before deciding, so two tabs at once still act once.

create or replace function public.lock_pair(a uuid, b uuid)
returns void
language sql security definer set search_path = public
as $$
  select 1 from public.profiles where id in (a, b) order by id for update;
$$;

-- Returns: 'sent', 'friends' (their request to you was pending, so you're now
-- friends), 'already_friends', 'already_sent', 'blocked', 'self', 'not_found'.
create or replace function public.send_friend_request(p_user uuid, p_to uuid)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if p_user = p_to then return 'self'; end if;
  if not exists (select 1 from public.profiles where id = p_to) then return 'not_found'; end if;
  perform public.lock_pair(p_user, p_to);
  if public.is_blocked(p_user, p_to) then return 'blocked'; end if;
  if public.are_friends(p_user, p_to) then return 'already_friends'; end if;

  if exists (select 1 from public.friend_requests where from_user = p_to and to_user = p_user) then
    delete from public.friend_requests
     where (from_user = p_to and to_user = p_user) or (from_user = p_user and to_user = p_to);
    insert into public.friendships (user_a, user_b)
    values (least(p_user, p_to), greatest(p_user, p_to))
    on conflict do nothing;
    return 'friends';
  end if;

  insert into public.friend_requests (from_user, to_user) values (p_user, p_to)
  on conflict (from_user, to_user) do nothing;
  if not found then return 'already_sent'; end if;
  return 'sent';
end;
$$;

-- Accept or decline a request sent TO p_user. Returns false if it's gone
-- (already answered, or cancelled).
create or replace function public.respond_friend_request(p_user uuid, p_from uuid, p_accept boolean)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  perform public.lock_pair(p_user, p_from);
  delete from public.friend_requests where from_user = p_from and to_user = p_user;
  if not found then return false; end if;
  if p_accept and not public.is_blocked(p_user, p_from) then
    insert into public.friendships (user_a, user_b)
    values (least(p_user, p_from), greatest(p_user, p_from))
    on conflict do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.cancel_friend_request(p_user uuid, p_to uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.friend_requests where from_user = p_user and to_user = p_to;
  return found;
end;
$$;

create or replace function public.remove_friend(p_user uuid, p_other uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.friendships
   where user_a = least(p_user, p_other) and user_b = greatest(p_user, p_other);
  return found;
end;
$$;

-- Blocking also ends the friendship and any requests between the two.
create or replace function public.block_user(p_user uuid, p_other uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if p_user = p_other then return false; end if;
  perform public.lock_pair(p_user, p_other);
  delete from public.friendships
   where user_a = least(p_user, p_other) and user_b = greatest(p_user, p_other);
  delete from public.friend_requests
   where (from_user = p_user and to_user = p_other) or (from_user = p_other and to_user = p_user);
  insert into public.blocks (blocker, blocked) values (p_user, p_other) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.unblock_user(p_user uuid, p_other uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.blocks where blocker = p_user and blocked = p_other;
  return found;
end;
$$;

-- ── Who may call what ───────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.lock_pair(uuid, uuid)',
    'public.send_friend_request(uuid, uuid)',
    'public.respond_friend_request(uuid, uuid, boolean)',
    'public.cancel_friend_request(uuid, uuid)',
    'public.remove_friend(uuid, uuid)',
    'public.block_user(uuid, uuid)',
    'public.unblock_user(uuid, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

grant execute on function public.are_friends(uuid, uuid)   to anon, authenticated, service_role;
grant execute on function public.is_blocked(uuid, uuid)    to anon, authenticated, service_role;
grant execute on function public.can_view(uuid, text)      to anon, authenticated, service_role;

-- ── Read rules ──────────────────────────────────────────────────────────────
-- Replaces db/batch3.sql's "own; everyone's in the friends edition" rules.
-- can_view() keeps the friends edition exactly as it was.

drop policy if exists tickets_select_all on public.ticket_transactions;
drop policy if exists "Read tickets (own; everyone's in the friends edition)" on public.ticket_transactions;
drop policy if exists "Read tickets (own; by privacy setting)" on public.ticket_transactions;
create policy "Read tickets (own; by privacy setting)" on public.ticket_transactions
  for select using (auth.uid() = user_id or public.can_view(user_id, 'tickets'));

drop policy if exists "Signed-in users can read play sessions" on public.play_sessions;
drop policy if exists "Read play sessions (own; everyone's in the friends edition)" on public.play_sessions;
drop policy if exists "Read play sessions (own; by privacy setting)" on public.play_sessions;
create policy "Read play sessions (own; by privacy setting)" on public.play_sessions
  for select using (auth.uid() = user_id or public.can_view(user_id, 'activity'));

drop policy if exists games_select_all on public.games;
drop policy if exists "Read games (signed in; anyone in the public edition)" on public.games;
drop policy if exists "Read games (own; by privacy setting)" on public.games;
create policy "Read games (own; by privacy setting)" on public.games
  for select using (auth.uid() = user_id or public.can_view(user_id, 'games'));

drop policy if exists users_read_all_achievements on public.user_achievements;
drop policy if exists "Read achievements (own; by privacy setting)" on public.user_achievements;
create policy "Read achievements (own; by privacy setting)" on public.user_achievements
  for select using (auth.uid() = user_id or public.can_view(user_id, 'achievements'));

-- ── Check ───────────────────────────────────────────────────────────────────
-- Expect exactly one SELECT-capable rule per table below, each "… by privacy
-- setting" (games also has its own-row insert/update/delete rules, which
-- don't show here). Anything else listed would also let rows through.
select c.relname as table_name, p.polname as rule
  from pg_policy p join pg_class c on c.oid = p.polrelid
 where c.relname in ('games', 'play_sessions', 'ticket_transactions', 'user_achievements')
   and p.polcmd in ('r', '*')
 order by 1, 2;
