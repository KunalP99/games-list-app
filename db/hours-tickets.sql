-- Tickets from play time, and the wheel's "Main Game" lock.
--
-- Run on BOTH projects (friends and public), in the SQL editor, before the
-- code that uses it is deployed. Safe to run more than once. Then, on the
-- friends project only:
--   db/ambient-to-playing.sql      (Ambient games become Playing)
-- and on both, once, AFTER this file (a separate run: Postgres won't use a
-- ticket reason added in the same transaction):
--   db/hours-tickets-backfill.sql  (pays the tracked hours played so far)
--
-- What it adds:
--   * Ticket reasons: `hours_played` (1 per 25 tracked hours, never taken
--     back) and `hours_typed` (paid at completion for hours that were never
--     tracked, taken back with the completion).
--   * profiles.hours_ticket_minutes: the running counter towards the next
--     ticket; hours_ticket_day / hours_ticket_day_minutes for the public
--     edition's daily cap.
--   * games.locks_wheel: a wheel game won from now on locks the wheel until
--     it's completed, DNF'd or deleted (the friends edition).
--   * add_hours_progress(): adds tracked minutes to the counter and pays the
--     tickets, in one step (service role only).
--   * A trigger so only the server can set games.assigned_by (marks a wheel
--     game, which decides how its hours pay) and games.locks_wheel.

-- ── Ticket reasons ──────────────────────────────────────────────────────────
alter type public.ticket_reason add value if not exists 'hours_played';
alter type public.ticket_reason add value if not exists 'hours_typed';

-- ── Columns ─────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists hours_ticket_minutes integer not null default 0;
alter table public.profiles add column if not exists hours_ticket_day date;
alter table public.profiles add column if not exists hours_ticket_day_minutes integer not null default 0;
alter table public.games add column if not exists locks_wheel boolean not null default false;

-- ── Only the server marks wheel games ───────────────────────────────────────
-- games.assigned_by says the wheel picked a game, and wheel games don't earn
-- tickets from their tracked hours; games.locks_wheel holds the wheel until
-- the game is finished. Both are written by the server (service role). A
-- browser user's insert can't set them, and an update keeps what was there.
create or replace function public.guard_wheel_columns()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.assigned_by := null;
      new.locks_wheel := false;
    else
      new.assigned_by := old.assigned_by;
      new.locks_wheel := old.locks_wheel;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_wheel_columns on public.games;
create trigger guard_wheel_columns
  before insert or update on public.games
  for each row execute function public.guard_wheel_columns();

-- ── Hours towards tickets ───────────────────────────────────────────────────
-- Adds tracked minutes to the player's counter and pays 1 ticket per 25 hours
-- (1,500 minutes), credited to the game whose minutes crossed the line; the
-- rest carries over. With a daily cap (the public edition), only that many
-- minutes count per UK day (`p_day`). Locks the profile, so two checkpoints
-- at once can't both pay the same ticket. Returns the tickets paid.
create or replace function public.add_hours_progress(
  p_user_id uuid,
  p_game_id uuid,
  p_minutes integer,
  p_daily_cap_minutes integer default null,
  p_day date default null
)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_counter integer;
  v_day date;
  v_day_minutes integer;
  v_add integer := greatest(coalesce(p_minutes, 0), 0);
  v_total integer;
  v_tickets integer;
begin
  select hours_ticket_minutes, hours_ticket_day, hours_ticket_day_minutes
    into v_counter, v_day, v_day_minutes
    from public.profiles
   where id = p_user_id
   for update;
  if not found then
    return 0;
  end if;

  if p_daily_cap_minutes is not null then
    if v_day is distinct from p_day then
      v_day := p_day;
      v_day_minutes := 0;
    end if;
    v_add := least(v_add, greatest(p_daily_cap_minutes - v_day_minutes, 0));
    v_day_minutes := v_day_minutes + v_add;
  end if;

  v_total := v_counter + v_add;
  v_tickets := v_total / 1500;

  update public.profiles
     set hours_ticket_minutes = v_total % 1500,
         hours_ticket_day = v_day,
         hours_ticket_day_minutes = v_day_minutes
   where id = p_user_id;

  for i in 1..v_tickets loop
    perform public.award_tickets(p_user_id, 1, 'hours_played', p_game_id, null);
  end loop;
  return v_tickets;
end;
$$;

revoke execute on function public.add_hours_progress(uuid, uuid, integer, integer, date) from public, anon, authenticated;
grant execute on function public.add_hours_progress(uuid, uuid, integer, integer, date) to service_role;

-- ── Completion reversal also takes back typed-hour tickets ──────────────────
-- Same as db/review-fixes.sql, with `hours_typed` added: tickets paid at
-- completion for hours that were never tracked go when the completion does
-- (un-completed, deleted, or edited and paid again). `hours_played` (tracked
-- play) is never taken back. Keep in step with COMPLETION_TICKET_REASONS in
-- lib/game-quick-actions.ts.
create or replace function public.reverse_game_completion_tickets(p_user_id uuid, p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_total integer;
begin
  with removed as (
    delete from public.ticket_transactions
     where user_id = p_user_id
       and game_id = p_game_id
       and reason::text in (
         'game_completed_short', 'game_completed_medium', 'game_completed_long',
         'game_completed_bonus_hours', 'achievement_100_percent',
         'sequel_back_to_back', 'series_back_to_back', 'hours_typed'
       )
    returning amount
  )
  select coalesce(sum(amount), 0) into v_total from removed;

  if v_total <> 0 then
    update public.profiles set ticket_balance = ticket_balance - v_total where id = p_user_id;
  end if;
end;
$$;

revoke execute on function public.reverse_game_completion_tickets(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reverse_game_completion_tickets(uuid, uuid) to service_role;

-- ── Which copy gets tracked hours ───────────────────────────────────────────
-- When a game is both the Main Game (a new copy the wheel added) and another
-- Playing copy (its multiplayer, say), the tracker gives the hours to the
-- Main Game, unless its owner picked a copy on the game's page ("Count
-- tracked hours here"), which sets this. The owner may set it on their own
-- games (an ordinary column; it changes no tickets by itself).
alter table public.games add column if not exists tracks_hours boolean not null default false;
