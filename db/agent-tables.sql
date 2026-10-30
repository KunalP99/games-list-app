-- Tables for the desktop play-tracking app.
--
-- Run this once per database: production (Supabase dashboard -> SQL Editor)
-- and/or the local stack (http://127.0.0.1:54323 -> SQL Editor).
--
-- After running it against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run: every statement is IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own devices" ON public.device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.play_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  device_id UUID REFERENCES public.device_tokens(id) ON DELETE SET NULL,
  client_session_id TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 0),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  applied_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
  last_checkpoint_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_session_id)
);
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own sessions" ON public.play_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS play_sessions_user_idx ON public.play_sessions (user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.game_executables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  exe_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exe_name)
);
ALTER TABLE public.game_executables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own exe links" ON public.game_executables
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.games ADD COLUMN IF NOT EXISTS steam_appid INTEGER;
CREATE INDEX IF NOT EXISTS games_steam_appid_idx
  ON public.games (user_id, steam_appid) WHERE steam_appid IS NOT NULL;
