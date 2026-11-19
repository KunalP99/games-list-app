-- Code review batch 3. Run on BOTH Supabase projects, and locally in Studio.
-- Safe to re-run.
--
-- ORDER — IMPORTANT
--   0. db/edition-friends.sql (friends project) or db/edition-public.sql
--      (public project). PART A refuses to run until one of them has.
--   1. PART A — before deploying the batch 3 code. Adds tables and functions
--      the new code needs, and the per-edition read rules. On the friends
--      database nothing anyone can see changes.
--   2. Deploy the batch 3 code.
--   3. PART B — after the deploy. Makes wheel history read-only and moves the
--      last private notes out of the games table. Run before the deploy, the
--      old code couldn't record wheel turns or show private notes.
--
-- Like the other db/*.sql files, the GRANT/REVOKE lines aren't carried by
-- `npm run db:dump && npm run db:migration` until OPS-001 lands; re-run this
-- file locally after every `npm run db:reset`.

-- ════════════════════════════════════════════════════════════════════════════
-- PART A — before deploying
-- ════════════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.app_settings') is null
     or not exists (select 1 from public.app_settings where key = 'edition') then
    raise exception 'Set this database''s edition first: run db/edition-friends.sql (friends project) or db/edition-public.sql (public project).';
  end if;
end $$;

-- ── The edition, for the database's own rules ───────────────────────────────
-- True unless this database is explicitly the friends edition's, so a missing
-- setting locks things down rather than opening them up.
create or replace function public.edition_is_public()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select value from public.app_settings where key = 'edition'), 'public') <> 'friends';
$$;
grant execute on function public.edition_is_public() to anon, authenticated, service_role;

-- ── Completion rewards: what each completed game earned ─────────────────────
-- One row per completed game: its tickets and completion XP, whether it was an
-- untracked completion (the public edition's 5-a-day limit counts these), and
-- why (shown on the game's page). Written only by the server. It's what lets
-- completion XP be taken back when a game stops being completed — before,
-- completing → un-completing → completing added the XP every time.
create table if not exists public.completion_rewards (
  game_id uuid primary key references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  tickets integer not null default 0,
  xp integer not null default 0,
  untracked boolean not null default false,
  why text not null,
  awarded_at timestamptz not null default now()
);
create index if not exists completion_rewards_user_idx on public.completion_rewards (user_id, awarded_at desc);
alter table public.completion_rewards enable row level security;
drop policy if exists "Users read own completion rewards" on public.completion_rewards;
create policy "Users read own completion rewards" on public.completion_rewards
  for select using (auth.uid() = user_id);

-- Records a completion's reward and adds its XP. If the game somehow already
-- has one, its XP is taken off first, so XP is never counted twice.
create or replace function public.record_completion_reward(
  p_user_id uuid, p_game_id uuid, p_tickets integer, p_xp integer, p_untracked boolean, p_why text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old integer;
begin
  delete from public.completion_rewards where game_id = p_game_id and user_id = p_user_id
  returning xp into v_old;
  insert into public.completion_rewards (game_id, user_id, tickets, xp, untracked, why)
  values (p_game_id, p_user_id, p_tickets, p_xp, p_untracked, p_why);
  if coalesce(p_xp, 0) - coalesce(v_old, 0) <> 0 then
    update public.profiles set xp = xp + coalesce(p_xp, 0) - coalesce(v_old, 0) where id = p_user_id;
  end if;
end;
$$;

-- Takes back a completion's XP (its tickets are reversed by
-- reverse_game_completion_tickets). Only what the deleted row recorded, once.
-- Completions from before batch 3 have no row, so nothing is taken back for
-- them: their XP was never recorded per game.
create or replace function public.reverse_completion_reward(p_user_id uuid, p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_xp integer;
begin
  delete from public.completion_rewards where game_id = p_game_id and user_id = p_user_id
  returning xp into v_xp;
  if coalesce(v_xp, 0) <> 0 then
    update public.profiles set xp = xp - v_xp where id = p_user_id;
  end if;
end;
$$;

revoke execute on function public.record_completion_reward(uuid, uuid, integer, integer, boolean, text) from public, anon, authenticated;
revoke execute on function public.reverse_completion_reward(uuid, uuid)                                 from public, anon, authenticated;
grant  execute on function public.record_completion_reward(uuid, uuid, integer, integer, boolean, text) to service_role;
grant  execute on function public.reverse_completion_reward(uuid, uuid)                                 to service_role;

-- ── Private notes: readable by their owner only ─────────────────────────────
-- games rows are readable by other users, and the database's rules work on
-- whole rows, so a private note in games.notes was readable by anyone signed
-- in even though the site hid it. Private notes now live here instead; public
-- notes stay in games.notes. This copies the current private notes across;
-- PART B copies any written since and clears them from games.
create table if not exists public.game_private_notes (
  game_id uuid primary key references public.games(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notes text not null,
  updated_at timestamptz not null default now()
);
alter table public.game_private_notes enable row level security;
drop policy if exists "Users manage own private notes" on public.game_private_notes;
-- The game must be yours too, not just the note: game_id is the key, so a note
-- someone else put on your game would block you from ever saving one.
create policy "Users manage own private notes" on public.game_private_notes
  for all using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.games g where g.id = game_id and g.user_id = auth.uid())
  );

insert into public.game_private_notes (game_id, user_id, notes)
select id, user_id, notes from public.games
 where notes_public = false and notes is not null and btrim(notes) <> ''
on conflict (game_id) do update set notes = excluded.notes, updated_at = now();

-- ── Who can read what (SEC-003) ─────────────────────────────────────────────
-- Friends edition: exactly as before (every signed-in user reads everyone's
-- tickets, play sessions and wheel history; the site is built around that).
-- Public edition: those are your own only, until a friends system exists.
-- Games: signed-in users in both; in the public edition also logged-out
-- visitors, ready for public profile pages (private notes are no longer in
-- the row). Profiles stay readable by anyone, as before, for the same reason.

drop policy if exists tickets_select_all on public.ticket_transactions;
drop policy if exists "Read tickets (own; everyone's in the friends edition)" on public.ticket_transactions;
create policy "Read tickets (own; everyone's in the friends edition)" on public.ticket_transactions
  for select using (
    auth.uid() = user_id
    or (auth.role() = 'authenticated' and not public.edition_is_public())
  );

drop policy if exists "Signed-in users can read play sessions" on public.play_sessions;
drop policy if exists "Read play sessions (own; everyone's in the friends edition)" on public.play_sessions;
create policy "Read play sessions (own; everyone's in the friends edition)" on public.play_sessions
  for select using (
    auth.uid() = user_id
    or (auth.role() = 'authenticated' and not public.edition_is_public())
  );

drop policy if exists "Users can read all wheel spins" on public.wheel_spins;
drop policy if exists "Read wheel history (own; everyone's in the friends edition)" on public.wheel_spins;
create policy "Read wheel history (own; everyone's in the friends edition)" on public.wheel_spins
  for select using (
    auth.uid() = user_id
    or (auth.role() = 'authenticated' and not public.edition_is_public())
  );

drop policy if exists games_select_all on public.games;
drop policy if exists "Read games (signed in; anyone in the public edition)" on public.games;
create policy "Read games (signed in; anyone in the public edition)" on public.games
  for select using (auth.role() = 'authenticated' or public.edition_is_public());

-- ════════════════════════════════════════════════════════════════════════════
-- PART B — after deploying the batch 3 code
-- ════════════════════════════════════════════════════════════════════════════

-- ── SEC-006: wheel history is read-only for users ───────────────────────────
-- The server records every turn (app/(app)/wheel/actions.ts); users could
-- edit or delete their own history rows directly before this.
drop policy if exists "Users manage own wheel spins" on public.wheel_spins;

-- ── Private notes: the last copy, then out of games for good ────────────────
insert into public.game_private_notes (game_id, user_id, notes)
select id, user_id, notes from public.games
 where notes_public = false and notes is not null and btrim(notes) <> ''
on conflict (game_id) do update set notes = excluded.notes, updated_at = now();

update public.games set notes = null where notes_public = false and notes is not null;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect the edition you set, and 0 private notes left in games.
select (select value from public.app_settings where key = 'edition') as edition,
       public.edition_is_public() as treated_as_public,
       (select count(*) from public.games where notes_public = false and notes is not null) as private_notes_left_in_games,
       (select count(*) from public.game_private_notes) as private_notes;
