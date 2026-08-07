# Changelog

All notable changes to **GamesList** are documented here, newest first.

---

## [Unreleased]

### Added
- **"Also played by" card** on the game detail page — a small card under the About section listing other users who have the same game (currently playing it or completed it), with their avatar, name, and status, linking to their profile. Sits in the right sidebar on wide screens (under Dates on mobile). Currently-playing users are shown first.
- **Playlists auto-sync from YouTube** — a daily Vercel Cron job (`/api/cron/sync-playlists`) mirrors every playlist that was imported from a YouTube playlist against its source: new videos are pulled in, videos removed upstream are dropped, and order is kept. Works for both the Videos-page playlists (those whose "Watch on YouTube" link is a playlist) and game-page playlist media. Quota-friendly — one batched `playlists.list` reads up to 50 playlists' video counts per call, and only playlists whose count changed are re-fetched. Needs `YOUTUBE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and (recommended) `CRON_SECRET` on Vercel. SQL: `ALTER TABLE public.playlists ADD COLUMN IF NOT EXISTS youtube_item_count INTEGER, ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ; ALTER TABLE public.games ADD COLUMN IF NOT EXISTS youtube_item_count INTEGER;`
- **Infinite scroll on game search** — every game search bar (the add/edit form, and both wheel search boxes) now loads more results as you scroll to the bottom of the dropdown, instead of stopping at the first handful. Backed by a paginated `/api/rawg/search` (`page` param + `hasMore`) shared via `fetchGameSearchPage`.
- **Pick a game's image** in the add/edit form — after choosing a game from search, a gallery of its IGDB artworks and screenshots appears; click one to set the game's banner (used on the list card and the detail-page hero). Defaults to the auto-selected key art, so leaving it alone keeps the previous behaviour. Backed by a new `/api/rawg/images/[id]` route and `getGameImages`.
- **Artwork banner** on the game detail page — the hero now uses IGDB's official landscape key art (like igdb.com game pages), falling back to a screenshot. Stored in a new `games.artwork_url`.
- **Box Art view** for the games list — a third layout alongside the capsule and list views: a grid of portrait cover art with the same info (title, developer, status, hours, rating, achievements, badges) below each. Games without a cover show a placeholder tile. Covers come from IGDB and are stored in a new `games.cover_image_url`; the toggle persists via the `gameView` cookie.
- **IGDB metadata provider** — game search, enrichment, cover art, and screenshots can now be sourced from IGDB instead of RAWG (set `METADATA_PROVIDER=igdb` with `IGDB_CLIENT_ID`/`IGDB_CLIENT_SECRET`), added because RAWG's API went down. Same shapes and UI; games store an `igdb_id`. Note: IGDB has no achievements data (that section is hidden) or dominant colour. Flip the flag back to `rawg` if RAWG returns — existing data is untouched.
- Games: **add YouTube media to a game** — paste a single video *or* a playlist URL in the game form. A playlist pulls in all its videos; a single video adds just that one. The game page shows a single large player for one video or a carousel for several (click-to-play lightbox), plus a watch-on-YouTube link for playlists. Anything you add to a game **also appears on the Videos page automatically** (one row per game, linking back to it). Stored in `games.youtube_videos`.
- Videos page: **search + sort**. A search box finds any matching video across all sources (standalone, playlists, and games) and shows them as a flat grid; clearing it returns to the carousels. A Newest/Oldest sort orders the rows (and search results) by when the media was added.
- Videos: **import a whole YouTube playlist** — in the playlist builder, paste a YouTube playlist link and hit Import to pull in all its videos (title + watch-on-YouTube link pre-filled); edit or remove any before creating. Uses the YouTube Data API (`YOUTUBE_API_KEY`).
- **Videos page** (`/videos`) — a curated library of YouTube videos and in-site playlists you and your friends have made. Everyone can browse; a curator (admin) adds entries by pasting a YouTube URL, with the title, thumbnail, and channel fetched automatically from YouTube. Video cards are click-to-play (thumbnail swaps to an inline player). Playlists are built here from individual videos (via a "Make a playlist" toggle), expand inline to reveal their videos, and can carry an optional YouTube playlist link for a "watch on YouTube" option. Backed by new `videos` + `playlists` tables and a `profiles.is_admin` curator flag.
- Wheel history now shows the **action actually taken** rather than only the turn type — a paid Spin Again reads "Spin Again", a paid Choose a Game reads "Chose a Game", etc. Backed by a new `wheel_spins.finalized_via` column; older spins fall back to their turn-based label.
- On a Spin + Reroll history card where the user rerolled, the game they rerolled **away from** (the runner-up) is now highlighted, making it clear which game was chosen over the other.
- Wheel history now shows a **full breakdown of every paid action in a turn**, one row each — so spinning again (−3) and then paying to choose a game (−9) reads as two separate lines rather than a single misleading "−12". Repeated actions collapse with a count (e.g. "You spun again (×2) −6"). Backed by a new `wheel_spins.ticket_spends` column; older spins fall back to a single aggregate row.

