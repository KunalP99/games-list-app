-- Executable links per folder: lets two games that run the same program name
-- (WoW Retail and WoW Forever both run Wow.exe, from _retail_\ and _forever_\)
-- each have their own link, told apart by `path_suffix`.
--
-- Run in TWO steps, in this order:
--   A. Now, before the website update deploys. Adds the per-folder rule
--      alongside the old per-name one, so nothing that's running breaks.
--   B. Once the website update is live on Vercel. Removes the old one-link-
--      per-name rule, which is what actually allows the second link.
-- Then: npm run db:dump && npm run db:migration (and db:reset locally).

-- ── A ────────────────────────────────────────────────────────────────────
-- NULLS NOT DISTINCT: a link with no folder (from an older tracker) still
-- counts once per exe name, rather than every folder-less row being "unique".
CREATE UNIQUE INDEX IF NOT EXISTS game_executables_user_exe_suffix_key
  ON public.game_executables (user_id, exe_name, path_suffix) NULLS NOT DISTINCT;

-- ── B (after the website deploy) ─────────────────────────────────────────
-- ALTER TABLE public.game_executables DROP CONSTRAINT IF EXISTS game_executables_user_id_exe_name_key;
