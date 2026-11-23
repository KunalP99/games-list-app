-- Profile cards and bio (public edition's profile page, FEATURES.newProfile).
--
-- Run on both projects. The friends edition's code never reads these columns,
-- so nothing changes there; running it keeps production the schema source.
-- Safe to run more than once.
--
-- profile_layout: the cards under the profile card, in order, as
--   [{ "card": "playing", "size": "half" }, …], with { "card": "empty", … }
--   entries for empty spaces kept between cards. NULL means "never edited"
--   (the default layout, lib/profile-cards.ts DEFAULT_LAYOUT). The app
--   normalises it on every save and every read (normaliseLayout), so the
--   check only stops something absurd being stored through the API.
-- bio: one or two lines on the profile card. Public, like the display name.

alter table public.profiles add column if not exists profile_layout jsonb;
alter table public.profiles add column if not exists bio text;

-- At most 40 entries (MAX_LAYOUT_ENTRIES): every card once plus empty spaces.
-- Dropped and re-added, so running this again also lifts the first
-- version's limit of 20.
alter table public.profiles drop constraint if exists profiles_profile_layout_check;
alter table public.profiles add constraint profiles_profile_layout_check
  check (profile_layout is null
         or (jsonb_typeof(profile_layout) = 'array' and jsonb_array_length(profile_layout) <= 40));

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_check') then
    alter table public.profiles add constraint profiles_bio_check
      check (bio is null or char_length(bio) <= 160);
  end if;
end $$;

-- People change their own layout and bio, like their display name. The page
-- saves through a server action (app/(app)/users/[username]/actions.ts) that
-- normalises both first.
grant update (profile_layout, bio) on public.profiles to authenticated;
