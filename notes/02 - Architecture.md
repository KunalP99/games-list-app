---
tags: [gameslist, architecture, nextjs, supabase]
created: 2026-04-30
---

# GamesList — Architecture

## Directory Structure

```
app/
  (auth)/           # Unauthenticated pages — login, signup
  (app)/            # Authenticated pages — all protected routes
    dashboard/
    games/
      [id]/
      [id]/edit/
      new/
    users/
      [username]/
    tickets/
    wheel/
    achievements/
    settings/
  api/
    achievement-flash/  # Route handler for achievement cookie
  auth/
    callback/           # Must be outside route groups to match Supabase redirect URL
  layout.tsx          # Root layout — fonts, inline theme script
  globals.css         # Design tokens, keyframes

components/
  layout/
    Nav.tsx             # Client component — hamburger + sidebar + desktop nav
    UserDropdown.tsx    # Avatar dropdown with settings/theme/sign-out
    ThemeInitialiser.tsx
    AchievementProvider.tsx
  games/
    GameCard.tsx
    GameForm.tsx
    GameFilters.tsx
    GameListView.tsx
    MarkCompletedButton.tsx
    StatusBadge.tsx
    DeleteGameButton.tsx
    PlatformSelect.tsx
  wheel/
    WheelClient.tsx
    WheelAnimation.tsx

lib/
  supabase/
    server.ts           # Cookie-based client for Server Components / Actions
    client.ts           # Browser client for Client Components
  database.types.ts     # Hand-written mirror of Supabase schema
  types.ts              # Re-exports Row types as named aliases (Profile, Game, etc.)
  tickets.ts            # calculateCompletionAwards, awardCompletionTickets
  wheel.ts              # nextWheelTurn, pickWinner
  achievements.ts       # Achievement definitions, unlock logic, XP functions
  accent.ts             # applyAccentPalette — CSS variable palette generator
  constants.ts          # Ticket costs, award amounts, wheel rules
```

---

## Route Groups

Next.js route groups (`(auth)` and `(app)`) let the folder name be omitted from the URL. The `(app)` group has its own `layout.tsx` that:

1. Verifies the user session — redirects to `/login` if missing
2. Fetches the user's profile row
3. Renders `Nav`, `ThemeInitialiser`, and `AchievementProvider` around `{children}`

The `app/auth/callback/route.ts` route handler sits outside both groups so Supabase can redirect to `/auth/callback` after email confirmation.

---

## Supabase Client Pattern

Two clients — never mix them:

```ts
// Server Components, Server Actions, Route Handlers
import { createClient } from '@/lib/supabase/server'

// Client Components only
import { createClient } from '@/lib/supabase/client'
```

The server client reads and writes cookies via `next/headers`. The browser client uses the Supabase anon key and relies on the cookie set by the server client.

---

## Data Fetching

- **Reads** — Server Components fetch directly using the server Supabase client. No API routes for reads.
- **Mutations** — Server Actions in `actions.ts` files co-located with their route. All mutations call `revalidatePath` to bust the Next.js cache.

---

## Server Action Pattern

All actions return a discriminated union:

```ts
type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
```

Auth actions (`signIn`, `signUp`) use a simpler shape: `{ error: string } | { success: string }`.

Client components call actions directly (no fetch/API overhead), check the result, and display inline status messages.

---

## Styling System

### Design Tokens

All neutral colours are CSS custom properties defined in `globals.css`, mapped to Tailwind classes in `tailwind.config.ts`:

| Token | Light | Dark |
|---|---|---|
| `surface-page` | zinc-50 | #181818 |
| `surface-base` | white | #242424 |
| `surface-elevated` | white | #1f1f1f |
| `surface-input` | white | #2a2a2a |
| `surface-hover` | zinc-50 | #2a2a2a |
| `surface-active` | zinc-100 | #333333 |
| `fg-base` | zinc-900 | #F7F7F7 |
| `fg-secondary` | zinc-700 | #D4D4D4 |
| `fg-muted` | zinc-500 | #A3A3A3 |
| `fg-subtle` | zinc-400 | #737373 |
| `edge-base` | zinc-200 | #333333 |
| `edge-input` | zinc-200 | #3d3d3d |
| `edge-subtle` | zinc-100 | #252525 |

### Brand / Accent Palette

The `brand-*` Tailwind scale is backed by CSS variables (`--brand-50` through `--brand-950`) set to space-separated RGB values. This format supports Tailwind's opacity modifier syntax (`bg-brand-600/30`).

On every page load, `ThemeInitialiser` generates a full 11-shade palette from the user's saved accent colour using HSL interpolation and sets all the CSS variables on `:root`. This means every `brand-*` class in the app adapts automatically — buttons, badges, focus rings, gradients, text.

### Dark Mode

Dark mode uses the `class` strategy — `html.dark` is toggled. An inline `<script>` in `app/layout.tsx` reads `localStorage` before React hydrates to prevent a flash of wrong theme. The `ThemeInitialiser` client component re-applies the correct mode from the user's DB preference on each app page load.

---

## Ticket Ledger Integrity

The `ticket_transactions` table is append-only. The running balance is cached in `profiles.ticket_balance` for fast reads. All writes go through the `award_tickets` Postgres RPC which uses a `FOR UPDATE` row lock to prevent race conditions:

```sql
-- Simplified version of the RPC
UPDATE profiles SET ticket_balance = ticket_balance + p_amount WHERE id = p_user_id;
INSERT INTO ticket_transactions (...) VALUES (...);
```

When a completed game is edited (hours/achievements change), `reverse_game_completion_tickets` deletes the old completion transactions and reverses their sum, then new awards are issued.

---

## Authentication Flow

```
User visits /dashboard
  → middleware.ts runs on every request
  → supabase.auth.getUser() checks the session cookie
  → if no session: redirect to /login
  → if session: app/(app)/layout.tsx fetches profile
    → if no profile row: sign out + redirect to /login (avoids redirect loop)
    → render Nav + children
```

Sign-up creates an auth user, which triggers `handle_new_user` to insert a `profiles` row with the username derived from the email.

---

## Testing

Vitest with jsdom environment. Tests cover pure logic functions only (no database, no HTTP):

- `lib/__tests__/tickets.test.ts` — completion award calculations
- `lib/__tests__/wheel.test.ts` — turn cycle and winner selection  
- `lib/__tests__/achievements.test.ts` — XP, level maths, game completion XP

A PostToolUse hook in `.claude/settings.json` runs `npm test` automatically after every file edit during Claude sessions.

---

## See Also

- [[00 - Project Overview]]
- [[03 - Database Schema]]
- [[05 - Component & API Reference]]
