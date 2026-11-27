-- Pays the tracked hours played so far: 1 ticket per 25 hours (run ONCE per
-- project, after db/hours-tickets.sql, in its own run).
--
-- For each player who has no `hours_played` tickets yet, their tracked play
-- sessions on games the wheel didn't pick (games.assigned_by is null) are fed
-- through add_hours_progress oldest first, exactly as the tracker would have,
-- so each ticket is credited to the game whose session crossed 25 hours and
-- the remainder is left on the counter. Sessions on deleted games don't count.
--
-- The daily cap is the public edition's (8 hours a UK day); the friends
-- edition has none. Running it again does nothing for anyone already paid.

do $$
declare
  v_cap integer := case when public.edition_is_public() then 8 * 60 else null end;
  p record;
  s record;
begin
  for p in
    select pr.id
      from public.profiles pr
     where not exists (
       select 1 from public.ticket_transactions t
        where t.user_id = pr.id and t.reason::text = 'hours_played'
     )
  loop
    for s in
      select ps.game_id, ps.started_at, ps.applied_hours
        from public.play_sessions ps
        join public.games g on g.id = ps.game_id
       where ps.user_id = p.id
         and g.assigned_by is null
         and ps.applied_hours > 0
       order by ps.started_at, ps.id
    loop
      perform public.add_hours_progress(
        p.id, s.game_id, round(s.applied_hours * 60)::integer,
        v_cap, (s.started_at at time zone 'Europe/London')::date
      );
    end loop;
  end loop;
end $$;
