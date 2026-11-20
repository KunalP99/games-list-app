-- Merge a game the desktop tracker added by mistake into the game it should
-- have counted as (e.g. it filed "Grand Theft Auto IV" for someone who owns
-- "Grand Theft Auto IV: Complete Edition"). Moves the extra game's play
-- sessions, hours, Steam app id and exe links onto the game to keep, then
-- deletes the extra one. Run in the Supabase SQL editor. Close the game first,
-- so the tracker isn't mid-session on the row being removed.

-- STEP 1 — find the two games and copy their ids (run on its own).
select p.username, g.id, g.title, g.status, g.hours_played, g.steam_appid, g.igdb_id, g.created_at
  from public.games g join public.profiles p on p.id = g.user_id
 where g.title ilike '%grand theft auto iv%'        -- change to match your game
 order by p.username, g.created_at;

-- STEP 2 — paste the two ids below, then run this block.
do $$
declare
  keep_id   uuid := 'PASTE-THE-GAME-TO-KEEP';      -- e.g. the Complete Edition
  remove_id uuid := 'PASTE-THE-EXTRA-GAME';        -- the one the tracker added
  k public.games%rowtype;
  r public.games%rowtype;
begin
  select * into k from public.games where id = keep_id for update;
  select * into r from public.games where id = remove_id for update;
  if k.id is null or r.id is null then raise exception 'One of the ids wasn''t found.'; end if;
  if k.id = r.id then raise exception 'Those are the same game.'; end if;
  if k.user_id <> r.user_id then raise exception 'The two games belong to different people.'; end if;
  -- Only a tracker-added row: Playing/Ambient, never completed or dropped,
  -- so there are no tickets, completion rewards or wheel state to unpick.
  if r.status not in ('playing', 'ambient') then
    raise exception 'The game to remove is %, not Playing or Ambient; not merging.', r.status;
  end if;
  if exists (select 1 from public.ticket_transactions where game_id = remove_id) then
    raise exception 'The game to remove has ticket history; not merging.';
  end if;

  update public.play_sessions set game_id = keep_id where game_id = remove_id;

  update public.games
     set hours_played = coalesce(k.hours_played, 0) + coalesce(r.hours_played, 0),
         steam_appid  = coalesce(r.steam_appid, k.steam_appid),
         updated_at   = now()
   where id = keep_id;

  -- Exe links: move them across, unless the kept game already has the same one.
  delete from public.game_executables e
   where e.game_id = remove_id
     and exists (select 1 from public.game_executables x
                  where x.game_id = keep_id and x.user_id = e.user_id
                    and x.exe_name = e.exe_name and x.path_suffix is not distinct from e.path_suffix);
  update public.game_executables set game_id = keep_id where game_id = remove_id;

  delete from public.games where id = remove_id;
  raise notice 'Merged "%" into "%": % hours now, Steam app %.',
    r.title, k.title, coalesce(k.hours_played, 0) + coalesce(r.hours_played, 0), coalesce(r.steam_appid, k.steam_appid);
end $$;
