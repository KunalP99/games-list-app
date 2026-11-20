-- Games played in emulators: what the tracker has learned each emulator title
-- is, per person (lib/emulators.ts, /api/agent/identify's `emulator` mode,
-- /api/agent/emulator-choice).
--
-- One emulator program runs every game, so emulated games can't use
-- game_executables. A row here says "on this console, this disc (serial) or
-- this name is that game in my library"; game_id NULL means "None of these":
-- stop asking about it.
--
-- Deleting the game deletes the row, so the tracker asks again rather than
-- treating a deleted game as "None of these".
--
-- Written only by the server (service role); people can read their own.
-- Run on both projects (friends and public), then locally. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.emulator_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform INTEGER NOT NULL,          -- IGDB platform id (7 PS1, 8 PS2, …)
  title_key TEXT NOT NULL,            -- 'serial:SLUS20946' or 'title:shadowofthecolossus'
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, platform, title_key)
);
ALTER TABLE public.emulator_titles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own emulator titles" ON public.emulator_titles;
CREATE POLICY "Users read own emulator titles" ON public.emulator_titles
  FOR SELECT USING (auth.uid() = user_id);
REVOKE INSERT, UPDATE, DELETE ON public.emulator_titles FROM anon, authenticated;