### Fixed
- **Wheel wins now save the game's full details.** When you added a game to the wheel from search (not already in your backlog) and it won, the new "Playing" entry was missing its **developer** — and also its box-art cover and artwork banner. The auto-add now fills those in from the game's metadata, so a won game looks the same as one added via the form. Games flipped from your backlog were already complete and are unaffected.
- **Ticket achievements** (First Earnings / Getting There / Century Club / Ticket Hoarder) now track your **true lifetime tickets earned**, summed from the ledger, instead of the cached `profiles.tickets_earned_total` column — which was never kept in sync (the `award_tickets` RPC only updates the spendable balance), so the achievements under-counted and unlocked late. They now reflect every ticket you've earned and can't drift; existing totals were corrected to match the ledger.
- Games added to the backlog from the "Recommended by your friends" card now carry their RAWG id (and are enriched with description/colour/release date). Previously they were saved without a RAWG link, so on the wheel they showed no cover art and — when won — were not added to your library as Playing. Now they display their cover and correctly flip to Playing on a win.
- Wheel now builds its list from RAWG search — a search box with a live dropdown replaces the free-text games box; picking a result adds a real game (with cover art), and you can still press Enter to add a custom title for anything not on RAWG. Backlog games can be one-click added and carry their RAWG identity.
- Wheel winners auto-add to your library as "Playing" — on the **spin**, **spin & reroll**, and **choose** turns, the game you end up with (including the paid "Choose a Game" option, now RAWG-searchable) is added to your library. A won game already in your **backlog** flips to Playing; a game you've already **Completed** starts a fresh entry flagged as a replay; games already Playing (or a replay in progress) or DNF are left untouched. Custom free-text entries still win but aren't added. This applies to both the wheel result and the Choose turn. Existing copies are matched by RAWG id, falling back to a case-insensitive title match so older/imported entries without a RAWG link are still recognised.
- "What's New" popup — appears on authenticated pages after a new release for 7 days, backed by the `changelog_entries` table; includes a "Don't show again" checkbox that stores the dismissed entry's id in localStorage
- "Date Started" field on the game form (shown for any non-backlog status); on the game detail page, completed games now show how many days it took to complete (start date → completion date)
- Public/private toggle for notes on the game form — defaults to Public for new games; public notes are visible to everyone viewing the game, private notes only to the owner. Existing notes remain private by default.
- RAWG search dropdown on the wheel's "Choose your next game" input — picking a result auto-adds the game to your library with status "Playing" and today's start date. If the game already exists in your library it switches to Playing instead of duplicating. Free-text confirmations still work as a fallback.
- User dropdown on the navbar — clicking the avatar circle opens a panel with user info, Settings link, theme toggle, and sign out
- `/settings` page with three sections: Profile (display name), Security (password change), and Appearance (theme preference + accent colour picker)
- `ThemeInitialiser` component — applies the user's saved theme preference from the database on every page load, keeping localStorage in sync
- Accent colour persisted in `profiles.accent_colour` — used for the avatar circle in the dropdown and as a tinted row highlight on the Ticket History page
- Dynamic brand palette — the entire `brand-*` Tailwind colour scale (buttons, badges, focus rings, gradients, text) now adapts to the user's saved accent colour via CSS custom properties; the Settings colour picker shows a live preview as you drag
- 23 new achievements across all categories: completion milestones up to 500 games, 100% completions up to 100 games, replays up to 30, hours up to 2,500, 10-platform variety, library size up to 1,000 games, and several dedication/misc additions
- Mark as Completed modal on the game detail page — prompts for hours, star rating (half-star support), achievement progress, and completion date before saving; star fill uses the user's accent colour gradient
- Dashboard bar chart and radar chart now use the user's accent colour instead of the hardcoded orange
- Achievement toast popup is now clickable — navigates to `/achievements` and scrolls directly to the unlocked achievement card; a "View →" label appears on hover

### Changed
- Dashboard **friend cards now use each friend's own accent colour** — their avatar, "playing" label, and ticket pill are tinted with the colour that friend picked, instead of your brand colour.
- Video cards (game-page playlists and the Videos page) are now a **uniform size** — the title is kept to a single line and long titles truncate with an ellipsis, so cards no longer vary in height by title length.
- Game search bars now show **portrait box-art covers** instead of the wide screenshot — in the add/edit game form's search, and across the wheel (the builder search, the entries list, and the Choose-a-game search) — so picking a game looks like a shelf of covers. Falls back to the wide image when a game has no cover.
- The **Now Playing** strip on the games list now always uses the capsule card, even in Box Art view — only the main list below it switches to portrait covers.
- **Box Art (portrait) is now the default games-list view** for everyone — new users, and anyone who hasn't explicitly switched, land on the cover-art grid instead of the capsule grid. Anyone who previously chose a different view keeps it (their `gameView` cookie), and the grid/table toggles still work.
- Game detail page now uses a two-column layout on wide screens — the **About** section moves into a sticky right-hand sidebar, with stats, dates, review, achievements, DLC, and screenshots in the main column on the left. On narrow screens it stacks as before.
- Nav logo icon replaced with an abstract play-triangle + list-bars mark (unique, abstract, reads clearly at small sizes)
- Desktop navbar right section replaced: ThemeToggle + username span + sign-out form → compact `UserDropdown` component
- Mobile sidebar footer now includes a Settings link alongside sign out
- Ticket History current-user row highlight uses the user's accent colour (at 10% opacity) when set; falls back to `bg-surface-active`
- 100% achievement badge restyled with a darker emerald→teal→cyan gradient, drop shadow, and glass ring

