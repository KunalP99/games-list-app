# Changelog

All notable changes to **GamesList** are documented here, newest first.

---

## [Unreleased]

### Added
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
