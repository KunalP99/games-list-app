-- Every permission rule the database relies on, in one place (OPS-001).
--
-- `npm run db:dump` uses pg_dump --no-privileges, so GRANT/REVOKE statements
-- never reach db/schema.sql or the generated migration. Without this file a
-- fresh database (a `db:reset`, or a new Supabase project built from the
-- migration) would let browser users call the ticket and XP functions and edit
-- any profile column. scripts/make-migration.mjs appends this file to the
-- migration it writes, so every database built from it is secure from the
-- start. It's also safe to run on its own, any number of times, on any
-- project: functions that don't exist yet in that database are skipped.
--
-- Adding a SECURITY DEFINER function that takes a user id? Add it to the list
-- below. (db/security-hardening.sql, review-fixes.sql and batch3.sql set the
-- same rules when run by hand.)

-- ── Server-only functions ───────────────────────────────────────────────────
-- They take a user id as a plain argument, so the browser roles (anon,
-- authenticated) must never call them; the app calls them through the service
-- role (createAdminClient).
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.award_tickets(uuid, integer, public.ticket_reason, uuid, text)',
    'public.award_xp(uuid, integer)',
    'public.reverse_game_completion_tickets(uuid, uuid)',
    'public.reverse_game_dnf_tickets(uuid, uuid)',
    'public.unlock_achievement(uuid, text, integer)',
    'public.spend_tickets(uuid, integer, public.ticket_reason, text)',
    'public.add_game_hours(uuid, uuid, numeric)',
    'public.record_completion_reward(uuid, uuid, integer, integer, boolean, text)',
    'public.reverse_completion_reward(uuid, uuid)',
    'public.take_rate_limit(uuid, text, integer, integer)',
    -- Friends system (db/friends.sql)
    'public.lock_pair(uuid, uuid)',
    'public.send_friend_request(uuid, uuid)',
    'public.respond_friend_request(uuid, uuid, boolean)',
    'public.cancel_friend_request(uuid, uuid)',
    'public.remove_friend(uuid, uuid)',
    'public.block_user(uuid, uuid)',
    'public.unblock_user(uuid, uuid)'
  ]
  loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
      execute format('grant execute on function %s to service_role', f);
      execute format('alter function %s set search_path = public', f);
    end if;
  end loop;
end $$;

-- Read by the database's own rules, so everyone may call it.
do $$
begin
  if to_regprocedure('public.edition_is_public()') is not null then
    grant execute on function public.edition_is_public() to anon, authenticated, service_role;
  end if;
  -- The friends system's read rules (db/friends.sql).
  if to_regprocedure('public.can_view(uuid, text)') is not null then
    grant execute on function public.are_friends(uuid, uuid) to anon, authenticated, service_role;
    grant execute on function public.is_blocked(uuid, uuid)  to anon, authenticated, service_role;
    grant execute on function public.can_view(uuid, text)    to anon, authenticated, service_role;
  end if;
end $$;

-- ── Profiles: users may change only cosmetic, self-owned columns ────────────
-- Everything else (is_admin, ticket_balance, xp, wheel state, username, …) is
-- written server-side through the service role.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, theme_preference, accent_colour) on public.profiles to authenticated;
-- Privacy settings (db/friends.sql), where that database has them.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'privacy_profile') then
    grant update (privacy_profile, privacy_games, privacy_achievements, privacy_activity, privacy_tickets)
      on public.profiles to authenticated;
  end if;
  -- Profile cards and bio (db/profile-cards.sql), where that database has them.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile_layout') then
    grant update (profile_layout, bio) on public.profiles to authenticated;
  end if;
end $$;

-- ── Ticket ledger: no direct inserts ────────────────────────────────────────
drop policy if exists tickets_insert_own on public.ticket_transactions;

-- ── Emulator titles (db/emulator-tracking.sql): server-written only ─────────
do $$
begin
  if to_regclass('public.emulator_titles') is not null then
    revoke insert, update, delete on public.emulator_titles from anon, authenticated;
  end if;
end $$;
