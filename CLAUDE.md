# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

The app is deployed to Vercel. **Do not push changes to GitHub unless explicitly asked.** Make all code changes locally first; the user will request a push when they are ready to deploy.

## Editions (friends / public)

One codebase runs two sites. The **friends** edition is the original app for Kunal and his friends; the **public** edition is the version being built for anyone. Each has its own Vercel project and its own Supabase project, and **a push to `main` deploys both** — so every change must leave the friends edition working exactly as before.

- **`lib/edition.ts`** is the one place that decides. `EDITION` comes from `NEXT_PUBLIC_EDITION` (only `public` means public; unset or anything else is friends, so an existing deployment never changes by accident). `FEATURES` says what each edition has (`wheel` is friends-only). `BRAND` is the name and tagline: `GamesList` for friends, `NEXT_PUBLIC_BRAND_NAME` (placeholder `Untitled`) for public. `NEXT_PUBLIC_` because client components read it; it's fixed at build time, which suits one build per Vercel project.
- **New public-only features** get a switch in `featuresFor`, off for friends unless deliberately turned on, and every surface checks it. Test both: `npm run env:dev` (friends) and `npm run env:dev-public` (the same local database, run as public).
- **The wheel** is off in the public edition. `wheelOn(profile)` combines the edition with the per-user Settings opt-out (`wheel_enabled`), and replaces every direct `wheel_enabled ?? true` check. On top of that, public: `/wheel` and `/wheel/history` 404, Wheel History leaves the nav, the Settings Wheel section is hidden (`updateWheelEnabled` refuses), the Wheel achievement category is gone (`AVAILABLE_ACHIEVEMENTS` in `lib/achievements.ts`; lookups by id still use `ACHIEVEMENTS`), and the activity feed skips the `wheel_spins` query. All wheel actions refuse through the single `getProfile` guard in `app/(app)/wheel/actions.ts`. Ticket badges, stats "lost" groups and `consumeWheelPending` are left alone: with no wheel data they show nothing.
- **One Playing status** in the public edition (`FEATURES.ambient` is friends-only). Ambient isn't offered (game form, filter tabs, quick-actions menu via `menuMoves`' `withAmbient`, `/games/new`), and every server write maps it to Playing with `editionStatus` (`createGame`, `updateGame`, `setGameStatus`, and the tracker's `identify` + `resume` routes, so tracker-found games are filed as Playing and count like any other game). There's no Now Playing section on `/games` or profiles: `getRecentlyPlayed` returns every tracked **Playing** game (up to 24) in the public edition, so the Recently played strip only holds games the tracker has seen, and doesn't render at all without them. The filter tabs gain a **Playing** tab and "All" really is everything, since untracked Playing games have no section of their own. The desktop app's own wording ("Track as Ambient" etc.) changes with the public desktop build.
- **No DNF penalty** in the public edition (`FEATURES.dnfPenalty` is friends-only): tickets there only ever go up from play, to be spent on cosmetics later. `applyDnfPenalty` (`lib/tickets.ts`) is the only place the penalty is charged and returns early; `statusChangeEffects`/`moveWarning` take `withDnfPenalty`, so quick moves neither charge nor refund it and DNF needs no warning; the DNF button's confirm drops the penalty wording. Taking back a **completion's** tickets when a game stops being completed still happens in both editions: it's a correction, not a penalty, and without it completing and un-completing a game would mint tickets forever.
- **No Ticket History in the nav** in the public edition (`FEATURES.ticketHistoryNav`). With Wheel History gone too, the History menu (desktop dropdown and phone sidebar group) isn't rendered at all. `/tickets` itself is kept and reachable by URL (the dashboard's Tickets tile still links to it). It lists **every** user's transactions in the friends edition (everyone there is a friend) but only the **viewer's own** in the public edition (`FEATURES.sharedTicketLedger`); widen that to "you and your friends" once the public friends system exists.
- **Level card instead of the wheel card** on the public dashboard (`components/dashboard/new/LevelCard.tsx`, shown when `!FEATURES.wheel`, in its own Suspense): level + XP bar (`levelProgress`) and the **next achievement** with what's left (`getNextAchievement` → `nextAchievement`). Achievements unlocked by a number reaching a target live in one table, `COUNTED` in `lib/achievements.ts` (93 of them: value, target, unit), which both `evaluateAchievement` and `nextAchievement` read, so a target is defined once. Add new threshold achievements there, not to the switch; only one-off conditions belong in the switch.
- **Profile banner tickets**: friends shows "120 (214) tickets" (lifetime total, then spendable balance in brackets); the public edition shows just the current balance, the same figure as the nav pill (`FEATURES.ticketBalanceInBanner`, `TicketFigure` in `components/profile/ProfileHero.tsx`).
- **Secure sign-up and chosen usernames** in the public edition (`FEATURES.secureAuth`). Rules in `lib/username.ts` (3–20 of a–z/0–9/_, starts with a letter, not in `RESERVED_USERNAMES`, lowercase; 30-day rename cooldown; passwords 8+ with a letter and a number); database checks in `lib/data/usernames.ts` (`usernameStatus`, service role; a name is taken if any profile has it in any case **or** it's in `username_redirects`). Sign-up (`app/(auth)/login`) adds a live-checked username (`components/auth/UsernameField.tsx`), optional display name, Turnstile (`components/auth/Turnstile.tsx`; token read from the widget's own `cf-turnstile-response` field and sent as `captchaToken` on sign-in, sign-up and reset; a copy in a field of our own went stale when the form switched modes), Google/Discord (`components/auth/OAuthButtons.tsx`) and "Forgot password?" (`/forgot-password` → email → `/auth/callback?next=/reset-password` → `/reset-password`). Google/Discord accounts start with a stand-in username and `profiles.username_chosen = false`; `app/(app)/layout.tsx` sends them to `/welcome` to choose. Renames: Settings → `UsernameSetting` → `updateUsername` (`app/welcome/actions.ts`), which records the old name in `username_redirects`; `/users/[name]` is case-insensitive in the public edition and forwards old names. Settings → Update Password uses the same password rule. The friends edition's login, Settings and exact profile lookup are untouched, and the new pages 404 there. SQL: `db/public-auth.sql` (both projects; also rewrites `handle_new_user` so a clashing email local part gets a suffix instead of failing sign-up — the friends edition's normal case is unchanged). Local `supabase/config.toml` has email confirmation on (emails land in the mail catcher) and Google/Discord stubs, off; local captcha stays off.
- **Verified completion rewards** in the public edition (`FEATURES.verifiedRewards`; rules in `lib/completion-rewards.ts`, unit tested; database side `grantCompletionRewards` in `app/(app)/games/actions.ts`). Tickets and completion XP only for IGDB/RAWG-linked games, completed on or after the account's UK sign-up day; **tracked hours** (sum of the game's `play_sessions.applied_hours`) set the tier and 100h+ bonus; an untracked completion earns `+1` and base XP (50), at most `UNTRACKED_DAILY_LIMIT` (5) per UK day; no 100% or sequel bonus. Friends keeps the typed-hours honour system exactly (`why: 'full'`). Every completion is recorded in `completion_rewards` (tickets, XP, untracked, `why`; service role only), which is what lets **completion XP be taken back** when a game stops being completed (`reverseCompletionRewards`, both editions; completions from before batch 3 have no row, so their XP isn't taken back). The game page shows `rewardExplanation` to the owner in the public edition. Editing a completed game re-checks its reward when hours, achievements, completion date, sequel flag or linked game change.
- **Who can read what is set per database** (`db/batch3.sql`, then `db/friends.sql`): `public.app_settings` (`edition` = `friends`/`public`, set once per project by `db/edition-friends.sql` / `db/edition-public.sql`) and `public.edition_is_public()`, which treats a **missing** setting as public, so a forgotten setting locks down rather than opens up. The read rules on `games`, `play_sessions`, `ticket_transactions` and `user_achievements` are all `auth.uid() = user_id or can_view(user_id, '<item>')`. `can_view` (db/friends.sql) keeps the friends edition exactly as before (every signed-in user reads everything); in the public edition it's yourself, nobody across a block, then the owner's privacy setting (below). Wheel history keeps batch 3's rule (own only in public; no wheel there). Profiles stay readable by anyone (names in search and activity); `ticket_balance`/`xp` on them are therefore readable through the API, a known gap. `dev` and `dev-public` share one local database, so `npm run env:dev`/`env:dev-public` also set its `edition` (`syncLocalEdition` in `scripts/use-env.mjs`).
- **Friends system** in the public edition (`FEATURES.friendSystem`; SQL `db/friends.sql`: needed by the public project; on the friends project it changes nothing anyone sees (its code never reads the new tables), but run it there too to keep production the schema source, before the next `db:dump`; rules `lib/friends.ts`, unit tested; data `lib/data/friends.ts`; actions `app/(app)/friends/actions.ts`). Mutual friends: request → accept (`friend_requests`, then one `friendships` row per pair, smaller id first); a request both ways becomes a friendship; `blocks` (only the blocker sees it) ends any friendship or request and stops new ones both ways. Every write is a server-only function (`send_friend_request`, `respond_friend_request`, `cancel_friend_request`, `remove_friend`, `block_user`, `unblock_user`) called through the service role, each locking the pair so two tabs act once. **Privacy**: five `profiles.privacy_*` columns (`profile`, `games`, `achievements`, `activity` = sessions/hours/Recently played/Playing now, `tickets`), each `everyone`/`friends`/`only_me`; defaults everyone, everyone, everyone, friends, friends (`PRIVACY_ITEMS`). Users update them directly (column grant), from **Settings → Privacy** (`components/friends/PrivacySettings.tsx`, which also lists blocked people). The database enforces them (`can_view`); pages also hide what it would leave empty (`privacyAllows`, the same rule): `/users/[name]` shows `PrivateProfile` when Profile isn't allowed (the banner in their accent with no picture or figures, `LevelAvatar` + name + @username + level, then a lock card with the friend button), hides Recently played, the games list and the banner's ticket figure per setting, and has `FriendButton` (relation button + ⋯ menu: Remove friend, Block). **Dashboard Friends card**: a "+" opening `AddFriendModal` (search by username or display name, at least 2 characters, private profiles included, blocked either way excluded, 10 results; rate limited `USER_SEARCH`; requests `FRIEND_REQUESTS` 20/hour), incoming requests with Accept/Decline, a "No friends yet" empty state, and on each friend's row a right-click / ⋯ menu (`components/friends/FriendActions.tsx`: View profile, Remove friend; it reuses `Menu`/`MenuItem`/`ConfirmDialog` exported from `GameActionsMenu.tsx`). Lists of other people are friends-only in the public edition: the card, `getPlayingNowFor` (dashboard + `/api/playing-now`), `getActivityFeed`, the Stats head-to-head picker, `/tickets` (you + friends). The friends edition's card, feed and pages are unchanged (no `friendSystem`, everyone is a friend).
- **Game search and store pages** in the public edition (`FEATURES.gameStore`). The dashboard's `components/discover/GameSearchBar.tsx` (under the greeting) searches IGDB through the existing rate-limited `/api/rawg/search`, and opens `/discover/<igdbId>` (`app/(app)/discover/[id]/page.tsx`, not found in the friends edition; a skeleton, `loading.tsx`, shows while it loads, so not-found arrives with HTTP 200 as on the wheel pages), laid out as the chosen design C: media (`StoreMedia`: trailers first, `orderVideos`, then screenshots; YouTube in place), and beside it the countdown or "Coming <year>" for unreleased games (`ReleaseCountdown`, `isYearOnly`: IGDB stores year-only dates as 31 December), the summary (`StoreSummary`, clamped with Read more), IGDB rating (critics `aggregated_rating`, players `rating`), Steam (`getSteamReviewSummary`; hidden when Steam doesn't answer), facts (age rating `pickAgeRating` PEGI→ESRB, `playersLine`, `platformNames`), tags and friends who have it (`FriendsWhoHaveIt`, friends' rows with that `igdb_id`, RLS applies privacy). Then `StoreAddBar` (Add to Backlog / I'm playing it through `ReviewGameModal` and `addRecommendationToBacklog`, which now takes `status=playing`; or "In your library" with a link; shops from `storeLinks`), "DLC and editions" (`AddOnsList`: text rows of tag, name, year; `splitAddOns`: expansions listed, plain DLC listed when ≤3 else behind a "N more DLC" row; editions = `version_parent` children; no images) and more from the developer. One IGDB query per game (`getStoreGame`) plus one for editions, cached an hour (`lib/data/store-game.ts`); each view also counts against `IGDB_LOOKUP`. Pure rules in `lib/store-page.ts`, unit tested; `e2e/discover.spec.ts` (needs internet).
- **Profile with cards** in the public edition (`FEATURES.newProfile`; rules `lib/profile-cards.ts`, unit tested; SQL `db/profile-cards.sql`, both projects). `/users/[name]` renders `components/profile/v2/ProfileOverview.tsx` (server: `computeUserStats` + `loadProfileCardData` in `lib/data/profile-cards.ts`, which loads only the cards asked for: the owner gets all of them so a card added while editing has data, a visitor only the layout's cards their privacy allows, each card's `privacy` key in `PROFILE_CARDS`) and the client `ProfileView.tsx`: the fixed `ProfileCard` (accent passed as a value; bio, level from `lib/levels.ts`, hours and games via `profileFigures`, Edit profile or `FriendButton onDark`), then the cards (`CardBody.tsx`, both sizes from one `ProfileCardData`). The layout is `profiles.profile_layout` (jsonb list of `{card, size}`, null = `DEFAULT_LAYOUT`) and `profiles.bio` (≤160), both normalised on save (`saveProfile`, `app/(app)/users/[username]/actions.ts`) and on read (`normaliseLayout`/`normaliseBio`). A card saved at a size it no longer comes in takes its largest size rather than vanishing (Finish rate is square only now, Currently playing half only). Sizes `full`/`half`/`small` (shown as Square) take 4/2/1 of four columns (`CARD_COLUMNS`; on phones two columns, squares two to a row). The grid is plain CSS (`grid-cols-2 sm:grid-cols-4`, `SPAN` in `ProfileView.tsx`), and `gridEntries` says where the editor's "Add a card" spaces go (the gap a row is left with when the next card doesn't fit, as half spaces where they line up with the row's halves, else squares, and a full one at the end). The Currently playing card (`PlayingSpotlight.tsx`) puts one game in the spotlight (`spotlightOrder`: a running game first, else the latest started) and lists up to 3 others beside it (2 under it on a half card), with each game's platform. The Favourite genres card (`GenreBlocks.tsx`) lays out the top `GENRE_BLOCKS_MAX` (4) as blocks whose area follows the game count (`genreColumns`: a column each for the top two, the next two stacked; no block under 18%), names via `shortGenre`. The Play streak card (`StreakFlame.tsx`) is a flame sized and lit by `streakFlame` (grows over the first days, full size at 30; at 0 a small blue flame with no number; both flicker by changing shape: `flame-shape` keyframes of the same path, plus `flame-core`, in `app/globals.css`; Safari, which can't animate a path, shows it still; off for reduced motion). The Recently completed card (`RecentTimeline.tsx`) is a timeline of the last `RECENT_COMPLETED_MAX` (4) completions, newest left, dates by `timelineDate` (year only when not this year); covers are absolutely positioned at the height of their space, so a card stretched by a taller neighbour grows its covers instead of leaving a gap, without the images setting the card's height. Platform icons: `components/games/PlatformIcon.tsx`, chosen by `platformIcon` (`lib/platform-icons.ts`, matched on the free-text platform name, unit tested against every name in the picker). Brand icons are Simple Icons paths copied into `lib/platform-brand-paths.ts` (CC0; every PlayStation uses the PS symbol, since the console icons are unreadable wordmarks); Nintendo and Microsoft have none there (removed at their request), so Switch, DS, Game Boy, Wii, GameCube, Xbox and Windows get drawn device icons. IGDB's own platform logos were tried and rejected: mixed wordmarks and photos, wrong models, black ones invisible in dark mode. The Play calendar card (`PlayCalendar.tsx`, full only, play-activity privacy) is a GitHub-style grid: `calendarDays` (53 Monday-first week columns ending today, UK days) and `playLevel` (none, <1h, 1–2h, 2–4h, 4h+). The Game shelf card (`GameShelf.tsx`, full only, games privacy) keeps its picks in its own layout entry (`games`: up to `SHELF_MAX` game ids, `normaliseShelfGames`); `shelfGames` shows them in order, skipping any no longer completed, else the latest completions. The owner gets every completed game (`ShelfPicker.tsx` chooses from them), a visitor only what's on the shelf. An empty space can be split in the editor (`splitSize`: full → two halves → two squares); splits are view-only state, kept only for the layout they were made on, so any card change starts afresh. Dragging is `@dnd-kit` with a no-op sorting strategy: the layout itself reorders on drag-over (`moveCard`), because sliding transforms assume equal-size items; Nothing moves until a drop (no live reordering): dropped on a card of the same size they swap, a different size takes a new row just before that card's row (`dropOnCard`, the target ringed while hovered); dropped on a line between rows (`RowLine`, ids `row:N`, shown only while dragging, positioned from the first element of each row: `entries[i].row` from `gridEntries`, width `ROW_LINE_WIDTH`) it gets a row of its own there (`moveToRow`, `layoutRows`: the row before keeps its gap and the new row is closed off with empties, so no other row gains or loses a card); the dragged card shows what the drop will do (`dropHint`: Move to the top / Move here / Put it here / Swap / New row above), since it covers the target; dropped on an empty space (split ones too: `useDroppable`, ids `space:…`, data a `SpaceTarget` of root size, part size and column offset) it goes exactly there and **no other card moves** (`moveToSpace`): the place it left is kept as an empty entry, `{ card: 'empty', size }` (`EmptySlot`, `isCardItem`), which edit mode shows as a space and view mode as an invisible cell. "Add a card" fills a space the same way (`addToSpace`). `trimEmpties` keeps every row with at least one card: a row of only empty spaces goes (the row above then keeps its gap with empties, so the next row can't slide up into it), as do trailing empties; it runs on every change and on normalising; a layout holds at most `MAX_LAYOUT_ENTRIES` (40, the SQL check too). Visitors lose the cards privacy hides (the rest close up) but keep the empties. Collisions are whatever is under the pointer (`pointerWithin`), else `closestCenter` for the keyboard. dnd-kit swallows clicks for 50ms after a drop, so e2e tests pause before clicking. `AddCardDialog.tsx` lists every card (ones in use greyed out); `sizeForSpace` picks the size. Under the cards, `ProfileGames.tsx` (server) shows the games list with the usual `GameFilters` (`keepScroll`: its tab/sort/view/search navigations pass `scroll: false`, so the page stays put; `/games` uses it too, both editions; the friends edition's old profile list doesn't)/`GameListView` and the page's `?status/sort/view/q`, or a games-privacy message. The page's lookup is `getProfileForPage` (`lib/data/profile-page.ts`: lookup, old-name redirect, relation, privacy, initials, accent). Nav: **Profile** (`/users/<me>`) before Dashboard. The Shop button in the edit bar is a placeholder; themes and paid cards wait for the shop plan. `e2e/profile.spec.ts`.
- **Accent colours from a set** in the public edition (`FEATURES.presetAccents`): Settings → Appearance shows `ACCENT_CHOICES` (`lib/accent-choices.ts`, twelve Tailwind-600-ish shades, unit tested for contrast against white text and a dark page) as swatches instead of `<input type="color">`; `updateAppearance` refuses anything else. An older free colour is shown as `nearestAccentChoice` until changed (what's stored isn't rewritten). The column grant still lets a user write any value directly through the API: it only affects their own colour.
- **Private notes** live in `game_private_notes` (owner-only RLS, and only on your own games), not `games.notes`, which now holds public notes only: game rows are readable by others and RLS works on whole rows. Write through `saveGameNotes` and read the owner's view through `withOwnerNotes` (`lib/data/private-notes.ts`); the game page, edit page, `createGame`/`updateGame` and the import page do.
- **Branding**: `components/layout/Wordmark.tsx` (nav + login; friends keeps the two-tone Games/List), `app/layout.tsx` metadata, login tagline and the device-pairing copy read `BRAND`. The desktop app's branding is untouched until the public desktop build.
- **Env files** (`scripts/use-env.mjs`): sources are `prod`, `dev`, `dev-public` and `public` (`.env.<name>.local`), identified by project ref **and** edition, since `dev` and `dev-public` share the local database. `npm run env:local` writes both local files. The pill reads "TEST DATABASE · PUBLIC EDITION" in the public edition.
- **Schema**: production (friends) stays the schema source. Apply the same `supabase/migrations/*_init_schema.sql` (+ `db/security-hardening.sql`) to the public project whenever the schema changes.

