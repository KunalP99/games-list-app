# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

The app is deployed to Vercel. **Do not push changes to GitHub unless explicitly asked.** Make all code changes locally first; the user will request a push when they are ready to deploy.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run Next.js linter
npm test         # Run Vitest suite (45 tests across tickets, wheel, achievements)
```

**Run `npm test` after every change.** Test files live in `lib/__tests__/`.

## End-to-end tests (`e2e/`)

A small **Playwright** suite covers what Vitest structurally cannot: a real
browser, a real reload, state actually round-tripping through the database.
It exists specifically for the wheel's resumable-turn feature (see below) —
not a general e2e layer for the whole app. Most features stay covered by
Vitest alone; only add here when a flow's correctness genuinely depends on a
real page load/reload, not just the logic behind it.

```bash
npm run test:e2e       # run the suite (headless)
npm run test:e2e:ui    # Playwright's interactive UI mode, for debugging
```

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

- Vercel Cron doesn't fire; hit `/api/cron/*` by hand to test those.
- Signup emails go to the local mail catcher, not a real inbox.
- `local` is Postgres 17 (`supabase/config.toml`), matching production's 17.6.

## Architecture

**GamesList** is a Next.js 14 App Router app using Supabase for auth and PostgreSQL.

### Route structure

- `app/(auth)/` — unauthenticated pages (login/signup). Route group does not appear in URL.
- `app/(app)/` — authenticated pages (dashboard, games, users, tickets, wheel, changelog). Route group does not appear in URL.
- `app/auth/callback/route.ts` — must live outside route groups to match the `/auth/callback` URL Supabase sends confirmation emails to.
- `middleware.ts` — redirects unauthenticated users away from protected routes and authenticated users away from `/login`. Also refreshes the session cookie on every request.

### Supabase client pattern

Two clients — never mix them:
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

- **The in-run "already identified" sets only remember genuine dead ends.** `identified`/`identified_titles` in `Shared` (`desktop/src-tauri/src/tracker.rs`) originally suppressed re-querying for every outcome, including `added`/`tracked` — but those outcomes create a `game_executables` link, which the main matching loop reads *before* identify is ever reached, so nothing needed remembering there. The bug this caused: delete the game to retest (a normal thing to do) and the link goes with it, but the in-memory set still said "already handled" for the rest of that run — no amount of relaunching the game would ever trigger a retry, only restarting the whole app would. Now only `untracked` (Steam) and `notAGame`/`untracked` (name path) insert into these sets, since those are the only outcomes that genuinely do not change without the user acting on the site. Verified live: deleted an identified Ambient game twice in the same running app session, with no restart, and watched it re-identify and resume tracking within one poll each time.
- **Identification persists an executable link, not just a one-off flag.** `/api/agent/identify` now takes `exeName` and `platform` alongside `steamAppId`/`titleGuess`, and on a `tracked`/`added` result upserts `game_executables` exactly as `/api/agent/link` does — required because a name-identified game has no `RunningAppID` equivalent to re-recognise it by. Without this, a game filed in by `identify_other_launchers` was identifiable exactly once: `identified_titles` then suppressed re-querying it, but nothing else in the main matching loop (keyed on Steam app id or `game_executables`) could recognise it either, so it fell straight back to the "is this a game?" toast on the very next poll. `platform` is likewise passed through (`"Steam"` / `"Epic Games"`, both real `PLATFORM_GROUPS` values in `components/games/PlatformSelect.tsx`) and used only on a fresh insert — an existing row's platform is never overwritten.
- **EA App games identified automatically, same as Epic** — `desktop/src-tauri/src/ea.rs`, structurally identical to `launchers.rs` (install-folder-prefix matching, never exe-name; the server's exact-title-match is what actually guards against a wrong file). Source is `HKLM\Software\Wow6432Node\Origin Games\<contentID>`, read via `winreg` (`DisplayName` + `Install Dir` per subkey) — verified live against this machine's real registry, including that most entries there are **owned but not installed** (no `Install Dir` at all, e.g. this machine's own Bejeweled 3 / Battlefront II), which is why that value's absence is a skip, not a bug. `identify_by_title` in `tracker.rs` is the generic identification loop both Epic and EA call through (just the resolver closure and the `platform` label differ) — refactored out once a third caller existed, so the `identified_titles`-only-on-`untracked` discipline (see below) only has to be correct in one place.
- **Epic Games titles identified automatically** (`desktop/src-tauri/src/launchers.rs`, `lib/name-games.ts`) — the Steam-only sibling of `/api/agent/identify` extended to accept `titleGuess` instead of `steamAppId`. Epic's own install manifests (`%ProgramData%\Epic\EpicGamesLauncher\Data\Manifests\*.item`, JSON) give an authoritative `DisplayName` for a running exe — matched on *both* `InstallLocation` prefix and `LaunchExecutable` basename, since several real entries (Quixel Bridge, a Fab plugin) share Unreal Engine's install folder with no exe of their own, and folder-prefix alone would pick whichever happened to be read first. Unlike the Steam path, this is a **search**, not a lookup — IGDB has no Epic cross-reference — so `findGameByExactName` only trusts a result whose name matches *exactly* once both are reduced to bare lowercase letters and digits (`normaliseTitle`), and a miss is `unknown`, never `notAGame`: a search ranking quirk proves nothing, so it's never cached and never blocks the ordinary toast. GOG/itch/etc. are not covered — only Epic has manifests in this shape.
- **Link panel defaults to nothing, on purpose** — its Game `<select>` used to have no placeholder, so the browser silently pre-selected whichever Playing/Ambient game happened to be first in the list, which read as the app confidently (and wrongly) naming a game. Both selects now start blank; `desktop/src/main.js`'s game-select `change` handler guards against the placeholder's empty value.
- **"Add it as a new game" escape hatch** — the desktop link panel (`desktop/src/index.html`/`main.js`) only ever offered to attach an unrecognised program to an existing Playing/Ambient game, which was a dead end for any non-Steam launcher (Epic, GOG, itch…): Steam games get auto-filed via `/api/agent/identify`, but nothing else does. A "Can't find it? Add it as a new game" link now opens `open_site('/games/new?status=ambient&title=<guess>')` — `guessTitleFromExe` in `main.js` derives a rough title from the exe name (camelCase/digit-boundary split, strips `Win64`/`Shipping`/etc.), which `app/(app)/games/new/page.tsx`'s new `title` query param feeds into `GameForm`'s existing search box, kicking off the normal IGDB search debounce. Reuses the website's full add-game flow rather than building a second one natively.
- **Live "Playing now" presence** — a pulsing-dot badge on the game card (`components/games/LiveIndicator.tsx`, client component, ticks locally from `started_at` like the desktop app's own window) shown whenever `play_sessions` has an unended, recently-checkpointed row for that game. "Recently" is the point: `lib/presence.ts`'s `isSessionLive` treats a session as live only while checkpointed within `LIVE_STALE_AFTER_MS` (20 min) of now, since nothing ever marks a session ended if the agent crashes or the PC sleeps — recency is the only signal. The agent now sends a checkpoint immediately on starting a session (`desktop/src-tauri/src/tracker.rs`), not just periodically, so the badge appears within seconds rather than up to 15 minutes late. Visible to the owner **and to friends** (`getLiveSessions` runs through the normal RLS-scoped client, wired into `/games`, `/users/[username]`, `GameListView`, `NowPlayingGrid`, `RecentlyPlayed`) — this needed widening `play_sessions`' SELECT policy from owner-only to any authenticated user, matching `games_select_all`, since nothing else in the app gates friend visibility more tightly. SQL: `db/live-presence.sql`.
- **Ambient status** — `status` extended with `'ambient'`: ongoing games (multiplayer, sandbox) that sit outside the wheel and never complete. Added automatically by the desktop agent, which identifies a running Steam game exactly (install path → `appmanifest_*.acf` → app id → IGDB `external_games`). **IGDB membership is the "is this a game?" authority** — Blender, Wallpaper Engine and the Steamworks redistributables have no IGDB entry, which is what retires the hand-maintained ignore list. Ambient hours count toward total hours and hour achievements; ambient games are excluded from the "Games" count, library-size achievements, the genre/platform charts, the profile-banner pool, and the `/games` + profile "All" tabs (each has its own tab/strip instead). They produce **no activity-feed rows** on purpose — `lib/activity.ts`'s status chain has no `else`, and `components/games/RecentlyPlayed.tsx` is their surface instead. `decideWonGameAction` *claims* an ambient row (flips it to playing, keeping hours) rather than no-oping. SQL: `db/ambient-status.sql`.
- **DNF status** — `status` enum extended to `'playing' | 'completed' | 'backlog' | 'dnf'`. Requires updated CHECK constraint in Supabase (`games_status_check`). DNF games show a "Date Dropped" card on the detail page and appear in Recent Activity on the dashboard.
- **Mobile sidebar nav** — `Nav.tsx` is a client component. On mobile, a hamburger button opens a slide-in sidebar with backdrop overlay. Desktop keeps the horizontal nav unchanged.
- **Mark as Completed button** — `MarkCompletedButton` (client component) appears on `GameCard` and the game detail page for `status === 'playing'` games. Uses `useTransition` and stops click propagation inside the card link.
- **Year grouping on Completed tab** — `GameListView` renders `CompletedByYear` when `status === 'completed'`, grouping cards by `completion_date` year, newest first.
- **Search bar** — `GameFilters` includes a debounced search input (300ms) that sets `?q=` in the URL. The games query filters with `.or('title.ilike.%q%,developer.ilike.%q%')`.
- **Ticket recalculation on edit** — When a completed game's hours/achievements are edited, the old completion transactions are deleted and new ones issued via the `reverse_game_completion_tickets` Postgres RPC, keeping the ledger clean.
- **Game metadata provider (RAWG ↔ IGDB)** — `lib/rawg.ts` exposes the metadata API (`searchRawgGames`, `getRawgGameDetail`, `getRawgScreenshots`, `getRawgAdditions`, `getRawgAchievements`). It delegates to **IGDB** (`lib/igdb.ts`, Twitch OAuth + apicalypse; needs `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`) when `METADATA_PROVIDER=igdb`, else uses RAWG (`RAWG_API_KEY`). Provider results keep the same `Rawg*` shapes, so callers are unchanged. Each game stores its provider id in `rawg_id` **or** `igdb_id`; use `PROVIDER_ID_COLUMN` (write) and `providerIdOf(game)` (read) — never assume `rawg_id`. IGDB gaps: no achievements (`getRawgAchievements` returns `[]`) and no dominant colour (card tint absent for IGDB games). Flip `METADATA_PROVIDER` back to `rawg` if RAWG recovers — existing data is untouched. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS igdb_id INTEGER;`
- **Game YouTube media** — The game form's Media section takes a single "video or playlist" URL (`fetchGameMedia` in `games/actions.ts`): a playlist pulls all its videos (`fetchYouTubePlaylistItems`, needs `YOUTUBE_API_KEY`), a single video uses keyless oEmbed. Videos are stored inline as `games.youtube_videos` JSONB (same hidden-field pattern as `dlc`); a playlist also sets `youtube_playlist_url` (watch-on-YouTube link). The reusable `components/games/GameVideos.tsx` renders them: 2+ → `VideoRow` carousel, 1 → a single `VideoCard`, 0 + legacy `youtube_playlist_url` → the classic `videoseries` embed. **The Videos page mirrors game media live** — it reads all games with `youtube_videos` and shows one `VideoRow` per game (titled + linked to the game, read-only); since games are world-readable, no duplication/sync. `mapGameVideos` (`lib/youtube.ts`) adapts stored items to the card shape. SQL: `ALTER TABLE public.games ADD COLUMN IF NOT EXISTS youtube_videos JSONB;`
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
  - Auth is a bearer device token, stored only as a sha256 hash (`lib/agent-auth.ts`). Unlike the `CRON_SECRET` guard, a missing token always rejects.
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
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Stats, quick actions, recent activity table |
| `/games` | `app/(app)/games/page.tsx` | Game list with filters/search/sort. Defaults to `?status=completed` |
| `/games/new` | `app/(app)/games/new/page.tsx` | Add game form |
| `/games/[id]` | `app/(app)/games/[id]/page.tsx` | Game detail. Edit/delete only shown to owner (`isOwner` check) |
| `/games/[id]/edit` | `app/(app)/games/[id]/edit/page.tsx` | Edit form |
| `/users` | `app/(app)/users/page.tsx` | Friends list — excludes the current user |
| `/users/[username]` | `app/(app)/users/[username]/page.tsx` | Read-only profile. `isOwner` controls Mark Complete button visibility |
| `/tickets` | `app/(app)/tickets/page.tsx` | Full ticket ledger for all users, grouped by game, paginated 20/page |
| `/wheel` | `app/(app)/wheel/page.tsx` | Wheel spin — shows current turn, game input, spin animation, result flow |
| `/videos` | `app/(app)/videos/page.tsx` | Curated YouTube library. Everyone views; only `profiles.is_admin` curators add/remove. Click-to-play thumbnails. |
| `/api/cron/sync-playlists` | `app/api/cron/sync-playlists/route.ts` | Daily Vercel Cron. Mirrors YouTube-sourced playlists (in-site + game media) against their source. `CRON_SECRET`-guarded. |
| `/api/cron/check-releases` | `app/api/cron/check-releases/route.ts` | Daily Vercel Cron. Creates a `game_released` notification for backlog games whose `release_date` has arrived (idempotent via `games.release_notified`). `CRON_SECRET`-guarded, service-role admin client. |
| `/api/cron/check-events` | `app/api/cron/check-events/route.ts` | Daily Vercel Cron. Creates an `event_live` notification for every user when an IGDB event happens today (idempotent via the `notified_events` table). `CRON_SECRET`-guarded, service-role admin client. |
| `/api/agent/state` | `app/api/agent/state/route.ts` | Desktop agent. Playing games + their `steam_appid`, the user's exe links, and theme/accent. Device-token auth, service-role admin client. |
| `/api/agent/session` | `app/api/agent/session/route.ts` | Desktop agent. A play-session checkpoint; applies the hours delta to a **playing** game only. Device-token auth. |
| `/api/agent/link` | `app/api/agent/link/route.ts` | Desktop agent. Saves an executable → game mapping. Device-token auth. |
| `/api/agent/identify` | `app/api/agent/identify/route.ts` | Desktop agent. Steam app id → IGDB game (cached in `steam_game_ids`), then files it as **ambient** if the user doesn't own it. Writes, despite the name. Device-token auth. |
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
| `components/games/MarkCompletedButton.tsx` | Two variants: `card` (small pill) and `detail` (full button). Stops click propagation. |
| `components/games/StatusBadge.tsx` | Covers all four statuses including `dnf` (red). |
| `components/games/DeleteGameButton.tsx` | Client component with confirmation. |
| `components/wheel/WheelClient.tsx` | Main wheel orchestrator. Manages all phases for SPIN, SPIN+REROLL, and CHOOSE turns. |
| `components/wheel/WheelAnimation.tsx` | Slot-machine CSS animation. Server-determined winner; client animates to it. |

---

## Server Actions (`app/(app)/games/actions.ts`)

| Action | Ticket behaviour |
|---|---|
| `createGame` | Awards if `status === 'completed'` on creation |
| `updateGame` | Fetches existing status first. `not_completed → completed`: award. `completed → completed`: reverse + re-award. `completed → other`: reverse only. |
| `markAsCompleted` | Always awards (only callable when game is `playing`) |
| `deleteGame` | No ticket change — transactions retain `game_id` as null after cascade |

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

`awardCompletionTickets` calls the `award_tickets` RPC once per entry.

---

## Postgres RPC functions

| Function | Purpose |
|---|---|
| `award_tickets(p_user_id, p_amount, p_reason, p_game_id?, p_note?)` | Atomically inserts a transaction row and updates `profiles.ticket_balance`. Uses `FOR UPDATE` lock. Security definer. **Also writes `profiles.tickets_earned_total`** — that column looks unused from a codebase grep (nothing in the app reads it) but is a real dependency of this function's body, not dead. Never drop it without first checking (or updating) the function itself. |
| `reverse_game_completion_tickets(p_user_id, p_game_id)` | Deletes all completion-reason transactions for a game and reverses their sum from the profile balance. Called before re-awarding on edit. Security definer. |

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

## Videos system (`app/(app)/videos/`)

**Not linked from the nav** — the Videos tab was removed from `Nav.tsx`. The
route, its data and everything below still work; `/videos` is just reachable by
URL only now. Re-add an entry to `navItemsAfter` to bring the tab back.

A curated library of YouTube videos and **in-site playlists**. YouTube-only.
Everyone signed in can view; only curators (`profiles.is_admin = true`) can
add/remove — enforced in the UI, the server actions, and RLS. Video cards are
click-to-play (thumbnail → inline autoplay iframe). A **playlist** is an in-site
collection of individual videos (`playlists` row owning `videos` rows via
`videos.playlist_id`), each video's title auto-fetched. Playlist cards expand
inline to reveal their videos and can carry an optional `youtube_url` for a
"watch on YouTube" link. A standalone YouTube-playlist link can **no longer** be
added on its own — `createVideo` rejects playlist URLs and directs the user to
the playlist builder. (Legacy standalone `kind='playlist'` video rows from before
this change still render.)

- `lib/youtube.ts` — pure helpers: `parseYouTubeUrl` (watch / youtu.be / shorts / embed / live / v / playlist; hosts youtube.com, m., music., youtu.be), `youtubeEmbedUrl`, `youtubeThumbnail`, `youtubeCanonicalUrl`. Tested in `lib/__tests__/youtube.test.ts`.
- `app/(app)/videos/actions.ts` — `createVideo` (single video; rejects playlist URLs), `createPlaylist` (title + optional YouTube link + N video URLs; oEmbed per video with bounded concurrency + batch insert; rolls back if a video fails), `fetchPlaylistForImport` (pulls a YouTube playlist's videos for the preview), `deleteVideo`, `deletePlaylist` (child videos cascade). All admin-gated; per-video metadata via YouTube **oEmbed** (no key).
- `lib/youtube-api.ts` — **server-only** YouTube Data API v3 access (`YOUTUBE_API_KEY`): `fetchYouTubePlaylistItems` (paginated `playlistItems.list`, filters deleted/private) enumerates a playlist's videos; `fetchPlaylistItemCounts` batches up to 50 playlist ids into one `playlists.list` call (1 quota unit) returning each playlist's `itemCount` for cheap change-detection. Otherwise everything stays keyless. Mirrors `lib/rawg.ts`.
- **Playlist auto-sync** (`app/api/cron/sync-playlists/route.ts`) — a daily Vercel Cron (`vercel.json`) mirrors every YouTube-sourced playlist against its source: in-site playlists whose `playlists.youtube_url` is a YouTube playlist (child `videos` rows replaced to match) **and** games whose `games.youtube_playlist_url` is a playlist (`games.youtube_videos` JSONB overwritten). Full mirror (adds new, drops removed, keeps order). Uses the service-role admin client (`lib/supabase/admin.ts`, bypasses RLS). Quota-cheap: one batched count-check reads all playlists' counts; only those whose count differs from the stored `youtube_item_count` are re-fetched. Guarded by `CRON_SECRET` (Vercel Cron sends it as `Authorization: Bearer`). Needs `YOUTUBE_API_KEY` + `SUPABASE_SERVICE_ROLE_KEY` on Vercel. SQL: `ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS youtube_item_count INTEGER, ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ; ALTER TABLE public.games ADD COLUMN IF NOT EXISTS youtube_item_count INTEGER;`
- Components: `VideoCard` (click-to-play + admin remove), `PlaylistCard` (expand-inline collection + admin delete), `AddVideoForm` (modal with a "Make a playlist" toggle → dynamic video-URL rows), `DeleteVideoButton`, `DeletePlaylistButton`.
- Thumbnails use plain `<img>` with `i.ytimg.com` URLs — no `next.config.mjs` change needed. No CSP exists, so the embed iframes work.

**SQL required** (run in Supabase):
```sql
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
-- Grant the curator(s):
UPDATE public.profiles SET is_admin = true WHERE id = '<curator-user-id>';

CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','playlist')),
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author_name TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view videos" ON public.videos
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage videos" ON public.videos
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));

-- In-site playlists (added later):
CREATE TABLE IF NOT EXISTS public.playlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  youtube_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users can view playlists" ON public.playlists
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins manage playlists" ON public.playlists
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin));

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS playlist_id UUID REFERENCES public.playlists(id) ON DELETE CASCADE;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;
```

---

## Known caveats

- **Usernames with special characters** — Usernames are derived from the email local part via the `handle_new_user` trigger (`split_part(email, '@', 1)`). Emails with `+` aliases (e.g. `user+tag@gmail.com`) produce usernames like `user+tag`, which can cause routing issues on `/users/[username]`. Prefer using user IDs in URLs in future iterations.
- **Email confirmation disabled** — Supabase email confirmation is turned off for this deployment. The `signUp` action redirects directly to `/dashboard` when a session is returned. The email redirect flow is still there as a fallback.
- **`lib/database.types.ts` is hand-written** — It must be manually kept in sync when schema changes. The DNF status and all Phase 2–4 columns have been added manually.
- **No test suite** — All verification is manual.
