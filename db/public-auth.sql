-- Secure sign-up and chosen usernames (public edition, lib/edition.ts `secureAuth`).
--
-- Run on BOTH Supabase projects (friends and public) so their schemas stay the
-- same. Everything here is additive or keeps the friends edition's behaviour:
-- its sign-ups send no username, so they still get the email's local part as
-- before; the one difference is that a clash now gets a short suffix instead
-- of failing the whole sign-up.
--
-- Before running on a database with existing users, check nothing differs
-- only by case (the new unique index would fail):
--   select lower(username), count(*) from public.profiles group by 1 having count(*) > 1;

-- Whether the user picked their username. Existing users count as having
-- chosen; sign-ups that didn't send one (Google/Discord, the friends edition)
-- get false, and the public edition then asks them to pick one (/welcome).
alter table public.profiles add column if not exists username_chosen boolean not null default true;

-- When the username last changed, for the 30-day cooldown (lib/username.ts).
alter table public.profiles add column if not exists username_changed_at timestamptz;

-- "Kunal" and "kunal" are the same username.
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- Old usernames, so profile links shared before a rename still lead somewhere.
create table if not exists public.username_redirects (
  old_username text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.username_redirects enable row level security;
drop policy if exists "Signed-in users read username redirects" on public.username_redirects;
create policy "Signed-in users read username redirects" on public.username_redirects
  for select to authenticated using (true);
-- No insert/update/delete policies: written by the server (service role) only.

-- The sign-up trigger. A valid, free, not-reserved `username` in the sign-up
-- metadata is used as chosen (the public edition's sign-up form sends one; the
-- same rules as validateUsername in lib/username.ts). Otherwise the email's
-- local part, exactly as before, with a short random suffix if that's taken,
-- marked not chosen, so the public edition asks for a username at /welcome.
--
-- The reserved list is checked here too, not only by the form and server
-- action: anyone can call Supabase's sign-up directly with the public anon key
-- and skip both. Keep these two lists in step with RESERVED_USERNAMES and the
-- abuse words in lib/username.ts (lib/__tests__/username-sql.test.ts checks).
-- The deployment's brand name is reserved by the app only.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer
  set search_path = public
as $$
declare
  wanted text := lower(nullif(trim(new.raw_user_meta_data->>'username'), ''));
  base text := split_part(coalesce(new.email, ''), '@', 1);
  candidate text;
  chosen boolean := false;
begin
  if wanted is not null
     and wanted ~ '^[a-z][a-z0-9_]{2,19}$'
     and not (wanted = any (array[
       'admin', 'administrator', 'root', 'api', 'auth', 'login', 'logout', 'signin', 'signup', 'register',
       'settings', 'dashboard', 'games', 'game', 'users', 'user', 'stats', 'tickets', 'ticket', 'welcome',
       'achievements', 'activity', 'wheel', 'videos', 'notifications', 'download', 'privacy', 'terms',
       'about', 'help', 'support', 'contact', 'reset', 'password', 'forgot', 'callback', 'new', 'edit',
       'null', 'undefined', 'me', 'you', 'everyone', 'anonymous', 'unknown',
       'staff', 'mod', 'mods', 'moderator', 'system', 'official', 'team', 'owner', 'bot',
       'gameslist', 'games_list', 'untitled',
       'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut', 'nazi', 'hitler'
     ]))
     and wanted !~ '(fuck|shit|cunt|nigger|nigga|faggot|retard|whore|nazi|hitler)'
     and not exists (select 1 from public.profiles p where lower(p.username) = wanted) then
    candidate := wanted;
    chosen := true;
  else
    if base = '' then base := 'player'; end if;
    candidate := base;
    while exists (select 1 from public.profiles p where lower(p.username) = lower(candidate)) loop
      candidate := left(base, 14) || '_' || substr(md5(random()::text), 1, 5);
    end loop;
  end if;

  insert into public.profiles (id, username, display_name, username_chosen)
  values (
    new.id,
    candidate,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'name'), ''),
      candidate
    ),
    chosen
  );
  return new;
end; $$;
