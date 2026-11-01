-- Let friends see "currently playing", not just the owner.
--
-- play_sessions' only existing policy ("Users read own sessions") was written
-- for the agent's own dedupe read on a checkpoint, scoped to the owner. The
-- live "Playing now" badge needs a friend's page load to read someone else's
-- in-progress session too -- and that is already how every other visible
-- field works here: games_select_all lets any authenticated user read any
-- game row (status, hours, rating, everything). This makes play_sessions
-- match that, rather than being the one quietly narrower table.
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run.

DROP POLICY IF EXISTS "Users read own sessions" ON public.play_sessions;

CREATE POLICY "Signed-in users can read play sessions" ON public.play_sessions
  FOR SELECT USING (auth.role() = 'authenticated');
