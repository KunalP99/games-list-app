---
tags: [gameslist, features, phases]
created: 2026-04-30
---

# GamesList — Feature Log

A chronological record of what was built in each phase, plus post-phase additions.

---

## Phase 1 — Auth & Shell

**Goal:** get a working app that someone can log into.

- Supabase project setup with email/password auth (confirmation disabled for simplicity)
- `handle_new_user` Postgres trigger — auto-creates a `profiles` row on signup, deriving `username` from the email local part
- Login and signup pages under `app/(auth)/`
- Middleware redirects — authenticated users bounce off `/login`, unauthenticated users bounce off all app routes
- Basic nav shell and app layout
- Row-level security enabled on all tables

---

## Phase 2 — Game Library CRUD

**Goal:** the core of the app — adding and tracking games.

- `games` table with full schema: title, developer, status, hours, completion date, rating, review, notes, cover image, platform, flags (favourite, replay, sequel, in_wheel)
- Game list page with tab filters (playing / completed / backlog / DNF) and sort options
- Game detail page with all metadata displayed, edit and delete controls
- Add game form and edit game form, shared via `GameForm` component
- Cover image fetched via RAWG API (game database) — search by title, pull `background_image`
- `MarkCompletedButton` — one-click completion for playing games, appears on card and detail page
- Platform dropdown (custom searchable select component)
- Replay detection — debounced title check on the form warns if the game exists in your history
- Favourites flag and sequel flag
- Completed games grouped by year on the completed tab
- `is_sequel` and `is_replay` flags tracked for bonus ticket logic

**Ticket awards introduced:**

| Condition | Tickets |
|---|---|
| < 20 hours | +1 |
| 20–49 hours | +2 |
| 50–100 hours | +3 |
| > 100 hours | +1 per 20h beyond 100 |
| 100% achievements | +3 |

---

## Phase 3 — UI Overhaul & Polish

**Goal:** make it look like a real product.

- Full design token system — all colours expressed as CSS custom properties (`--color-surface-*`, `--color-fg-*`, `--color-edge-*`), mapped to Tailwind via `tailwind.config.ts`
- Dark mode — `html.dark` class toggled by an inline `localStorage` script in `app/layout.tsx` to prevent flash on load
- Star rating system on game cards and detail page
- Cover image zoom effect on game cards (`group-hover:scale-105`)
- Dashboard with stat cards, chart, and recent activity table
- Status badges with colour coding across all four states
- Search bar on the games list with 300ms debounce, sets `?q=` in URL
- Mobile sidebar navigation — hamburger + slide-in drawer with backdrop overlay
- Floating pill navbar (frosted glass, `backdrop-blur-xl`)

---

## Phase 4 — Ticket Economy & Wheel

**Goal:** the gamification centrepiece.

- `ticket_transactions` append-only ledger — every earn/spend recorded with reason, `balance_before`, `balance_after`
- `award_tickets` Postgres RPC — atomically inserts transaction and updates `profiles.ticket_balance` using `FOR UPDATE` row lock
- `reverse_game_completion_tickets` RPC — used when editing a completed game to undo and re-issue awards cleanly
- Ticket recalculation on game edit (if status changes to/from completed)
- Ticket history page — all users' transactions grouped by game event, paginated, with reason badge key
- **Wheel system:**
  - Games entered as free text per session (not tied to the library)
  - Two spin modes: Elimination and First Land
  - Three turn types rotating in cycle: Spin → Spin+Reroll → Choose → repeat
  - **Spin turn:** free spin → accept (free) / spin again (−3) / upgrade to spin+reroll (−6) / choose freely (−9)
  - **Spin+Reroll turn:** free spin → optional free reroll → pick from up to 2 results
  - **Choose turn:** free-text pick (free) or skip for +2 tickets
  - Animated slot-machine wheel component
  - `wheel_spins` table logs every spin with type, mode, and result

---

## Phase 5 — Achievements

**Goal:** reward milestones and keep engagement up.

- `user_achievements` table tracking unlock timestamps
- 20+ achievements across categories: completion milestones, playtime milestones, backlog clearing, rating behaviour, streaks, platform variety
- `getLevel` / `xpForLevel` / `levelProgress` — XP level curve
- `gameCompletionXp` — XP awarded on completion, scales with hours and achievements
- `award_xp` Postgres RPC — atomically updates `profiles.xp`
- Achievement flash notifications — toast popup with slide-in animation, queued if multiple unlock at once
- `AchievementProvider` context — wraps the app layout, receives pending achievements from a cookie set by server actions
- Achievements page at `/achievements` — grid of locked/unlocked badges with progress hints
- Rarity tiers: Common, Uncommon, Rare — Rare achievements have a spinning conic-gradient border animation

---

## Phase 6 — Changelog (Deferred)

A public-facing changelog page backed by a `changelog_entries` table was planned but deprioritised. The table exists in the schema but the page was not built.

---

## Post-Phase Additions

These features were added after the phase plan was complete, driven by day-to-day use.

### DNF Status
Added a fourth game status — "Did Not Finish". Requires a `games_status_check` constraint update in Supabase. DNF games show a "Date Dropped" card on the detail page and appear in Recent Activity on the dashboard.

### Nav Logo Redesign
The original text-only logo was replaced with a branded mark:
- An orange gradient rounded square containing an abstract SVG (play triangle + three horizontal bars)
- Two-tone wordmark: "Games" in neutral text, "List" in brand colour
- Orbitron gaming font for the wordmark

### User Dropdown + Settings Page
Replaced the plain username + separate sign-out button in the nav with a YouTube-style dropdown (avatar circle, user info, Settings link, theme toggle, sign out). Added a full `/settings` page with three sections: Profile, Security, Appearance.

### Dynamic Accent Colour
The user's chosen accent colour dynamically drives the entire `brand-*` Tailwind palette via CSS custom properties. Changing the colour in Settings gives a live preview across all buttons, badges, gradients, and text.

---

## See Also

- [[00 - Project Overview]]
- [[03 - Database Schema]]
- [[05 - Component & API Reference]]
