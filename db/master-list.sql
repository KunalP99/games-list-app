-- Master list of detectable games (reviews/master-list-plan.md, Phase 1).
--
-- Run once per database: production (Supabase dashboard -> SQL Editor) and/or
-- the local stack (http://127.0.0.1:54323 -> SQL Editor). After running it
-- against PRODUCTION, mirror it locally the usual way:
--   npm run db:dump && npm run db:migration && npm run db:reset
--
-- Safe to re-run. Does NOT drop global_exe_links — that is
-- db/drop-global-exe-links.sql, run last, once the new tracker is out.

-- The master list. One row per (source, path ending).
CREATE TABLE IF NOT EXISTS public.detectable_games (
  id                 BIGSERIAL PRIMARY KEY,
  path_suffix        TEXT NOT NULL,      -- 'tunic/tunic.exe': lowercase, '/' separators, no drive/user folders
  source             TEXT NOT NULL CHECK (source IN ('discord', 'admin')),
  name               TEXT NOT NULL,
  steam_appid        INTEGER,            -- from Discord's third_party_skus; resolves to IGDB via resolveSteamApp
  igdb_id            INTEGER,            -- set directly on admin rows; exact, preferred over steam_appid
  discord_id         TEXT,               -- Discord's own id, so re-imports update rather than duplicate
  approved_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_seen_import   TIMESTAMPTZ,        -- discord rows: when the weekly import last saw this entry
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, path_suffix)
);
CREATE INDEX IF NOT EXISTS detectable_games_suffix_idx ON public.detectable_games (path_suffix);
ALTER TABLE public.detectable_games ENABLE ROW LEVEL SECURITY;
-- No policies: read/written only by service-role routes (cron, agent API, admin actions).

-- Audit trail for the weekly import (also what the admin page shows as "last synced").
CREATE TABLE IF NOT EXISTS public.detectable_import_runs (
  id            BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT NOT NULL CHECK (status IN ('applied', 'rejected', 'failed')),
  entries_seen  INTEGER,
  rows_upserted INTEGER,
  rows_removed  INTEGER,
  note          TEXT          -- why it was rejected/failed
);
ALTER TABLE public.detectable_import_runs ENABLE ROW LEVEL SECURITY;

-- User-submitted links now remember where the exe lived (ending only).
ALTER TABLE public.game_executables ADD COLUMN IF NOT EXISTS path_suffix TEXT;

-- Queue items an admin has dismissed ("not a game" / "not worth listing").
CREATE TABLE IF NOT EXISTS public.detectable_dismissed (
  path_suffix  TEXT PRIMARY KEY,
  dismissed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.detectable_dismissed ENABLE ROW LEVEL SECURITY;

-- Verify:
--   SELECT source, count(*) FROM public.detectable_games GROUP BY source;
--   SELECT * FROM public.detectable_import_runs ORDER BY started_at DESC LIMIT 5;
