-- Marks this database as the FRIENDS edition's. Run this on the friends
-- Supabase project only, before db/batch3.sql (which refuses to run until the
-- edition is set). Safe to re-run.
--
-- The database rules added in db/batch3.sql read this setting: the friends
-- edition keeps letting every signed-in user read everyone's tickets, play
-- sessions and wheel history, as the site is built around. Any database
-- WITHOUT this setting is treated as the public edition (locked down), so a
-- forgotten setting can never expose data.
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security; -- no policies: read through edition_is_public() only

insert into public.app_settings (key, value) values ('edition', 'friends')
on conflict (key) do update set value = excluded.value;

select * from public.app_settings;
