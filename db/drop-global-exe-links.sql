-- Retire the old exe -> game catalog (reviews/master-list-plan.md, Decision 1:
-- start fresh). Replaced by detectable_games (db/master-list.sql).
--
-- Run LAST: only once the site no longer reads global_exe_links (it doesn't,
-- from the master-list release on) and the new desktop release is out. Older
-- trackers keep working without it — identify's lookupExe mode now reads
-- detectable_games instead.
--
-- Then: npm run db:dump && npm run db:migration && npm run db:reset

DROP TABLE IF EXISTS public.global_exe_links;
