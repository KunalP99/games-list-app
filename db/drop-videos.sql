-- Removes the Videos page's tables (the page itself was removed on 2026-11-19).
-- Nothing in the app reads or writes them any more. A game's own videos live
-- in games.youtube_videos and are NOT touched by this.
--
-- Run in the Supabase SQL editor, any time after the Videos page removal is
-- deployed (it is: 08d135c). This DELETES what's in them, for good.

-- 1. What's in them (run on its own first if you want to look; the Table
--    Editor can export either table as CSV before you drop it).
select
  (select count(*) from public.videos)    as videos,
  (select count(*) from public.playlists) as playlists;

-- 2. Drop them. No CASCADE on purpose: if anything unexpected still depended
--    on them, this stops with an error instead of quietly removing it too.
--    videos first (it points at playlists); their policies go with them.
begin;
drop table if exists public.videos;
drop table if exists public.playlists;
commit;