---

## 2026-04-30 — Polish, Testing & Changelog

### Added
- Logo icon mark — gradient violet rounded square with an inline SVG game controller (d-pad + four face buttons)
- Orbitron gaming font (via `next/font/google`) scoped to the logo wordmark only
- Vitest test suite — 45 tests across three files covering core logic:
  - `lib/__tests__/tickets.test.ts` — completion award calculations
  - `lib/__tests__/wheel.test.ts` — turn cycle and winner selection
  - `lib/__tests__/achievements.test.ts` — XP, level, and game completion XP
- `npm test` (single run) and `npm run test:watch` scripts
- PostToolUse hook in `.claude/settings.json` — automatically runs `npm test` after every file edit during Claude sessions

### Changed
- Logo wordmark split into two-tone treatment: "Games" in neutral `text-fg-base`, "List" in brand colour
- Platform dropdown (`PlatformSelect`) now uses design system tokens (`bg-surface-input`, `border-edge-input`, `text-fg-base`) instead of hardcoded `bg-white` / `zinc-*` — fully dark mode compatible
- Ticket history page — current user rows now highlighted in amber (`bg-amber-50/60 dark:bg-amber-900/20`) instead of brand violet; "You" username label also in amber

---

## 2026-04-28 — Phase 3: UI Overhaul, Charts & Dark Mode

### Added
- Floating glass pill navbar with backdrop blur (`backdrop-blur-xl`)
- Theme toggle — switches between dark and light mode, persisted to `localStorage`
- Full dark mode retheme: zinc neutral surfaces, orange brand (`#FF5722`), purple accent (`#673AB7`)
- Dashboard bar chart — games completed per year with cover art on hover (Recharts)
- Dashboard radar chart (genres played) and pie chart (platforms used)
- Rating system — 1–5 scale with 0.5 step increments, replacing the previous /10 system
- Achievement display on game detail page with rarity-coloured borders
- RAWG screenshot gallery on game detail page
- Mobile sidebar nav — hamburger button opens a slide-in drawer with backdrop overlay
- Mark as Completed quick-action button on `GameCard` and the game detail page (playing → completed)
- Ticket ledger page (`/tickets`) — full transaction history grouped by game, paginated 20 per page
- Users list page (`/users`) — all users excluding the logged-in user
- User profile page (`/users/[username]`) — read-only game list with `isOwner: false`
- Wheel page (`/wheel`) — spin animation, Elimination and First Land modes, full SPIN → SPIN+REROLL → CHOOSE turn cycle
- Debounced search bar on `/games` with `?q=` URL param (filters by title and developer)
- Year grouping on the Completed games tab

---

## 2026-04-25 — Phase 2 Extras

### Added
- Platform field with grouped autocomplete dropdown (`PlatformSelect` component — 70+ platforms across 7 groups)
- Favourite flag — star toggle on `GameForm` and `GameCard`
- Replay flag — manual toggle plus automatic detection (debounced Supabase lookup on title field)
- Cover image URL field — displays as card background with hover zoom
- Accent colour picker for per-game card styling

---

## 2026-04-24 — Phase 2: Game CRUD & Core Features

### Added
- Complete game management — create, list, detail view, edit, delete
- Status system — Playing, Completed, Backlog, DNF (Did Not Finish)
- DNF status with a Date Dropped field on the game detail page
- Game list filters (status tabs), sort (date / title / rating), and URL-synced params
- Components: `GameCard`, `GameFilters`, `GameForm`, `StatusBadge`, `DeleteGameButton`, `MarkCompletedButton`
- `GameListView` — shared between `/games` and `/users/[username]`
- Dashboard recent activity table
- Release date field on games
- Review and notes fields (shown when status is Completed or DNF)
- Owner-only edit/delete controls via `isOwner` prop
- Ticket economy — `award_tickets` and `reverse_game_completion_tickets` Postgres RPC functions
- Ticket awards on completion: +1 short / +2 medium / +3 long / +1 per 20 hrs beyond 100 / +3 for 100% achievements / +1 sequel bonus
- Ticket reversal on edit — old completion transactions deleted and reissued to keep ledger clean

---

## 2026-04-24 — Phase 1: Project Setup & Auth

### Added
- Next.js 14 App Router scaffold with TypeScript and Tailwind CSS (Geist Sans font)
- Supabase auth — email/password sign-up and login
- Middleware route protection — unauthenticated users redirected to `/login`; authenticated users redirected away from `/login`
- Route groups: `(auth)` for login/signup pages, `(app)` for all protected pages
- Server/client Supabase client split (`lib/supabase/server.ts` and `lib/supabase/client.ts`)
- Authenticated shell layout with `Nav` and per-request profile fetch
- Dashboard stub page at `/dashboard`
- README with feature overview, setup instructions, and SQL schema