**Setting up the public edition's hosting** (one-off, done in the dashboards):
1. New Supabase project (same organisation, EU region to sit near Vercel's `fra1`). In its SQL editor run, in order: `supabase/migrations/*_init_schema.sql` (regenerated after batch 3, it includes `db/privileges.sql`; if it predates that, also run `db/security-hardening.sql`), `db/edition-public.sql`, `db/public-auth.sql`, then all of `db/review-fixes.sql` and all of `db/batch3.sql` (a new project has no old code to keep working, so both parts of each at once). Auth → URL configuration: Site URL = the new Vercel URL.
2. New Vercel project from the same GitHub repo. Env vars: its own `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_EDITION=public`, `NEXT_PUBLIC_BRAND_NAME`, its own `CRON_SECRET`, plus the shared `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` / `RAWG_API_KEY` / `YOUTUBE_API_KEY` / `METADATA_PROVIDER`.
3. `vercel.json`'s crons run on both projects, each against its own database. Seed the master list once by hand: `Authorization: Bearer <CRON_SECRET>` to `/api/cron/sync-detectable` on the new site.
4. **Sign-up security** (`FEATURES.secureAuth`): run `db/public-auth.sql` in the SQL editor (on the friends project too, after the case-duplicate check at its top). Auth → Sign In / Providers → Email: confirm email **on**, minimum password length 8, require letters and digits. Auth → URL configuration: add `<site>/auth/callback` and `<site>/**` to redirect URLs. Auth → Attack protection: captcha on, provider **Turnstile**, secret key from a free Cloudflare Turnstile site (its site key goes in Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`). Auth → SMTP: a custom sender (e.g. Resend's free tier); the built-in one only sends a few emails an hour. Auth → Providers: **Google** (a Google Cloud OAuth client) and **Discord** (a Discord developer application), each with the callback `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Locally: create `.env.public.local` with the new project's keys plus `NEXT_PUBLIC_EDITION=public` (so `npm run env:public` works), and add the new project ref to `PROD_REFS` in `scripts/seed-dev.mjs`.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # ESLint (eslint.config.mjs): expect 0 problems; deliberate exceptions carry an inline "-- reason"
npm test         # Run the Vitest suite (~600 unit tests, lib/__tests__/)
npm run test:e2e:both  # Playwright in both editions (see below)
```

**Run `npm test` after every change.** Test files live in `lib/__tests__/`.

## End-to-end tests (`e2e/`)

A **Playwright** suite covers what Vitest structurally cannot: a real browser,
real page loads, and state actually round-tripping through the database
(~74 tests, about 2 minutes). Files run **one at a time** (`workers: 1`): they
share the two seeded accounts. Each cleans up after itself; shared helpers for
test data are in `e2e/db.ts` (local database only).

- `e2e/wheel-resume.spec.ts` — the wheel's resumable-turn feature (see below).
  Friends edition only: it skips itself in the public edition (no wheel).
- `e2e/wheel-library.spec.ts` — a wheel win moves the backlog game to Playing
  (including one not linked to IGDB); two tabs skipping one turn pay once.
  Friends only.
- `e2e/games.spec.ts` — search with commas/brackets/wildcards, the hours rules,
  editing, completing.
- `e2e/rewards.spec.ts` — completion XP taken back and given once, two tabs
  completing at once pay once; public edition's verified rewards (tracked
  hours, IGDB-linked only, 5 untracked a day).
- `e2e/delete-warning.spec.ts` — the delete confirmation names the exact
  tickets and balance (game page and list menu), below zero too.
- `e2e/friends.spec.ts` — public edition only: the privacy rules in the
  database (every setting × stranger/friend/blocked/logged out), the friend
  functions (both-ways requests, two accepts at once, blocks), and the screens
  (empty card, search → request → accept, decline/cancel, remove/block/unblock,
  a private profile).
- `e2e/discover.spec.ts` — public only, real IGDB (needs internet): dashboard
  search opens The Witcher 3's store page, its content, Add to Backlog, a
  friend's copy (and their privacy), an unknown game 404s.
- `e2e/private-notes.spec.ts` — private notes visible to their owner only.
- `e2e/permissions.spec.ts` — what a user can do directly with the browser's
  key (achievements, ledger, wheel history, notes, server-only functions,
  reserved usernames), the database functions' "only once" rules, and the
  per-edition read rules (flips `app_settings` temporarily, then restores it).
- `e2e/tracker-api.spec.ts` — the desktop app's API: hours counted once,
  completed games untouched, orphaned sessions closed, no token minting,
  identify rate limit, emulator mode (add / pick / remembered / "None of
  these", no exe link; real IGDB).
- `e2e/security.spec.ts` — headers, the CSP (nonce on every script, injected
  markup refused, Turnstile loads in the public edition; needs internet),
  signed-out redirects, IGDB rate limits,
  changing your password needs the current one (restores test-sam's password).
- `e2e/activity.spec.ts` — a session the app never closed shows its real end.
- `e2e/dashboard.spec.ts` — the current-game card shows for a Playing game
  and is absent with nothing in Playing/Ambient (moves test-alex's games and
  puts them back).
- `e2e/smoke.spec.ts` — opens **every main page** signed in (dashboard, each
  games tab and view, search, add/edit/view games, own and others' profiles,
  stats + head-to-head, achievements, activity, tickets, settings, import,
  the desktop app's pages; the wheel in friends) and a few signed out,
  and fails on an error status, an uncaught JavaScript error, Next.js's error
  screen, or a page with no heading. Pages that shouldn't exist in an edition
  must show the not-found page (a page with a `loading.tsx`, like the wheel's,
  shows it with HTTP 200 — a Next.js streaming quirk). Read-only. **Run it in
  both editions after any change that could affect pages** (library upgrades
  especially): `npm run test:e2e:both`. Add new pages to its list.

Pure rules stay in Vitest; add a flow here when its correctness depends on the
real site or database (permissions, "only once" races, page loads). `EDITION`
and `localEnv()` in `e2e/helpers.ts` tell a spec which edition it's running
against; edition-specific tests `test.skip` themselves in the other edition, so
**run the suite in both editions** after changes. Wait for
`networkidle` before typing into a freshly loaded form, or React's hydration can
put the field's original value back on top of what was typed; and wait for what
you're checking (`expect.poll`), not for something written before it in the
same request.

```bash
npm run test:e2e:both  # both editions, one after the other (~5 min), then restores yours
npm run test:e2e       # the edition you're on (headless)
npm run test:e2e:ui    # Playwright's interactive UI mode, for debugging
```

`test:e2e:both` (`scripts/test-both-editions.mjs`) only ever switches between
the two **local** environments (`dev` and `dev-public`): if `.env.local` points
anywhere else it refuses and changes nothing. It runs your current edition
first, switches and restarts the dev server for the other, then switches back
and restarts yours in the background (or stops it, if none was running).
Extra args go to Playwright: `npm run test:e2e:both -- e2e/games.spec.ts`.
Dev-server logs during the run go to the OS temp folder
(`gameslist-dev-<env>.log`).

Requires the local stack running and active (`npm run supabase:start && npm run
env:dev`), and `npm run dev` up at `localhost:3000` — same prerequisites as
manual local testing.

**Safety**: `e2e/global-setup.ts` hard-refuses to run unless the app at
`localhost:3000` is showing the 🧪 TEST DATABASE pill (`EnvBanner`) — the same
signal used everywhere else to make the active environment unmistakable. These
tests log in and spend tickets; they must never be able to run against
production, and this check doesn't trust an env var that could be stale —
it trusts what the running app is actually rendering. `e2e/reset-state.ts`
independently re-checks the Supabase URL is local before writing anything.

**Test isolation**: each test resets `test-alex`'s (and `test-sam`'s)
`wheel_turn`/`wheel_session`/`ticket_balance` to a known state in
`beforeEach` — otherwise a previous run's *correctly* saved session would
resume instead of a fresh setup screen, since that's exactly what the feature
is supposed to do. One test (`a finalized turn does not resurrect…`) uses
`test-sam` instead of `test-alex`, because finalizing a turn advances
`wheel_turn` and would change what every other test in the file sees.

`vitest.config.ts` excludes `e2e/**` — it's a different runner with its own
`test`/`expect`, incompatible with Vitest's.

## Dev / test database

A full Supabase stack runs locally in Docker, so new features can be exercised
without touching the real library/tickets/wheel history. Nothing is shared with
production — separate database, separate auth, separate everything.

```bash
npm run supabase:start   # boot the local stack (Postgres, Auth, API, Studio)
npm run supabase:stop    # shut it down
npm run env:local        # write .env.dev.local pointing at the local stack
npm run env              # which database is .env.local pointed at right now?
npm run env:dev          # point local dev at the local stack
npm run env:prod         # point local dev back at the real project
npm run db:reset         # rebuild the local DB from supabase/migrations/
npm run seed:dev         # fill it with fake users + games
npm run db:dump          # dump the live prod schema to db/schema.sql
npm run db:migration     # turn that dump into supabase/migrations/*_init_schema.sql
```

First-time or after-a-wipe sequence:

```bash
npm run supabase:start && npm run env:local && npm run env:dev
npm run db:reset && npm run seed:dev && npm run dev
```

Local Studio is at http://127.0.0.1:54323; signup emails are caught at
http://127.0.0.1:54324 rather than being sent.

**Prerequisites** (already installed on the main dev machine): Docker Desktop
with the WSL2 backend, and PostgreSQL client tools for `pg_dump`
(`winget install PostgreSQL.PostgreSQL.17`). WSL2 itself needs
`wsl --install --no-distribution` from an **admin** terminal plus a reboot.

How it fits together:

- Next.js only reads `.env.local`. `scripts/use-env.mjs` swaps that file's
  contents between `.env.prod.local` and `.env.dev.local` (both gitignored via
  `.env*.local`). It **copies** rather than layers, so there's never a
  half-dev/half-prod mix — whatever is in `.env.local` is exactly what runs. On
  first use it backs up the existing `.env.local` to `.env.prod.local`.
- Because it copies, an edit made directly to `.env.local` would be destroyed by
  the next switch. So the switcher **syncs back first**: before overwriting, it
  writes `.env.local` to whichever source file it came from, printing the key
  names that changed (never values). `npm run env` also reports any unsaved
  edits. If `.env.local` matches *neither* source it refuses to switch outright,
  rather than discarding it. This is not theoretical — a `SUPABASE_DB_URL` added
  to the active file was lost this way before the sync-back existed.
- `.env.dev.local` is generated by `scripts/local-env.mjs` from
  `supabase status`, carrying over the shared third-party keys (RAWG/IGDB/
  YouTube) from `.env.prod.local`. The local anon/service_role keys are fixed
  demo credentials baked into the CLI — identical on every machine and useless
  off your laptop.
- It also sets `NEXT_PUBLIC_APP_ENV=development`, which makes
  `components/layout/EnvBanner.tsx` render a fixed "🧪 TEST DATABASE" pill in
  the bottom-left corner. That var is absent from the Vercel/production env, so
  the pill can never show on the deployed site.
- `scripts/seed-dev.mjs` hard-refuses to run when `.env.local` points at the
  production project ref (`PROD_REFS` in that file) — add new prod refs there if
  the project ever moves.
- **Vercel is unaffected** — its env vars still point at the real project, so
  deploys never see the test database.

### Schema workflow

`supabase/migrations/` is the local database's source of truth, and it is
generated from production rather than hand-written — production remains the
place schema changes are made (pasted into the dashboard SQL editor, as
documented throughout this file). After any such change:

```bash
npm run db:dump       # pg_dump production -> db/schema.sql
npm run db:migration  # -> supabase/migrations/<stamp>_init_schema.sql
npm run db:reset      # replay it locally
```

`scripts/dump-schema.mjs` reads `SUPABASE_DB_URL` from **`.env.prod.local`**,
not the active `.env.local` — its job is to capture *production's* schema, and
`.env.local` is often pointed at the local stack, in which case it would dump
the local database over `db/schema.sql` and `db:migration` would then rebuild
the migrations from it. It also refuses outright if the URL is a localhost one.

It calls **`pg_dump` directly** rather than `supabase db dump`, which needs
Docker purely to run pg_dump for you. Three things it handles that a plain
`pg_dump` invocation doesn't, all of which silently break the clone otherwise:

- **Percent-encodes the password** in `SUPABASE_DB_URL`. Supabase-generated
  passwords often contain `@`/`^`/`#`; dropped in raw, libpq splits the URI at
  the wrong `@` and tries to resolve part of the password as a hostname.
- **Appends the `auth.users` signup trigger.** `handle_new_user` is a public
  function, but the trigger firing it sits on `auth.users` — outside the dumped
  schema. Without it a new signup gets no profile row, and `AppLayout` signs
  them straight back out (looks like a login loop).
- **Strips `\restrict` meta-commands** that pg_dump 17 emits. They're psql
  directives; the Supabase SQL editor isn't psql and errors on them.

`scripts/make-migration.mjs` then applies two more fixes so the dump can replay
into an already-provisioned database: it drops `CREATE SCHEMA public` (Postgres
ships with it) and ensures `uuid-ossp` up front, because column defaults call
`extensions.uuid_generate_v4()`.

### Known differences from production

- Vercel Cron doesn't fire; hit `/api/cron/*` by hand to test those. The cron
  routes **fail closed**: set `CRON_SECRET` in `.env.dev.local` and send
  `Authorization: Bearer <secret>`, or they answer 401.
- Function/column privileges aren't in the dump (`--no-privileges`), so
  `scripts/make-migration.mjs` appends `db/privileges.sql` (every GRANT/REVOKE the
  app relies on; skips functions a database doesn't have yet) to the migration it
  writes. A migration generated before that change lacks them: after a `db:reset`
  from one, run `db/privileges.sql` in local Studio. Add any new server-only
  (SECURITY DEFINER, user-id-taking) function to its list.
- After a `db:reset`, run `npm run env:dev` (or `env:dev-public`) again so the
  local database gets its `edition` setting (`db/batch3.sql`).
- Signup emails go to the local mail catcher, not a real inbox.
- `local` is Postgres 17 (`supabase/config.toml`), matching production's 17.6.

## Architecture

**GamesList** is a Next.js 16 App Router app (React 19) using Supabase for auth and PostgreSQL. Since Next.js 15, `cookies()`, `headers()` and page/route `params`/`searchParams` are async: always `await createClient()` (lib/supabase/server.ts) and `await props.params`.

### Route structure

- `app/(auth)/` — unauthenticated pages (login/signup). Route group does not appear in URL.
- `app/(app)/` — authenticated pages (dashboard, games, users, tickets, wheel, changelog). Route group does not appear in URL.
- `app/auth/callback/route.ts` — must live outside route groups to match the `/auth/callback` URL Supabase sends confirmation emails to.
- `proxy.ts` (Next.js 16's name for middleware; function `proxy`) — redirects unauthenticated users away from protected routes and authenticated users away from `/login`. Also refreshes the session cookie on every request.

### Supabase client pattern

Two clients — never mix them (plus the service-role `lib/supabase/admin.ts`, which starts with `import 'server-only'`, as do `lib/igdb.ts`, `lib/rawg.ts` and `lib/youtube-api.ts`: importing any of them from browser code is a build error. Type-only imports are fine. Vitest maps `server-only` to an empty stub):
- `lib/supabase/server.ts` — use in Server Components, Server Actions, Route Handlers. Reads/writes cookies via `next/headers`.
- `lib/supabase/client.ts` — use in Client Components only.

The `app/(app)/layout.tsx` fetches the user's profile on every authenticated page load. If the profile row is missing (e.g. deleted manually), it calls `supabase.auth.signOut()` before redirecting to avoid a redirect loop.

### Data fetching

Server Components fetch directly using the server Supabase client — no API routes for reads. Mutations go through Server Actions (files named `actions.ts` co-located with their route).

Server Actions return a discriminated union:
```typescript
type ActionResult<T = void> = { success: true; data: T } | { success: false; error: string }
```
Auth actions (`signIn`, `signUp`) return `{ error: string }` or `{ success: string }` (simpler shape, no wrapping).

### Database types

`lib/database.types.ts` is a hand-written type file that mirrors the Supabase schema. Replace it with the CLI-generated version once the full schema is applied:
```bash
npx supabase gen types typescript --project-id <id> > lib/database.types.ts
```
`lib/types.ts` re-exports row types (`Profile`, `Game`, etc.) for clean imports. Supabase query results sometimes need an explicit type cast (e.g. `as { data: Profile | null; error: unknown }`) when generic inference doesn't resolve.

### Gamification constants

All ticket costs, awards, penalties, and wheel rules live in `lib/constants.ts`. The ticket ledger is an append-only `ticket_transactions` table; the running balance is cached as `profiles.ticket_balance` and updated atomically via the `award_tickets` Postgres RPC function to prevent drift.

### Styling

Tailwind CSS with the Geist Sans font. Violet (`violet-600`) is the brand accent colour. `brand-*` maps to violet in the Tailwind config. Zinc is used for all neutral/grey elements.

---

## Current build status

Phases completed: **1, 2, 3, 4, 5**. Phase 6 (Changelog) is deferred — not being built for now.

The full implementation plan (including all database SQL per phase) is at:
`C:\Users\kunal\.claude\plans\claude-prompt-build-lexical-cookie.md`

---

## Implemented features (beyond the phase plan)

- **Content-Security-Policy with a per-request nonce** (`lib/csp.ts`, set by `proxy.ts`). Scripts run only with that request's nonce (`'strict-dynamic'`, no inline or eval in production); Next.js reads the policy off the request and puts the nonce on its own scripts, and `app/layout.tsx` puts it on the theme script (reading `x-nonce` makes every page dynamic, which they already were). Allowed from elsewhere: YouTube frames, Cloudflare Turnstile (script + frame), the project's own Supabase (http + websocket), any https image (game art comes from many hosts). **Anything new loaded from another site must be added there**, or the browser silently refuses it; the smoke test fails on any CSP message in the console, and `e2e/security.spec.ts` checks the nonce and that injected markup can't run code. Not in `next.config.mjs` (one fixed header would clash with the proxy's); `X-Frame-Options: DENY` still covers static files.
- **Quick-actions menu on the games list** (`components/games/GameActionsMenu.tsx`, rules in `lib/game-quick-actions.ts`). A ⋯ button on every owned card or table row, shown on hover and always on touch screens (`[@media(hover:none)]`), plus the same menu on right-click (Shift + right-click falls through to the browser's menu). `GameCard`/`CoverCard` wrap themselves in `<GameActions>` unless `isOwner === false`; `RecentlyPlayed` does the same per tile, but its `isOwner` defaults to **false** (pass it explicitly); table rows use the `useGameActions` hook directly. **Status moves never bypass the ticket rules**: Playing/Backlog/Ambient go through `setGameStatus` (same ledger effects as `updateGame`, via `statusChangeEffects`), Completed through `markAsCompleted` (via the shared `CompleteGameModal`), DNF through `markAsDnf`, and anything that costs tickets confirms first (`moveWarning`). Two gotchas fixed while building it: React bubbles events out of portals to their React parent, so the menu and dialogs stop click/contextmenu propagation (or a table row's click would navigate); and the menu's close-on-scroll listener is attached two frames late, because a right-click focuses the card's link and the browser can scroll it into view a frame later, which used to close the menu as it opened.
- **Dashboard** (`components/dashboard/new/`, rules in `lib/dashboard.ts`). `app/(app)/dashboard/page.tsx` just renders `<NewDashboard>`. The old (classic) dashboard and its layout switch were removed on 2026-11-17 along with the components only it used (games-per-year and genre/platform charts, anticipated games, recommendations carousel, the old events and Playing-now sections); they're in git history before that date if ever wanted. Pure rules, all unit tested: `pickHero` (the most recently played Playing or Ambient game: a running one first, then the latest last-played; games never tracked go last, Playing before Ambient. An Ambient hero shows Open only, since Ambient never completes), `streakStatus` (consecutive UK days with a tracked session, the same counting as the Stats page's `streaks`; `active` = played today, `at_risk` = last played yesterday, `null` = hide the pill; looks back a year, the same window as the sessions it shares with the play chart), `playSummary` (tracked minutes for the last 7 days, 30 days, or 12 calendar months (this one so far), each session on the UK day it started like the streak, plus the most played game; the year is a bar per calendar month. All three are computed server-side from one paged (`fetchAllRows`, `lib/data/fetch-all.ts`) year of sessions and switched client-side in `PlayCard`), `ticketsEarnedThisWeek` (the Tickets tile's "+N this week", gains only), and `comingUp` (backlog releases plus IGDB events merged by date; events via the hour-cached `getCachedEvents`, `lib/data/upcoming-events.ts`). The Activity card and `/activity` share `getActivityFeed` (`lib/data/activity-feed.ts`) and `ActivityRow` (`components/activity/ActivityRow.tsx`), so the two can't drift. The Friends card re-reads `/api/playing-now` every minute.
- **Exe links are per folder** (`lib/exe-links.ts`, tracker `pick_link` in `desktop/src-tauri/src/tracker.rs`). Two games can share an exe name: WoW Retail/Forever are both `Wow.exe` (`_retail_\` vs `_forever_\`), and the Classic versions all run `WowClassic.exe`. So `game_executables` is unique per `(user_id, exe_name, path_suffix)` (`NULLS NOT DISTINCT`), not per exe name. **Always write links through `writeExeLink`**, which updates or inserts per folder; a write without a folder keeps the old repoint-the-single-link behaviour. Never upsert on `user_id,exe_name`, since that constraint no longer exists. Anything that only knows an exe name (trackers before v0.2.2) picks with `pickLegacyLink` (folder-less link, else newest), and `/api/agent/state`'s `executables` map and `/api/agent/session`'s exe fallback both use it, so the two agree. `/api/agent/state` also sends `exeLinks` (with folders) for newer trackers, and checkpoints carry `gameId`, used only if it's in the user's own library. Tracker rule: a folder match wins; then a folder-less link; a mismatched folder steps aside when the master list recognises the path (identify then links the real game); else a single link matches by name. SQL: `db/exe-links-per-folder.sql`.

- **Stats page, "Wrapped" style** (`app/(app)/stats/page.tsx`). Solo by default (`components/stats/wrapped/StatsSolo.tsx`); `?compare=<username>` switches to a head-to-head (`StatsVersus.tsx`). **Both views must keep the same sections in the same order** (hours → games → finish rate → most played → longest session → streak → tickets → highlights → perfectionist → XP/level → genres; the head-to-head's final score is always last). Each section has a fixed colour in `PALETTE` (`components/stats/wrapped/shared.tsx`), shared by both views. The solo view never mentions anyone else. The tracker-only numbers (most played, longest session, streak) and the ticket breakdown by reason come from `computeWrappedExtras` in `lib/stats-wrapped.ts`. That's deliberately separate from `computeUserStats`, which `/games` and profile banners also call and which shouldn't load a user's whole session history. Head-to-head rounds: `scoreRounds` (a side with no data means no winner); split widths: `splitShare` (clamped 35–65%). Big numbers use `font-display` (Anton, loaded in `app/layout.tsx`) with `leading-[0.9]`, so anything under a number needs its own top margin to clear a comma's tail.

- **Dev desktop builds are a separate app** — `npm run dev` / `npm run restart` (in `desktop/`) merge `desktop/src-tauri/tauri.dev.conf.json`, which only changes the identifier to `uk.co.gameslist.desktop.dev`. Settings, `detectable.json`, logs and the single-instance lock therefore live apart from the installed app (`%APPDATA%\uk.co.gameslist.desktop.dev\` vs `…\uk.co.gameslist.desktop\`), and the two run side by side. Before this, both shared one `config.json`, so running a dev build pointed at localhost silently signed the *installed* app into the test account. Release builds (`npx tauri build`) don't use the dev file.

- **Master list of detectable games** (plan + background: `reviews/master-list-plan.md`). `detectable_games` holds ~11k *path endings* (`tunic/tunic.exe`) seeded weekly from Discord's undocumented `applications/detectable` list (`lib/detectable-import.ts`, pure rules in `lib/detectable.ts`) plus `source='admin'` rows, which win on the same ending. Endings, never bare names: `game.exe` belongs to 190+ games. The tracker (`desktop/src-tauri/src/master_list.rs`) caches the list as `detectable.json`, re-checks daily via ETag, and matches **on the PC** — a path matches when it equals or ends with `/` + the ending, longest wins — so only a hit reaches the server (`identify`'s `detectableId` mode: admin `igdb_id` → Steam id via `resolveSteamApp` → exact-title search). It runs *first* in the identify chain and is gated only by `plausible_candidate`, not the full judge: being on the list is the proof. The import never replaces the stored list with a failed, malformed or shrunken one (< 5,000 rows or < 80% of the last applied run); the table *is* the snapshot. User links send a privacy-trimmed `path_suffix` (≤ 3 segments, no drive, nothing at/above `users\<name>`; built in Rust, re-validated by `cleanSubmittedSuffix`) into `game_executables.path_suffix`, which feeds the approval queue on `/admin/exe-links`. Guessed-from-exe-name titles no longer auto-file games (T-H1), and an `unknown`/failed identify backs off 10 min per exe (T-H2). Local: `npm run import:detectable` needs `CRON_SECRET` in `.env.dev.local` and `npm run dev` up. SQL: `db/master-list.sql`; `db/drop-global-exe-links.sql` retires the old catalog last.
- **Games played in PlayStation emulators** (server side done; the tracker side is on `tracker-app-changes`). One emulator program runs every game, so an emulator **never** gets a `game_executables` link. The tracker reads the emulator's window title and sends `/api/agent/identify` `{ emulator: { platform, serial?, title? } }` (IGDB platform ids 7 PS1, 8 PS2, 9 PS3, 38 PSP, 46 Vita, 48 PS4; `EMULATOR_PLATFORMS` in `lib/emulators.ts`, with the site's platform labels). `identifyEmulated` (`lib/agent-emulator.ts`): a remembered answer in `emulator_titles` (keyed `serial:SLUS20946`, else `title:<normaliseTitle(cleanEmulatorTitle)>`) first; then `searchGamesOnPlatform` (`lib/igdb.ts`, the site search's pool limited to that console). Answers `tracked`/`untracked` (owned; trackable rows get `is_emulated = true`), `add` (an exact match not owned), `pick` (top 3), `ignored` ("None of these" before) or `unknown`. The pop-up's answer goes to `/api/agent/emulator-choice` (`chooseEmulated`), which adds a new game as Playing via `fileTrackerGame` (`lib/agent-file-game.ts`, shared with identify's Ambient filing). Deleting the game deletes its `emulator_titles` row (cascade), so it's asked about again. SQL: `db/emulator-tracking.sql` (server-written only; revoke also in `db/privileges.sql`).
- **The in-run "already identified" sets only remember genuine dead ends.** `identified`/`identified_titles` in `Shared` (`desktop/src-tauri/src/tracker.rs`) originally suppressed re-querying for every outcome, including `added`/`tracked` — but those outcomes create a `game_executables` link, which the main matching loop reads *before* identify is ever reached, so nothing needed remembering there. The bug this caused: delete the game to retest (a normal thing to do) and the link goes with it, but the in-memory set still said "already handled" for the rest of that run — no amount of relaunching the game would ever trigger a retry, only restarting the whole app would. Now only `untracked` (Steam) and `notAGame`/`untracked` (name path) insert into these sets, since those are the only outcomes that genuinely do not change without the user acting on the site. Verified live: deleted an identified Ambient game twice in the same running app session, with no restart, and watched it re-identify and resume tracking within one poll each time.
- **Identification persists an executable link, not just a one-off flag.** `/api/agent/identify` now takes `exeName` and `platform` alongside `steamAppId`/`titleGuess`, and on a `tracked`/`added` result upserts `game_executables` exactly as `/api/agent/link` does — required because a name-identified game has no `RunningAppID` equivalent to re-recognise it by. Without this, a game filed in by `identify_other_launchers` was identifiable exactly once: `identified_titles` then suppressed re-querying it, but nothing else in the main matching loop (keyed on Steam app id or `game_executables`) could recognise it either, so it fell straight back to the "is this a game?" toast on the very next poll. `platform` is likewise passed through (`"Steam"` / `"Epic Games"`, both real `PLATFORM_GROUPS` values in `components/games/PlatformSelect.tsx`) and used only on a fresh insert — an existing row's platform is never overwritten.
- **Trademark symbols broke IGDB's search, silently** (`lib/name-games.ts`) — ®/™/© are common in official titles and comparison already ignores them (`normaliseTitle` strips all punctuation), but IGDB's full-text *search* does not: confirmed directly against the live API that `search "Bejeweled® 3"` returns zero rows while `search "Bejeweled 3"`, same moment, returns two. `sanitiseForSearch` strips `®™©` from the text actually sent to `searchRawgGames`, leaving the comparison target (and everything else) untouched. Caught because `identify_ea_games` kept falling through to the toast for a real, correctly-resolved title with no error anywhere in the chain — traced with temporary logging at every layer (Rust candidate resolution → the exact title bytes on the wire → the server's search call → IGDB's raw response) until the one difference between a working manual `curl` test and the failing live request turned out to be a single character.
- **EA App games identified automatically — by file, not registry** — `desktop/src-tauri/src/ea.rs`. First built against `HKLM\Software\Wow6432Node\Origin Games\<contentID>` (`DisplayName`/`Install Dir`), on real community documentation; then **disproven live** — Bejeweled 3, genuinely installed and running, still had no `Install Dir` in that key, because it's a licensing/ownership list left from the old Origin client, not a record of EA Desktop's actual installs (which otherwise live inside Chromium IndexedDB/LevelDB stores — not practically readable). The real source sits next to the game instead: every EA install drops `<folder>\__Installer\installerdata.xml` (UTF-16 with a BOM, confirmed byte-for-byte against this machine's real file), carrying the exact title. `display_name_for_exe` walks up from a candidate's own path (bounded to `MAX_ANCESTORS = 6`) looking for that file directly — no central list to gather first, unlike Epic/Steam. Verified against the real running game both in isolation (`Some("Bejeweled® 3")`) and through the full identify route (resolved on IGDB as `"Bejeweled 3"`, filed as Ambient, platform `"EA App"`, exe link persisted). `identify_by_title` in `tracker.rs` is the generic identification loop both Epic and EA call through (just the resolver closure and the `platform` label differ) — refactored out once a third caller existed, so the `identified_titles`-only-on-`untracked` discipline (see below) only has to be correct in one place.
- **Epic Games titles identified automatically** (`desktop/src-tauri/src/launchers.rs`, `lib/name-games.ts`) — the Steam-only sibling of `/api/agent/identify` extended to accept `titleGuess` instead of `steamAppId`. Epic's own install manifests (`%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`, JSON) give an authoritative `DisplayName` for a running exe — matched on *both* `InstallLocation` prefix and `LaunchExecutable` basename, since several real entries (Quixel Bridge, a Fab plugin) share Unreal Engine's install folder with no exe of their own, and folder-prefix alone would pick whichever happened to be read first. Unlike the Steam path, this is a **search**, not a lookup — IGDB has no Epic cross-reference — so `findGameByExactName` only trusts a result whose name matches *exactly* once both are reduced to bare lowercase letters and digits (`normaliseTitle`), and a miss is `unknown`, never `notAGame`: a search ranking quirk proves nothing, so it's never cached and never blocks the ordinary toast. GOG/itch/etc. are not covered — only Epic has manifests in this shape.
- **Link panel defaults to nothing, on purpose** — its Game `<select>` used to have no placeholder, so the browser silently pre-selected whichever Playing/Ambient game happened to be first in the list, which read as the app confidently (and wrongly) naming a game. Both selects now start blank; `desktop/src/main.js`'s game-select `change` handler guards against the placeholder's empty value.
- **"Add it as a new game" escape hatch** — the desktop link panel (`desktop/src/index.html`/`main.js`) only ever offered to attach an unrecognised program to an existing Playing/Ambient game, which was a dead end for any non-Steam launcher (Epic, GOG, itch…): Steam games get auto-filed via `/api/agent/identify`, but nothing else does. A "Can't find it? Add it as a new game" link now opens `open_site('/games/new?status=ambient&title=<guess>')` — `guessTitleFromExe` in `main.js` derives a rough title from the exe name (camelCase/digit-boundary split, strips `Win64`/`Shipping`/etc.), which `app/(app)/games/new/page.tsx`'s new `title` query param feeds into `GameForm`'s existing search box, kicking off the normal IGDB search debounce. Reuses the website's full add-game flow rather than building a second one natively.
- **Live "Playing now" presence** — a pulsing-dot badge on the game card (`components/games/LiveIndicator.tsx`, client component, ticks locally from `started_at` like the desktop app's own window) shown whenever `play_sessions` has an unended, recently-checkpointed row for that game. "Recently" is the point: `lib/presence.ts`'s `isSessionLive` treats a session as live only while checkpointed within `LIVE_STALE_AFTER_MS` (20 min) of now, since nothing ever marks a session ended if the agent crashes or the PC sleeps — recency is the only signal. The agent now sends a checkpoint immediately on starting a session (`desktop/src-tauri/src/tracker.rs`), not just periodically, so the badge appears within seconds rather than up to 15 minutes late. Visible to the owner **and to friends** (`getLiveSessions` runs through the normal RLS-scoped client, wired into `/games`, `/users/[username]`, `GameListView`, `NowPlayingGrid`, `RecentlyPlayed`) — this needed widening `play_sessions`' SELECT policy from owner-only to any authenticated user, matching `games_select_all`, since nothing else in the app gates friend visibility more tightly. SQL: `db/live-presence.sql`.
- **Ambient status** — `status` extended with `'ambient'`: ongoing games (multiplayer, sandbox) that sit outside the wheel and never complete. Added automatically by the desktop agent, which identifies a running Steam game exactly (install path → `appmanifest_*.acf` → app id → IGDB `external_games`). **IGDB membership is the "is this a game?" authority** — Blender, Wallpaper Engine and the Steamworks redistributables have no IGDB entry, which is what retires the hand-maintained ignore list. Ambient hours count toward total hours and hour achievements; ambient games are excluded from the "Games" count, library-size achievements, the genre/platform charts, the profile-banner pool, and the `/games` + profile "All" tabs (each has its own tab/strip instead). They produce **no activity-feed rows** on purpose — `lib/activity.ts`'s status chain has no `else`, and `components/games/RecentlyPlayed.tsx` is their surface instead. `decideWonGameAction` *claims* an ambient row (flips it to playing, keeping hours) rather than no-oping. SQL: `db/ambient-status.sql`.
- **DNF status** — `status` enum extended to `'playing' | 'completed' | 'backlog' | 'dnf'`. Requires updated CHECK constraint in Supabase (`games_status_check`). DNF games show a "Date Dropped" card on the detail page and appear in Recent Activity on the dashboard.
- **Mobile sidebar nav** — `Nav.tsx` is a client component. On mobile, a hamburger button opens a slide-in sidebar with backdrop overlay. Desktop keeps the horizontal nav unchanged.
- **Mark as Completed button** — `MarkCompletedButton` (client component) appears on the game detail page for `status === 'playing'` games (the dashboard banner has its own). It used to sit on every Playing `GameCard`/`CoverCard` too, but was removed from the cards on 2026-11-18 (both editions): it crowded out the stats and made cards uneven heights, and cards already offer "Mark as Completed…" in their ⋯/right-click menu. Uses `useTransition` and stops click propagation.
- **Year grouping on Completed tab** — `GameListView` renders `CompletedByYear` when `status === 'completed'`, grouping cards by `completion_date` year, newest first.
- **Search bar** — `GameFilters` uses `useUrlSearch` (`lib/use-url-search.ts`): a debounced (300ms) box ↔ `?q=`. Its own navigations (tabs, sort, view) go through its `applyTo`, which carries the box's text and cancels the pending update; the delayed update used to undo a tab clicked just after typing or just after the page opened. The games query filters with `.or('title.ilike.%q%,developer.ilike.%q%')`.
- **Ticket recalculation on edit** — When a completed game's hours/achievements are edited, the old completion transactions are deleted and new ones issued via the `reverse_game_completion_tickets` Postgres RPC, keeping the ledger clean.
- **Game metadata provider (RAWG ↔ IGDB)** — `lib/rawg.ts` exposes the metadata API (`searchRawgGames`, `getRawgGameDetail`, `getRawgScreenshots`, `getRawgAdditions`, `getRawgAchievements`). It delegates to **IGDB** (`lib/igdb.ts`, Twitch OAuth + apicalypse; needs `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`) when `METADATA_PROVIDER=igdb`, else uses RAWG (`RAWG_API_KEY`). Provider results keep the same `Rawg*` shapes, so callers are unchanged. Each game stores its provider id in `rawg_id` **or** `igdb_id`; use `PROVIDER_ID_COLUMN` (write) and `providerIdOf(game)` (read) — never assume `rawg_id`. IGDB gaps: no achievements (`getRawgAchievements` returns `[]`) and no dominant colour (card tint absent for IGDB games). Flip `METADATA_PROVIDER` back to `rawg` if RAWG recovers — existing data is untouched. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS igdb_id INTEGER;`
- **Game YouTube media** — The game form's Media section takes a single "video or playlist" URL (`fetchGameMedia` in `games/actions.ts`): a playlist pulls all its videos (`fetchYouTubePlaylistItems`, needs `YOUTUBE_API_KEY`), a single video uses keyless oEmbed. Videos are stored inline as `games.youtube_videos` JSONB (same hidden-field pattern as `dlc`); a playlist also sets `youtube_playlist_url` (watch-on-YouTube link). The reusable `components/games/GameVideos.tsx` renders them: 2+ → `VideoRow` carousel, 1 → a single `VideoCard`, 0 + legacy `youtube_playlist_url` → the classic `videoseries` embed. `mapGameVideos` (`lib/youtube.ts`) adapts stored items to the card shape. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS youtube_videos JSONB;`
- **Release notifications** — a `game_released` in-app notification is created when a backlog game's `release_date` arrives. The nav's `components/layout/NotificationBell.tsx` (fed by `app/(app)/layout.tsx`) shows an unread badge + dropdown; opening it calls `markNotificationsRead` (`app/(app)/notifications/actions.ts`). Generation is a daily cron (`app/api/cron/check-releases/route.ts`) idempotent via `games.release_notified`. Unreleased backlog games are separately grouped as **"Coming Soon"** in `GameListView` and hidden from the wheel picker (`wheel/page.tsx`). SQL:
  ```sql
  CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL, title TEXT NOT NULL, body TEXT,
    game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
    read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users manage own notifications" ON public.notifications
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);
  ALTER TABLE public.games ADD COLUMN IF NOT EXISTS release_notified BOOLEAN NOT NULL DEFAULT false;
  UPDATE public.games SET release_notified = true WHERE release_date IS NOT NULL AND release_date <= current_date;
  -- Tracks which IGDB events have already been announced (event_live notifications).
  CREATE TABLE IF NOT EXISTS public.notified_events (
    event_id BIGINT PRIMARY KEY,
    notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.notified_events ENABLE ROW LEVEL SECURITY; -- no policies: service-role cron only
  ```
  Notification `type`s: `game_released` (linked to a game), `event_live` (no game — the bell shows a 📣 tile).
- **Steam Deck flag** — `games.steam_deck` boolean. Toggle in `GameForm` (Flags row) and a "Playing on Steam Deck" checkbox in `ReviewGameModal` (shown only for backlog adds via the `showSteamDeck` prop — not the wheel). Set on the detail page shows `/steam-deck.png` next to the title badges. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS steam_deck BOOLEAN NOT NULL DEFAULT false;` Needs the icon at `public/steam-deck.png`.
- **Emulated flag** — `games.is_emulated` boolean, marks a game as played via emulation. Toggle in `GameForm` (Flags row, 🕹️) only — not wired into `ReviewGameModal`/backlog-add flows or shown elsewhere yet. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS is_emulated BOOLEAN NOT NULL DEFAULT false;`
- **Desktop play-tracking agent** — a program on the user's PC detects when a game they have set to **Playing** is running and logs the hours automatically. Three parts: the agent (`agent/gameslist-agent.ps1`, prototype), four API routes under `app/api/agent/`, and a "Devices" section in Settings that issues device tokens.
  - **Only `status = 'playing'` or `'ambient'` games are ever written to**, and the route re-reads the status server-side rather than trusting the client. This is load-bearing: changing `hours_played` on a *completed* game makes `updateGame` reverse and re-award that game's entire ticket ledger, so the restriction keeps a client program out of the ticket economy.
  - Hours are **added** to the existing figure. Checkpoints carry the session's cumulative minutes and the server applies only the delta (`lib/agent-session.ts`), so retries and replays cannot double-count. `hours_played` is `numeric(6,1)`, so everything is rounded to 0.1h.
  - Matching: Steam games resolve from `HKCU\Software\Valve\Steam\RunningAppID` against `games.steam_appid` (backfilled from IGDB by `scripts/backfill-steam-appids.mjs`). Anything else is linked once by executable name, stored in `game_executables` so it syncs across machines.
  - Auth is a bearer device token, stored only as a sha256 hash (`lib/agent-auth.ts`). Unlike the `CRON_SECRET` guard, a missing token always rejects. Tokens are only ever issued by signing in (the app's Connect → `/settings/devices/pair` → `approveDevicePairing`). `POST /api/agent/devices` (the desktop app's "Add device", a token minting another) answers 410 since batch 3: a stolen token could keep itself alive that way. Remove that button from the desktop app (`tracker-app-changes`) in its next release.
  - The agent builds no UI: the "link a game" screen is a page in the app (`/settings/devices/link`), so it inherits the user's accent, theme and fonts automatically.
  - SQL:
    ```sql
    CREATE TABLE IF NOT EXISTS public.device_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users manage own devices" ON public.device_tokens
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    CREATE TABLE IF NOT EXISTS public.play_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
      device_id UUID REFERENCES public.device_tokens(id) ON DELETE SET NULL,
      client_session_id TEXT NOT NULL,
      minutes INTEGER NOT NULL CHECK (minutes >= 0),
      started_at TIMESTAMPTZ NOT NULL,
      ended_at TIMESTAMPTZ,
      applied_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
      last_checkpoint_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, client_session_id)
    );
    ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users read own sessions" ON public.play_sessions
      FOR SELECT USING (auth.uid() = user_id);
    CREATE INDEX IF NOT EXISTS play_sessions_user_idx ON public.play_sessions (user_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS public.game_executables (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
      exe_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, exe_name)
    );
    ALTER TABLE public.game_executables ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users manage own exe links" ON public.game_executables
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    ALTER TABLE public.games ADD COLUMN IF NOT EXISTS steam_appid INTEGER;
    CREATE INDEX IF NOT EXISTS games_steam_appid_idx
      ON public.games (user_id, steam_appid) WHERE steam_appid IS NOT NULL;
    ```

---

## Route inventory

| Route | File | Notes |
|---|---|---|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Renders `components/dashboard/new/NewDashboard.tsx`: hero, stats, activity, wheel turn, friends, your week/month/year, coming up |
| `/games` | `app/(app)/games/page.tsx` | Game list with filters/search/sort. Defaults to `?status=completed` |
| `/games/new` | `app/(app)/games/new/page.tsx` | Add game form |
| `/games/[id]` | `app/(app)/games/[id]/page.tsx` | Game detail. Edit/delete only shown to owner (`isOwner` check) |
| `/games/[id]/edit` | `app/(app)/games/[id]/edit/page.tsx` | Edit form |
| `/users/[username]` | `app/(app)/users/[username]/page.tsx` | Profile. Friends edition: banner, stats and games list (`isOwner` controls Mark Complete). Public edition: the profile card, cards you arrange (`ProfileOverview`), then the games list (`ProfileGames`) |
| `/discover/[id]` | `app/(app)/discover/[id]/page.tsx` | Public edition only: store-style page for any IGDB game (trailer, ratings, DLC and editions, shops, friends, add to library). Opened from the dashboard search. |
| `/tickets` | `app/(app)/tickets/page.tsx` | Full ticket ledger for all users, grouped by game, paginated 20/page |
| `/wheel` | `app/(app)/wheel/page.tsx` | Wheel spin — shows current turn, game input, spin animation, result flow |
| `/api/cron/sync-playlists` | `app/api/cron/sync-playlists/route.ts` | Daily Vercel Cron. Mirrors each game's YouTube playlist into its stored videos. `CRON_SECRET`-guarded. |
| `/api/cron/check-releases` | `app/api/cron/check-releases/route.ts` | Daily Vercel Cron. Creates a `game_released` notification for backlog games whose `release_date` has arrived (idempotent via `games.release_notified`). `CRON_SECRET`-guarded, service-role admin client. |
| `/api/cron/check-events` | `app/api/cron/check-events/route.ts` | Daily Vercel Cron. Creates an `event_live` notification for every user when an IGDB event happens today (idempotent via the `notified_events` table). `CRON_SECRET`-guarded, service-role admin client. |
| `/api/agent/state` | `app/api/agent/state/route.ts` | Desktop agent. Playing games + their `steam_appid`, the user's exe links, and theme/accent. Device-token auth, service-role admin client. |
| `/api/agent/session` | `app/api/agent/session/route.ts` | Desktop agent. A play-session checkpoint; applies the hours delta to a **playing** game only. Device-token auth. |
| `/api/agent/link` | `app/api/agent/link/route.ts` | Desktop agent. Saves an executable → game mapping. Device-token auth. |
| `/api/agent/identify` | `app/api/agent/identify/route.ts` | Desktop agent. Steam app id / master-list row id (`detectableId`) / launcher title → IGDB game (Steam ids cached in `steam_game_ids`), then files it as **ambient** if the user doesn't own it. "Owns it" includes another edition of the same game, either way round: the running game's `version_parent` (`getVersionParent`), or any edition in its family (`getEditionFamily`: the whole version-link tree, up to the original and down through editions of editions, bounded; never `parent_game`, so never DLC), and a Playing/Ambient edition beats an exact match that can't take hours (a completed base game), e.g. Steam's GTA IV (base game on IGDB) → the owned Complete Edition; the matched row then gets the Steam app id. Merge a duplicate made before with `db/merge-tracker-duplicate.sql`. Writes, despite the name. Device-token auth. |
| `/api/agent/emulator-choice` | `app/api/agent/emulator-choice/route.ts` | Desktop agent. The answer to the emulator pop-up (`{ emulator, igdbId, title }` or `{ emulator, none: true }`), remembered in `emulator_titles`; adds a game it doesn't own as Playing, Emulated. Device-token auth, `AGENT_IDENTIFY` rate limit. |
| `/api/agent/detectable` | `app/api/agent/detectable/route.ts` | Desktop agent. The master list as `[path_suffix, id]` pairs, ETag'd (304 when unchanged). Device-token auth. |
| `/api/cron/sync-detectable` | `app/api/cron/sync-detectable/route.ts` | Weekly Vercel Cron (Mon 03:00). Refreshes `detectable_games` from Discord's list; fail-safe, logged in `detectable_import_runs`. `CRON_SECRET`-guarded. Also run by `npm run import:detectable`. |
| `/api/agent/start-tracking` | `app/api/agent/start-tracking/route.ts` | Desktop agent. Moves a backlog game to Playing; refuses completed/DNF games. Device-token auth. |

---

## Component inventory

| Component | Notes |
|---|---|
| `components/layout/Nav.tsx` | Client component. Hamburger + sidebar on mobile, horizontal nav on desktop |
| `components/games/GameCard.tsx` | Accepts `isOwner` prop (default `true`). Image variant uses `group` + `group-hover:scale-105` for zoom. |
| `components/games/CoverCard.tsx` | Portrait box-art card for the "cover" view — `cover_image_url` on top (placeholder tile if null), same info as `GameCard` below. Mirrors `isOwner`. |
| `components/games/GameListView.tsx` | Shared between `/games` and `/users/[username]`. Handles year grouping for completed tab. |
| `components/games/GameFilters.tsx` | Client component. Manages `status`, `sort`, `q`, and `view` URL params. Search debounced 300ms. View toggle is 3-way — grid (capsule) / cover (box art) / table — persisted via the `gameView` cookie. |
| `components/games/GameForm.tsx` | Handles create and edit. Shows completion fields when `status === 'completed'`, DNF fields when `status === 'dnf'`. Debounced replay detection on title field. |
| `components/games/MarkCompletedButton.tsx` | Two variants: `card` (small pill, no longer used on cards) and `detail` (full button). Also exports the shared `CompleteGameModal`. Stops click propagation. |
| `components/games/StatusBadge.tsx` | Covers all four statuses including `dnf` (red). |
| `components/games/DeleteGameButton.tsx` | Client component with confirmation. |
| `components/wheel/WheelClient.tsx` | Main wheel orchestrator. Manages all phases for SPIN, SPIN+REROLL, and CHOOSE turns. |
| `components/wheel/WheelAnimation.tsx` | Slot-machine CSS animation. Server-determined winner; client animates to it. |

---

## Server Actions (`app/(app)/games/actions.ts`)

| Action | Ticket behaviour |
|---|---|
| `createGame` | Grants completion rewards if `status === 'completed'` on creation |
| `updateGame` | Refuses a game that isn't the caller's. Reads the status first and writes only if it's unchanged (`STATUS_CHANGED` otherwise). `not_completed → completed`: grant. `completed → completed`: reverse + re-grant when something the reward depends on changed (hours, achievements, completion date, sequel flag, linked game). `completed → other`: reverse tickets **and** completion XP. |
| `markAsCompleted` | Grants (refuses an already-completed game; from DNF, refunds the penalty first). Same compare-and-set on status as `updateGame`. |
| `deleteGame` | Reverses a completed game's completion tickets and XP, or a DNF game's penalty, then deletes. The balance can go below zero (on purpose: otherwise complete → spend → delete → re-add would mint tickets). Both delete buttons confirm through `openDeleteConfirm` (`GameActionsMenu.tsx`), which asks `deleteImpact` for the exact tickets and shows them as a small chip with the balance before/after (`deleteTicketChange`, `TicketChange` in the dialog) (`COMPLETION_TICKET_REASONS`/`DNF_TICKET_REASONS` in `lib/game-quick-actions.ts` must match the reversing SQL functions). |

"Grant" = `grantCompletionRewards` (tickets + completion XP, recorded in `completion_rewards`); "reverse" = `reverseCompletionRewards`. Rules per edition in `lib/completion-rewards.ts`.

---

## Ticket system (`lib/tickets.ts`)

`calculateCompletionAwards(hours, achievementProgress)` returns an array of `{ reason, amount }` entries:

| Condition | Reason | Tickets |
|---|---|---|
| hours < 20 | `game_completed_short` | +1 |
| 20 ≤ hours < 50 | `game_completed_medium` | +2 |
| 50 ≤ hours ≤ 100 | `game_completed_long` | +3 |
| hours > 100 | `game_completed_bonus_hours` | +1 per 20h beyond 100 |
| achievements === 100 | `achievement_100_percent` | +3 |

That's the friends edition's table (typed hours, plus `sequel_back_to_back` +1 when the sequel flag is set). The public edition uses tracked hours instead and no 100%/sequel bonus (`completionReward` in `lib/completion-rewards.ts`). `grantCompletionRewards` (`app/(app)/games/actions.ts`) calls the `award_tickets` RPC once per entry.

---

## Postgres RPC functions

**Service role only.** These are `SECURITY DEFINER` and take a user id as a
plain argument, so `db/security-hardening.sql` revokes EXECUTE from the browser
roles. Always call them through `createAdminClient()` (see `lib/tickets.ts`),
never the cookie client — from the cookie client they now fail with a
permission error. The same file limits which `profiles` columns users may update
directly; wheel state (`wheel_turn`, `pending_wheel_*`, `wheel_session`) and
`wheel_enabled` are written server-side through the service role.

| Function | Purpose |
|---|---|
| `award_tickets(p_user_id, p_amount, p_reason, p_game_id?, p_note?)` | Atomically inserts a transaction row and updates `profiles.ticket_balance`. Uses `FOR UPDATE` lock. Security definer. **Also writes `profiles.tickets_earned_total`** — that column looks unused from a codebase grep (nothing in the app reads it) but is a real dependency of this function's body, not dead. Never drop it without first checking (or updating) the function itself. |
| `reverse_game_completion_tickets(p_user_id, p_game_id)` | Deletes the game's completion-reason transactions (the `game_completed_*`, `achievement_100_percent`, `sequel_`/`series_back_to_back` reasons) and subtracts the sum of the rows it actually deleted, so two at once reverse once. Called before re-awarding on edit. Security definer. `reverse_game_dnf_tickets` works the same way for the DNF penalty. |
| `unlock_achievement(p_user_id, p_achievement_id, p_xp)` | Inserts the achievement and adds its XP in one step; a repeat does nothing (unique `(user_id, achievement_id)`). Returns whether it unlocked. `checkAndAwardAchievements` uses it; users can only **read** `user_achievements` (no write policy), since deleting your own row used to let its XP be earned again and again. |
| `spend_tickets(p_user_id, p_amount, p_reason, p_note?)` | Locks the profile, checks the balance, and spends via `award_tickets` in the same transaction. Returns false (spending nothing) if the balance is too low. Every wheel spend uses it. Balances can still go negative through the DNF penalty, by design. |
| `add_game_hours(p_user_id, p_game_id, p_delta)` | `hours_played = hours_played + delta` in one statement, Playing/Ambient games only; returns the new total or null. The tracker's session route claims each checkpoint on its `play_sessions` row (`applied_hours` compare-and-set) before calling it, so a checkpoint is applied once. |

| `record_completion_reward(p_user_id, p_game_id, p_tickets, p_xp, p_untracked, p_why)` / `reverse_completion_reward(p_user_id, p_game_id)` | Record a completion's reward in `completion_rewards` and add its XP (replacing, never doubling, an existing row) / delete it and take its XP back. From `db/batch3.sql`. Wheel history (`wheel_spins`) is likewise written only by the server (`privileged()` in the wheel actions) and is read-only for users. |
| `edition_is_public()` | Whether this database serves the public edition (`app_settings`; missing = public). Used by the read rules; callable by everyone. |
| `take_rate_limit(p_user_id, p_bucket, p_limit, p_window_seconds)` | Counts a request in `rate_limits` and says whether it's within the limit, in one statement (`db/batch4.sql`). Used through `allowRequest` in `lib/rate-limit.ts` by the IGDB-backed routes (`/api/rawg/*`, `/api/agent/identify`); fails open if the database can't be reached. |

All of these, and the "only once" rules around them, come from `db/review-fixes.sql` (code review batch 2) and `db/batch3.sql` (batch 3); `db/privileges.sql` holds every permission rule for them in one place. Status changes in `app/(app)/games/actions.ts` are written with `.eq('status', <status just read>)` and do nothing (returning `STATUS_CHANGED`) if it moved; wheel turns are ended with `claimTurn` (`wheel_turn` compare-and-set) before anything else happens, and `releaseTurn` hands a claim back if the spend/award that follows fails.

**Caveat on "unused column" audits**: a codebase grep only proves a column is unread/unwritten by the *app*. Postgres functions (`award_tickets` and friends) live in Supabase itself, not in this repo, and can reference columns invisibly to that grep. Before dropping any column, also check whether a DB function touches it (e.g. `select pg_get_functiondef(oid) from pg_proc where proname = '<fn>';` in the SQL editor) — this bit us once already (`tickets_earned_total` was dropped on 2026-09-05, silently breaking every `award_tickets` call until the column was restored).

---

## Wheel system (`app/(app)/wheel/`)

Turn cycle: **spin → spin_reroll → choose → spin → …** stored in `profiles.wheel_turn`.

Games are entered as free text (one per line, min 5) each session — not tied to the game library.

Two spin modes (user picks per session): **Elimination** (games removed each spin until one remains) or **First Land** (single spin, first hit wins).

**SPIN turn** — free spin. After the result, the user can:
- Accept (free) → advances turn
- Spin Again (−3 🎟️) → new spin, must accept; can keep paying 3 to spin again
- Spin & Reroll (−6 🎟️) → current result + 2 more optional spins → choose from up to 3 games
- Choose a Game (−9 🎟️) → free-text pick

**SPIN+REROLL turn** — free spin → optional free reroll → choose between 2 games → advances turn.

**CHOOSE turn** — free-text pick (free) → advances turn. OR skip (+2 🎟️) → advances turn.

Server actions in `app/(app)/wheel/actions.ts`: `performSpin`, `acceptSpinResult`, `paySpinAgain`, `payUpgradeToSpinReroll`, `pickUpgradeGame3`, `finalizeUpgradeChoice`, `payChooseAnyGame`, `performReroll`, `finalizeSpinReroll`, `chooseGame`, `skipChooseTurn`.

Helper in `lib/wheel.ts`: `nextWheelTurn`, `pickWinner`.

**SQL required** (run in Supabase):
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wheel_turn TEXT NOT NULL DEFAULT 'spin' CHECK (wheel_turn IN ('spin', 'spin_reroll', 'choose'));

CREATE TABLE IF NOT EXISTS public.wheel_spins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spin_type TEXT NOT NULL CHECK (spin_type IN ('spin', 'spin_reroll', 'choose')),
  spin_mode TEXT CHECK (spin_mode IN ('elimination', 'first_land')),
  result_name TEXT, option_a_name TEXT, option_b_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wheel spins" ON public.wheel_spins USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Later additions (run if missing):
ALTER TABLE public.wheel_spins ADD COLUMN IF NOT EXISTS games_list TEXT[];
ALTER TABLE public.wheel_spins ADD COLUMN IF NOT EXISTS tickets_spent INTEGER;
-- Records how a turn was actually finalized (accurate history label even when a
-- paid action overrode the turn's normal flow). Nullable — old rows fall back to
-- the turn-based label.
ALTER TABLE public.wheel_spins ADD COLUMN IF NOT EXISTS finalized_via TEXT
  CHECK (finalized_via IN ('accept','spin_again','reroll_choice','upgrade_choice','choose_any','choose','skip'));
-- Ordered list of every paid action in the turn, e.g.
-- [{"action":"spin_again","amount":3},{"action":"choose_any","amount":9}].
-- A turn can stack several paid actions; tickets_spent holds only the total, so
-- this is what lets history show the full breakdown. Nullable — old rows fall
-- back to a single aggregate row.
ALTER TABLE public.wheel_spins ADD COLUMN IF NOT EXISTS ticket_spends JSONB;

-- "DNF a wheel-won game to get your turn back": profiles remember the single most
-- recent wheel outcome (game + the turn that produced it). advanceTurn writes both
-- on every finalize (cleared when the action added no game). updateGame reverts
-- wheel_turn to pending_wheel_turn when that game is DNF'd (most-recent only; no
-- ticket refund), and consumes the pointer on DNF/completion.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_wheel_game_id UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_wheel_turn TEXT
  CHECK (pending_wheel_turn IN ('spin','spin_reroll','choose'));

-- Resumable turns: the in-progress wheel turn, so closing the tab doesn't lose
-- it. NULL means no turn underway; advanceTurn clears it on every finalize.
-- Shape is WheelSession in lib/wheel-session.ts (versioned via `v`).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS wheel_session JSONB;
```

### Resumable turns

An in-progress turn is mirrored to `profiles.wheel_session`, so closing the tab
mid-turn no longer loses it — the entry list, spin mode, elimination progress
and a result awaiting acceptance all come back.

- `lib/wheel-session.ts` holds the pure logic (validation, phase collapsing,
  elimination stepping) and is heavily unit tested. Supabase access stays in
  `app/(app)/wheel/actions.ts`, per the usual split.
- **Animation phases are never persisted.** `collapsePhase` maps each to the
  stable phase it settles into, because resuming into one would replay the spin
  and re-run its completion handler. Closing the tab mid-spin therefore lands
  you on the settled result — the winner was already decided server-side before
  the animation began, so nothing is lost by skipping the theatre.
- **`elimQueue` is stored verbatim.** `handleShuffle` rewrites its unplayed tail
  while pinning the winner last, so it cannot be regenerated from the winner.
- **Paid actions persist server-side, in the same request that spends the
  tickets.** This fixes a real bug: `paySpinAgain` (−3) and
  `payUpgradeToSpinReroll` (−6) used to deduct tickets and return the winner
  *only* in the HTTP response, so a lost response meant the tickets were gone
  with no record of what they bought. The client sends its session captured
  **before** its optimistic `spendTickets` call, so the server appends the spend
  exactly once.
- A restored turn shows a banner listing what it already cost (`resumeSummary`,
  reusing `spendNote` from `lib/wheel-history.ts`).
- Invalid, malformed or wrong-version blobs are discarded silently by
  `restoreSession` and the user simply starts fresh — a bad session must never
  break the wheel.
- There is deliberately **no** "start over" button: a turn ends by finalizing
  it (or, on a Choose turn, skipping).

---

## Game videos (YouTube)

The standalone Videos page (`/videos`, its curated library and in-site
playlists) was removed on 2026-11-19: it wasn't being used. Its `videos` and
`playlists` tables are dropped by `db/drop-videos.sql` (a migration generated
before that still creates them, unused). What remains is each game's own media
(see "Game YouTube media" above):

- `lib/youtube.ts` — pure helpers: `parseYouTubeUrl` (watch / youtu.be / shorts / embed / live / v / playlist; hosts youtube.com, m., music., youtu.be), `youtubeEmbedUrl`, `youtubeThumbnail`, `youtubeCanonicalUrl`, `mapGameVideos`. Tested in `lib/__tests__/youtube.test.ts`.
- `lib/youtube-api.ts` — **server-only** YouTube Data API v3 access (`YOUTUBE_API_KEY`): `fetchYouTubePlaylistItems` (paginated `playlistItems.list`, filters deleted/private) and `fetchPlaylistItemCounts` (up to 50 playlist ids per `playlists.list` call, 1 quota unit, for cheap change-detection).
- **Playlist auto-sync** (`app/api/cron/sync-playlists/route.ts`) — a daily Vercel Cron (`vercel.json`) mirrors each game whose `youtube_playlist_url` is a YouTube playlist into `games.youtube_videos` (adds new, drops removed, keeps order). Only playlists whose count differs from the stored `youtube_item_count` are re-fetched. Service-role admin client; guarded by `CRON_SECRET`; needs `YOUTUBE_API_KEY`.
- Components: `components/games/GameVideos.tsx`, `VideoRow` (carousel) and `VideoCard` (click-to-play thumbnail → lightbox player), all in `components/games/`.

---

## Known caveats

- **Usernames with special characters** — Usernames are derived from the email local part via the `handle_new_user` trigger (`split_part(email, '@', 1)`). Emails with `+` aliases (e.g. `user+tag@gmail.com`) produce usernames like `user+tag`, which can cause routing issues on `/users/[username]`. Prefer using user IDs in URLs in future iterations.
- **Email confirmation** — off in the friends project: its `signUp` action redirects straight to `/dashboard` when a session is returned (the email redirect flow is still there as a fallback). On in the public project (`FEATURES.secureAuth`, setup step 4) and in the local stack (`supabase/config.toml`).
- **`lib/database.types.ts` is hand-written** — It must be manually kept in sync when schema changes. The DNF status and all Phase 2–4 columns have been added manually.
- **Tests** — Vitest covers the pure rules (`lib/__tests__/`); Playwright covers every page (smoke) and the wheel's resumable turns (`e2e/`). Neither covers the desktop app, the crons, emails or OAuth; check those by hand.
