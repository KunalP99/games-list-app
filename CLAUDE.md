# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run Next.js linter
```

No test suite is currently configured.

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

Tailwind CSS with the Geist Sans font. Violet (`violet-600`) is the brand accent colour. Zinc is used for all neutral/grey elements.

### Phased build plan

The app is built in phases. The full implementation plan (including all database SQL per phase) is at:
`C:\Users\kunal\.claude\plans\claude-prompt-build-lexical-cookie.md`

Current status: **Phase 1 complete** (auth, middleware, dashboard shell). Phase 2 (game CRUD) is next.
