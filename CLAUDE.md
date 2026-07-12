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

- **DNF status** — `status` enum extended to `'playing' | 'completed' | 'backlog' | 'dnf'`. Requires updated CHECK constraint in Supabase (`games_status_check`). DNF games show a "Date Dropped" card on the detail page and appear in Recent Activity on the dashboard.
- **Mobile sidebar nav** — `Nav.tsx` is a client component. On mobile, a hamburger button opens a slide-in sidebar with backdrop overlay. Desktop keeps the horizontal nav unchanged.
- **Mark as Completed button** — `MarkCompletedButton` (client component) appears on `GameCard` and the game detail page for `status === 'playing'` games. Uses `useTransition` and stops click propagation inside the card link.
- **Year grouping on Completed tab** — `GameListView` renders `CompletedByYear` when `status === 'completed'`, grouping cards by `completion_date` year, newest first.
- **Search bar** — `GameFilters` includes a debounced search input (300ms) that sets `?q=` in the URL. The games query filters with `.or('title.ilike.%q%,developer.ilike.%q%')`.
- **Ticket recalculation on edit** — When a completed game's hours/achievements are edited, the old completion transactions are deleted and new ones issued via the `reverse_game_completion_tickets` Postgres RPC, keeping the ledger clean.

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

---

## Component inventory

| Component | Notes |
|---|---|
| `components/layout/Nav.tsx` | Client component. Hamburger + sidebar on mobile, horizontal nav on desktop |
| `components/games/GameCard.tsx` | Accepts `isOwner` prop (default `true`). Image variant uses `group` + `group-hover:scale-105` for zoom. |
| `components/games/GameListView.tsx` | Shared between `/games` and `/users/[username]`. Handles year grouping for completed tab. |
| `components/games/GameFilters.tsx` | Client component. Manages `status`, `sort`, and `q` URL params. Search debounced 300ms. On mobile, search moves above tabs. |
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
| `award_tickets(p_user_id, p_amount, p_reason, p_game_id?, p_note?)` | Atomically inserts a transaction row and updates `profiles.ticket_balance`. Uses `FOR UPDATE` lock. Security definer. |
| `reverse_game_completion_tickets(p_user_id, p_game_id)` | Deletes all completion-reason transactions for a game and reverses their sum from the profile balance. Called before re-awarding on edit. Security definer. |

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
```

---

## Known caveats

- **Usernames with special characters** — Usernames are derived from the email local part via the `handle_new_user` trigger (`split_part(email, '@', 1)`). Emails with `+` aliases (e.g. `user+tag@gmail.com`) produce usernames like `user+tag`, which can cause routing issues on `/users/[username]`. Prefer using user IDs in URLs in future iterations.
- **Email confirmation disabled** — Supabase email confirmation is turned off for this deployment. The `signUp` action redirects directly to `/dashboard` when a session is returned. The email redirect flow is still there as a fallback.
- **`lib/database.types.ts` is hand-written** — It must be manually kept in sync when schema changes. The DNF status and all Phase 2–4 columns have been added manually.
- **No test suite** — All verification is manual.
