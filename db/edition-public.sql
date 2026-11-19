-- Marks this database as the PUBLIC edition's. Run this on the public Supabase
-- project only, before db/batch3.sql. Safe to re-run. (A database with no
-- setting at all is already treated as public; this just makes it explicit.)
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values ('edition', 'public')
on conflict (key) do update set value = excluded.value;

select * from public.app_settings;
