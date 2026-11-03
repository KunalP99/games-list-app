-- Security hardening — code review findings C1 and C2 (reviews/website-code-review.md).
--
-- WHAT IT DOES
--   C1  The ticket/XP functions are SECURITY DEFINER and take a user id as a
--       plain argument, so anyone holding the public anon key could call them
--       from a browser console and mint (or wipe) tickets for any user. Only
--       the service role may execute them now; the app calls them server-side
--       through createAdminClient().
--   C2  profiles_update_own scoped *rows* but not *columns*, so a user could
--       set their own is_admin / ticket_balance / wheel_turn. Browser roles may
--       now update only the profile columns granted below. Wheel state and
--       balances are written server-side through the service role.
--       Also drops tickets_insert_own, which let users insert fake ledger rows.
--
-- ORDER — IMPORTANT
--   1. Deploy the matching app code first (it works under old and new
--      permissions alike, because the service role can do everything).
--   2. Then run this file in the Supabase dashboard SQL editor (production),
--      and in local Studio (http://127.0.0.1:54323) for the local stack.
--   Running it before the code deploy breaks ticket and wheel actions until
--   the deploy lands.
--
-- NOTE ON THE LOCAL STACK
--   scripts/dump-schema.mjs dumps with --no-privileges, so these GRANT/REVOKE
--   statements are NOT captured by `npm run db:dump && npm run db:migration`.
--   Re-run this file locally after every `npm run db:reset`.
--
-- Safe to re-run.

-- ── C1: ticket / XP functions — service role only ──────────────────────────
-- Postgres grants EXECUTE to PUBLIC by default, and Supabase also grants it to
-- anon/authenticated explicitly, so all three must be revoked. service_role is
-- granted explicitly afterwards so it never depends on the PUBLIC grant.

REVOKE EXECUTE ON FUNCTION public.award_tickets(uuid, integer, public.ticket_reason, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, integer)                                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_game_completion_tickets(uuid, uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_game_dnf_tickets(uuid, uuid)                        FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.award_tickets(uuid, integer, public.ticket_reason, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_xp(uuid, integer)                                    TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_game_completion_tickets(uuid, uuid)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_game_dnf_tickets(uuid, uuid)                        TO service_role;

-- SECURITY DEFINER functions should not resolve table names through the
-- caller's search_path (reverse_game_completion_tickets uses unqualified names).
ALTER FUNCTION public.award_tickets(uuid, integer, public.ticket_reason, uuid, text) SET search_path = public;
ALTER FUNCTION public.award_xp(uuid, integer)                                    SET search_path = public;
ALTER FUNCTION public.reverse_game_completion_tickets(uuid, uuid)                 SET search_path = public;
ALTER FUNCTION public.reverse_game_dnf_tickets(uuid, uuid)                        SET search_path = public;

-- ── C2: profiles — column-level update rights ──────────────────────────────
-- The row policy (profiles_update_own) stays; this narrows which columns it
-- can touch. Any column not granted here can only be changed server-side.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

-- Only what the Settings page writes with the user's own session:
--   display_name                    — updateProfile
--   theme_preference, accent_colour — updateAppearance
-- Everything else (is_admin, ticket_balance, xp, wheel_*, username, …) is
-- server-side only. Adding a column here makes it editable by its owner from
-- the browser console, so only add purely cosmetic, self-owned fields.
GRANT UPDATE (display_name, theme_preference, accent_colour) ON public.profiles TO authenticated;

-- ── C2: ticket ledger — no direct inserts ──────────────────────────────────
-- Ledger rows are written only by award_tickets (service role). The only app
-- code that inserted directly was /api/admin/import-tickets, now removed.

DROP POLICY IF EXISTS tickets_insert_own ON public.ticket_transactions;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect anon = false, authed = false, service = true for all four rows.
SELECT p.proname,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
       has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('award_tickets', 'award_xp', 'reverse_game_completion_tickets', 'reverse_game_dnf_tickets');

-- Expect can_update = true only for the columns granted above.
SELECT column_name,
       has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') AS can_update
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY column_name;
