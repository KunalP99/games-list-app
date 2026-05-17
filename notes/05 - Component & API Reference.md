---
tags: [gameslist, reference, components, actions]
created: 2026-04-30
---

# GamesList — Component & API Reference

A catalogue of every meaningful component and server action in the app.

---

## Routes

| URL | File | Type | Notes |
|---|---|---|---|
| `/dashboard` | `app/(app)/dashboard/page.tsx` | Server | Stats cards, chart, recent activity table |
| `/games` | `app/(app)/games/page.tsx` | Server | Game list with filters/search/sort. Defaults to `?status=completed` |
| `/games/new` | `app/(app)/games/new/page.tsx` | Server | Add game form |
| `/games/[id]` | `app/(app)/games/[id]/page.tsx` | Server | Game detail. Edit/delete only shown to owner |
| `/games/[id]/edit` | `app/(app)/games/[id]/edit/page.tsx` | Server | Edit form |
| `/users` | `app/(app)/users/page.tsx` | Server | Friends list — excludes current user |
| `/users/[username]` | `app/(app)/users/[username]/page.tsx` | Server | Read-only game list for another user |
| `/tickets` | `app/(app)/tickets/page.tsx` | Server | Full ticket ledger, all users, paginated 20/page |
| `/wheel` | `app/(app)/wheel/page.tsx` | Server | Wheel setup + client-side spin orchestration |
| `/achievements` | `app/(app)/achievements/page.tsx` | Server | Achievement grid, locked/unlocked state |
| `/settings` | `app/(app)/settings/page.tsx` | Server | Profile, security, appearance forms |
| `/login` | `app/(auth)/login/page.tsx` | Server | Sign-in form |
| `/signup` | `app/(auth)/signup/page.tsx` | Server | Sign-up form |

---

## Layout Components

### `Nav`
**Path:** `components/layout/Nav.tsx` | **Type:** Client

The app's top navigation bar.

- Desktop: floating pill with logo, nav links, ticket balance badge, `UserDropdown`
- Mobile: hamburger button + slide-in sidebar with nav links, Settings link, sign out
- Closes sidebar on route change (watches `pathname`)
- Ticket balance badge animates on increase (`animate-ticket-gain`)

**Props:** `{ profile: Profile }`

---

### `UserDropdown`
**Path:** `components/layout/UserDropdown.tsx` | **Type:** Client

Avatar-triggered dropdown in the desktop navbar.

- Trigger: accent-coloured avatar circle + display name + chevron
- Panel: user info header, Settings link, theme toggle, sign out form
- Closes on click outside (`mousedown` listener)
- Theme toggle switches `html.dark` and writes to `localStorage`

**Props:** `{ profile: Profile }`

---

### `ThemeInitialiser`
**Path:** `components/layout/ThemeInitialiser.tsx` | **Type:** Client

Invisible component that applies theme and accent palette on mount.

- Reads `preference` and toggles `html.dark` + writes to `localStorage`
- Calls `applyAccentPalette(accentColour)` from `lib/accent.ts` to set all `--brand-*` CSS variables

**Props:** `{ preference: 'light' | 'dark' | 'system'; accentColour: string | null }`

---

### `AchievementProvider`
**Path:** `components/layout/AchievementProvider.tsx` | **Type:** Client

Context provider wrapping the app layout. Manages the achievement flash notification queue.

- Receives initial achievement IDs from a cookie (set by server actions)
- Fetches achievement metadata and queues toast animations
- Renders toast UI with slide-in/dismiss animations

**Props:** `{ children: ReactNode; initialAchievements: string[] }`

---

## Game Components

### `GameCard`
**Path:** `components/games/GameCard.tsx` | **Type:** Client (partially)

Displays a game in list/grid view. Links to the game detail page.

- Cover image with hover zoom (`group-hover:scale-105`)
- Status badge, rating stars, hours played
- `MarkCompletedButton` shown when `status === 'playing'` and `isOwner`

**Props:** `{ game: Game; isOwner?: boolean }`

---

### `GameListView`
**Path:** `components/games/GameListView.tsx` | **Type:** Server

Renders a list of `GameCard` components. Used on `/games` and `/users/[username]`.

- When `status === 'completed'`, renders `CompletedByYear` — groups cards by `completion_date` year, newest first
- For other statuses, renders a flat grid

**Props:** `{ games: Game[]; status: string; isOwner?: boolean }`

---

### `GameFilters`
**Path:** `components/games/GameFilters.tsx` | **Type:** Client

Tab bar + sort dropdown + search input. Manages URL params (`?status=`, `?sort=`, `?q=`).

- Search input debounced 300ms before updating URL
- On mobile, search bar renders above the tab row

---

### `GameForm`
**Path:** `components/games/GameForm.tsx` | **Type:** Client

Handles both create and edit. Debounces title field to check for existing games (replay detection).

- Shows completion fields (`completion_date`, `rating`, `achievement_progress`, `review`) when `status === 'completed'`
- Shows DNF field (`completion_date` labelled as "Date Dropped") when `status === 'dnf'`
- RAWG search button fetches cover image, description, genres

---

### `MarkCompletedButton`
**Path:** `components/games/MarkCompletedButton.tsx` | **Type:** Client

Two variants: `card` (small pill, stops click propagation inside the card link) and `detail` (full-width button).

Uses `useTransition` to show a loading state without blocking the UI.

**Props:** `{ gameId: string; variant: 'card' | 'detail' }`

