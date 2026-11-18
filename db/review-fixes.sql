-- Code review batch 2 (reviews: the "GamesList Code Review — Fix Checklist" doc).
--
-- Run on BOTH Supabase projects (friends and public), and locally in Studio
-- (http://127.0.0.1:54323). Safe to re-run.
--
-- ORDER — IMPORTANT. This file has two parts:
--   PART A — run BEFORE deploying the batch 2 code. It only adds functions;
--            the code that is live now doesn't use them, so nothing changes.
--   deploy the batch 2 code
--   PART B — run AFTER the deploy. It stops users writing achievement rows
--            themselves. Run before the deploy, the old code (which unlocks
--            achievements through the user's own session) would stop
--            unlocking them.
--
-- Like db/security-hardening.sql, the GRANT/REVOKE lines here are not carried
-- by `npm run db:dump && npm run db:migration` (--no-privileges): re-run this
-- file locally after every `npm run db:reset`.

-- ════════════════════════════════════════════════════════════════════════════
-- PART A — before deploying
-- ════════════════════════════════════════════════════════════════════════════

-- ── SEC-002: unlocking an achievement and its XP happen together, once ──────
-- Inserts the achievement and, only if it wasn't already unlocked, adds its
-- XP. The unique (user_id, achievement_id) constraint makes a repeat a no-op.
-- Returns whether this call unlocked it.
create or replace function public.unlock_achievement(p_user_id uuid, p_achievement_id text, p_xp integer)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.user_achievements (user_id, achievement_id)
  values (p_user_id, p_achievement_id)
  on conflict (user_id, achievement_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;
  if p_xp > 0 then
    update public.profiles set xp = xp + p_xp where id = p_user_id;
  end if;
  return true;
end;
$$;

-- ── BUG-002: spending tickets checks the balance under a lock ───────────────
-- The wheel's paid actions used to check the balance, then spend, as two
-- separate steps; two at once could both pass the check. This locks the
-- profile row, checks, and spends (through award_tickets, in the same
-- transaction, so the ledger row is identical to before). Returns false, and
-- spends nothing, when the balance is too low.
create or replace function public.spend_tickets(p_user_id uuid, p_amount integer, p_reason public.ticket_reason, p_note text default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    raise exception 'spend_tickets: amount must be positive';
  end if;
  select ticket_balance into v_balance from public.profiles where id = p_user_id for update;
  if v_balance is null or v_balance < p_amount then
    return false;
  end if;
  perform public.award_tickets(p_user_id, -p_amount, p_reason, null, p_note);
  return true;
end;
$$;

-- ── BUG-003: tracked hours are added in one step ─────────────────────────────
-- hours_played = hours_played + delta in a single statement, so two
-- checkpoints at once (two PCs, or a retry) can't overwrite each other's
-- hours. Only Playing/Ambient games, as before. Returns the new total, or null
-- when the game isn't (or is no longer) trackable.
create or replace function public.add_game_hours(p_user_id uuid, p_game_id uuid, p_delta numeric)
returns numeric
language sql security definer set search_path = public
as $$
  update public.games
     set hours_played = round(coalesce(hours_played, 0) + p_delta, 1)
   where id = p_game_id
     and user_id = p_user_id
     and status in ('playing', 'ambient')
  returning hours_played;
$$;

-- ── BUG-005: reversals remove only what they say, and only once ─────────────
-- Completion reversal used to delete EVERY ledger row linked to the game, not
-- just the completion ones. Both reversals also summed the rows and deleted
-- them as separate steps, so two at once could subtract the same tickets
-- twice; the sum now comes from the rows each call actually deleted.
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
       and reason in (
         'game_completed_short', 'game_completed_medium', 'game_completed_long',
         'game_completed_bonus_hours', 'achievement_100_percent',
         'sequel_back_to_back', 'series_back_to_back'
       )
    returning amount
  )
  select coalesce(sum(amount), 0) into v_total from removed;

  if v_total <> 0 then
    update public.profiles set ticket_balance = ticket_balance - v_total where id = p_user_id;
  end if;
end;
$$;

create or replace function public.reverse_game_dnf_tickets(p_user_id uuid, p_game_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_sum integer;
begin
  with removed as (
    delete from public.ticket_transactions
     where user_id = p_user_id and game_id = p_game_id and reason = 'assigned_game_incomplete'
    returning amount
  )
  select coalesce(sum(amount), 0) into v_sum from removed;

  if v_sum <> 0 then
    update public.profiles set ticket_balance = ticket_balance - v_sum where id = p_user_id;
  end if;
end;
$$;

-- ── Service role only, like the other ticket/XP functions ───────────────────
-- They take a user id as a plain argument, so the browser roles must not be
-- able to call them (db/security-hardening.sql, C1).
revoke execute on function public.unlock_achievement(uuid, text, integer)                     from public, anon, authenticated;
revoke execute on function public.spend_tickets(uuid, integer, public.ticket_reason, text)    from public, anon, authenticated;
revoke execute on function public.add_game_hours(uuid, uuid, numeric)                         from public, anon, authenticated;
revoke execute on function public.reverse_game_completion_tickets(uuid, uuid)                 from public, anon, authenticated;
revoke execute on function public.reverse_game_dnf_tickets(uuid, uuid)                        from public, anon, authenticated;
grant  execute on function public.unlock_achievement(uuid, text, integer)                     to service_role;
grant  execute on function public.spend_tickets(uuid, integer, public.ticket_reason, text)    to service_role;
grant  execute on function public.add_game_hours(uuid, uuid, numeric)                         to service_role;
grant  execute on function public.reverse_game_completion_tickets(uuid, uuid)                 to service_role;
grant  execute on function public.reverse_game_dnf_tickets(uuid, uuid)                        to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- PART B — after deploying the batch 2 code
-- ════════════════════════════════════════════════════════════════════════════

-- ── SEC-002: users can read achievements, never write them ──────────────────
-- "Users manage own achievements" allowed insert/update/delete too: deleting
-- your own row let the next action unlock it again and award its XP again,
-- without limit, and any badge could be inserted by hand. Unlocks now go
-- through unlock_achievement (service role). Reading stays as it was
-- (users_read_all_achievements).
drop policy if exists "Users manage own achievements" on public.user_achievements;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- Expect anon = false, authed = false, service = true on every row.
select p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') as service
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('unlock_achievement', 'spend_tickets', 'add_game_hours',
                    'reverse_game_completion_tickets', 'reverse_game_dnf_tickets');

-- Expect only users_read_all_achievements (a SELECT policy).
select polname, polcmd from pg_policy where polrelid = 'public.user_achievements'::regclass;
