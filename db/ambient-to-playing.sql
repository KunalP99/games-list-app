-- Friends project only, once: Ambient games become Playing.
--
-- The friends edition no longer has an Ambient status: everything being
-- played is Playing, and games the wheel picked are shown on their own as the
-- Main Game. Hours, dates and everything else stay as they are.
update public.games set status = 'playing' where status = 'ambient';
