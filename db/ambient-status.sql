-- Ambient games: a fifth status for ongoing games outside the wheel.
--
-- Multiplayer and sandbox games never "complete", so they do not belong in the
-- wheel's journey of pick -> play -> finish -> tickets. The desktop agent adds
-- them on its own and logs their hours; they get their own tab and their own
-- "recently played" strip, and they never award completion tickets or advance
-- a turn.
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run.

-- A CHECK constraint cannot be widened in place, so it is dropped and rebuilt.
-- Existing rows all hold one of the original four values, so the rebuild
-- validates without touching anything.
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_status_check;

ALTER TABLE public.games ADD CONSTRAINT games_status_check
  CHECK (status = ANY (ARRAY['playing'::text, 'completed'::text, 'backlog'::text, 'dnf'::text, 'ambient'::text]));

-- Resolves a Steam app id to its IGDB game, so a detected game can be
-- identified exactly rather than guessed at from its executable name.
--
-- Deliberately NOT per-user: a Steam app is the same game for everybody, so one
-- lookup serves every account. igdb_id IS NULL on a checked row is a real
-- answer, not a gap -- it means IGDB has no such game, which is how Blender,
-- Wallpaper Engine and the Steamworks redistributables are told apart from
-- games without anyone maintaining a list of them by hand.
CREATE TABLE IF NOT EXISTS public.steam_game_ids (
  steam_appid INTEGER PRIMARY KEY,
  igdb_id     INTEGER,
  name        TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.steam_game_ids ENABLE ROW LEVEL SECURITY;

-- Readable by any signed-in user (it is public catalogue data, not anyone's
-- library); written only by the service role, from the agent's identify route.
DROP POLICY IF EXISTS "Signed-in users can read steam ids" ON public.steam_game_ids;
CREATE POLICY "Signed-in users can read steam ids" ON public.steam_game_ids
  FOR SELECT USING (auth.uid() IS NOT NULL);