---

### `StatusBadge`
**Path:** `components/games/StatusBadge.tsx` | **Type:** Server

Coloured pill for game status. Handles `playing` (blue), `completed` (green), `backlog` (zinc), `dnf` (red).

**Props:** `{ status: string }`

---

### `DeleteGameButton`
**Path:** `components/games/DeleteGameButton.tsx` | **Type:** Client

Confirmation dialog before calling the `deleteGame` server action.

---

### `PlatformSelect`
**Path:** `components/games/PlatformSelect.tsx` | **Type:** Client

Custom searchable dropdown for platform selection. Uses design system tokens for full dark mode support.

---

## Wheel Components

### `WheelClient`
**Path:** `components/wheel/WheelClient.tsx` | **Type:** Client

Main wheel orchestrator. Manages all phases across the three turn types (Spin, Spin+Reroll, Choose).

Phase state machine:
- `setup` → `spinning` → `result` → (various sub-phases depending on turn type)
- Accepts/rejects results, handles ticket spend confirmations, final game selection

**Props:** `{ profile: Profile; initialGames?: string[] }`

---

### `WheelAnimation`
**Path:** `components/wheel/WheelAnimation.tsx` | **Type:** Client

Slot-machine CSS animation. The winner is determined server-side; the component animates to it using a CSS keyframe that lands on the correct item.

---

## Settings Components

### `SettingsForms`
**Path:** `app/(app)/settings/SettingsForms.tsx` | **Type:** Client

Three-section form component for the settings page.

**Sections:**
1. **Profile** — display name (editable), username and email (read-only)
2. **Security** — new password + confirm password
3. **Appearance** — Light/Dark/System theme pills, accent colour picker with live preview

On colour picker `onChange`: calls `applyAccentPalette` immediately for real-time preview.
On appearance save: applies theme and accent to `document` before the server rerender.

**Props:** `{ profile: Profile; email: string }`

---

## Server Actions

### Games — `app/(app)/games/actions.ts`

| Action | Description | Ticket Behaviour |
|---|---|---|
| `createGame(formData)` | Inserts a new game | Awards if `status === 'completed'` |
| `updateGame(formData)` | Updates an existing game | `not_completed→completed`: award; `completed→completed`: reverse+re-award; `completed→other`: reverse only |
| `markAsCompleted(gameId)` | Sets status to completed | Always awards (only callable from `playing`) |
| `deleteGame(gameId)` | Deletes a game | No ticket change |
| `fetchRawgGames(query)` | Searches RAWG API | — |

### Settings — `app/(app)/settings/actions.ts`

| Action | Description |
|---|---|
| `updateProfile(formData)` | Updates `display_name` |
| `updatePassword(formData)` | Validates match + min length; calls `supabase.auth.updateUser` |
| `updateAppearance(formData)` | Updates `theme_preference` and `accent_colour` |

### Wheel — `app/(app)/wheel/actions.ts`

| Action | Turn | Description |
|---|---|---|
| `performSpin(games, mode)` | Spin | Executes a spin, records in `wheel_spins` |
| `acceptSpinResult(game)` | Spin | Advances to next turn |
| `paySpinAgain(games)` | Spin | Deducts 3 tickets, spins again |
| `payUpgradeToSpinReroll(games)` | Spin | Deducts 6 tickets, upgrades to Spin+Reroll mode |
| `pickUpgradeGame3(game)` | Spin | Picks third game in upgrade flow |
| `finalizeUpgradeChoice(game)` | Spin | Final selection in upgrade flow |
| `payChooseAnyGame(game)` | Spin | Deducts 9 tickets, free choice |
| `performReroll(games)` | Spin+Reroll | Free reroll |
| `finalizeSpinReroll(game)` | Spin+Reroll | Final selection from 2 options |
| `chooseGame(game)` | Choose | Free-text pick, advances turn |
| `skipChooseTurn()` | Choose | Awards 2 tickets, advances turn |

### Auth — `app/(auth)/login/actions.ts`

| Action | Description |
|---|---|
| `signIn(formData)` | Email/password login |
| `signUp(formData)` | Registration; redirects to `/dashboard` if session returned |
| `signOut()` | Signs out and redirects to `/login` |

---

## Library Utilities

### `lib/tickets.ts`
- `calculateCompletionAwards(hours, achievementProgress)` → `{ reason, amount }[]`
- `awardCompletionTickets(supabase, userId, gameId, hours, achievementProgress)` → calls RPC for each award

### `lib/wheel.ts`
- `nextWheelTurn(current)` → the next turn type in the cycle
- `pickWinner(games)` → randomly selects a game from the list

### `lib/achievements.ts`
- Achievement definitions array
- `checkAndUnlockAchievements(supabase, userId)` → checks all unearned achievements
- `getLevel(xp)`, `xpForLevel(level)`, `levelProgress(xp)` — XP maths
- `gameCompletionXp(hours, achievementProgress)` — XP awarded on completion
- `readFlashAchievements()` — reads and clears the achievement cookie

### `lib/accent.ts`
- `applyAccentPalette(hex)` — generates 11-shade brand palette from hex colour and sets `--brand-*` CSS variables on `:root`

### `lib/constants.ts`
- Ticket costs, award amounts, XP values, wheel rules — all in one place

---

## See Also

- [[00 - Project Overview]]
- [[02 - Architecture]]
- [[03 - Database Schema]]
