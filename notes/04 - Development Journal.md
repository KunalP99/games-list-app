---
tags: [gameslist, journal, decisions]
created: 2026-04-30
---

# GamesList — Development Journal

A narrative record of the decisions made while building this project — the *why* behind the *what*.

---

## Why Next.js App Router?

The App Router was chosen over Pages Router because Server Components and Server Actions eliminate the need for a separate API layer. Database reads happen directly in Server Components — no fetch, no endpoint, no serialisation overhead. Mutations go through Server Actions — no form state management library needed, no client-side API calls to write.

The tradeoff is that the mental model is more complex (when is something a Server Component vs a Client Component?), but for a project of this scale it pays off quickly. The entire app is maybe 20% client-side code.

---

## Why Supabase?

Three reasons:
1. **Auth is free and instant.** Email/password auth with sessions, cookies, and token refresh handled out of the box.
2. **Postgres RPCs.** The ticket ledger needs atomic read-modify-write operations. Being able to write a `FOR UPDATE` lock in a stored procedure and call it from the app layer is exactly the right tool.
3. **Row-level security.** The Friends feature (viewing other users' game libraries) requires controlled cross-user reads. RLS policies handle this without any app-layer filtering logic.

The tradeoff: the Supabase JS client has two flavours (server/client), and mixing them up causes subtle bugs with cookies. The convention of having `lib/supabase/server.ts` and `lib/supabase/client.ts` as two separate files makes this impossible to mix up accidentally.

---

## The Ticket Economy Design

The ticket system was designed with one core principle: **completing longer or more difficult games should feel more rewarding than quick ones, but no game should feel unrewarding.**

Every completion earns at least 1 ticket. From there:
- Short games (< 20h): +1 — these are still wins
- Medium (20–50h): +2
- Long (50–100h): +3
- Marathon (> 100h): +3 base, then +1 per extra 20 hours — uncapped
- 100% achievements: +3 bonus on top of any completion award

The spend side (wheel privileges) is more punishing: −3 to spin again, −6 to upgrade to reroll, −9 to choose freely. This creates real tension — a player sitting on 6 tickets has to think carefully.

The append-only ledger was a deliberate choice. Updating a balance field directly would be simpler, but you'd lose the audit trail. Being able to see every transaction and why it happened turns out to be useful for resolving disputes in a shared-household context.

---

## The Wheel Turn Cycle

The hardest design decision was the three-turn cycle: `spin → spin_reroll → choose → spin → …`

The goal was fairness: over any three-game stretch, everyone gets one "free" spin (no ticket cost to influence the result), one semi-controlled spin (reroll available), and one completely free choice. No player can game the system to always choose their preferred game.

The wheel also needed to support two play styles:
- **Elimination** — spins knock games out until one remains. Good for large libraries.
- **First Land** — one spin, first hit wins. Faster and more chaotic.

The player picks the mode each session, not globally. That flexibility turned out to be important — sometimes you want drama, sometimes you want to just pick.

---

## Why the Ticket Ledger is Append-Only

Early in the design, the simpler approach was: just store `ticket_balance` on the profile, increment/decrement it in Server Actions. The problem is race conditions — two server actions running concurrently could both read the same balance, apply their changes, and write different results, losing one update.

The solution is the `award_tickets` Postgres RPC which runs inside a transaction with a `SELECT FOR UPDATE` lock on the profile row. This serialises all balance changes through the database rather than the application layer.

The append-only transactions table is a side benefit — it gives you a full history for free.

---

## The Achievement System Architecture

Achievements are defined entirely in `lib/achievements.ts` as a static array of objects. Each achievement has:
- An ID
- A check function: `(games, profile) => boolean`
- Display metadata (name, description, icon, rarity)

This means adding a new achievement is a one-file change. The unlock logic runs inside Server Actions (after creating/updating a game, spinning the wheel, etc.) — it checks all achievements the user hasn't unlocked yet, runs the check function for each, and inserts rows for any that pass.

The flash notification system uses a cookie as a message queue. The Server Action writes achievement IDs to the cookie; the `AchievementProvider` client component reads them on mount, fetches the achievement details, and queues the toast animations.

---

## The Design Token System

Early versions of the app had a mix of hardcoded Tailwind colours (`zinc-800`, `white`, `gray-100`) scattered through components. Dark mode was bolted on with `dark:` prefixes, doubling the CSS classes on almost every element.

The token system (`surface-*`, `fg-*`, `edge-*`) solved this cleanly. Every element references a semantic token rather than a literal colour. Dark mode is defined once in `globals.css` under `html.dark`. Adding a new dark-mode-aware component costs zero extra lines.

The brand palette took this one step further — `brand-*` classes now reference CSS custom properties (`--brand-600: 232 68 16`). This is what enables the dynamic accent colour: changing the CSS variables at runtime changes every button, badge, and gradient simultaneously.

---

## The Live Accent Colour Preview

When the user drags the colour picker in Settings, the palette is regenerated and applied to `:root` on every `onChange` event. This means you can see the entire app's brand colour change in real time as you drag — buttons, nav active states, the logo gradient, badges, focus rings, everything.

The palette generation is a pure function (hex → HSL → 11 derived shades → CSS variables). It runs synchronously in the browser with no network calls, so it's fast enough to run on every drag event without debouncing.

The generated shades use HSL lightness interpolation. The user's chosen colour becomes `brand-600` (the primary button and accent colour), and lighter/darker shades are derived by adjusting the lightness value while keeping the hue and saturation. This produces a coherent palette from any arbitrary colour input.

---

## Mobile Navigation

The original nav was desktop-only — a horizontal bar that collapsed badly on small screens. The sidebar was added as a Phase 3 polish item.

The implementation uses a single `Nav` client component that renders both the floating pill desktop nav and the slide-in mobile sidebar. State (`sidebarOpen`) is local to the component. The sidebar closes automatically when the route changes (via a `useEffect` on `pathname`).

The `pointer-events-none` trick on the outer floating pill wrapper lets the page content underneath be interactive — the wrapper is invisible to mouse events but the pill header inside it has `pointer-events-auto`.

---

## What I Would Do Differently

- **Use user IDs in URLs instead of usernames.** The `/users/[username]` route breaks if a username contains `+` (from a `+` alias in the email). User IDs are always URL-safe.
- **Generate DB types from the CLI.** The hand-written `lib/database.types.ts` has drifted slightly from the actual schema and requires manual updates. The Supabase CLI can generate this file accurately.
- **Abstract the accent colour picker into a standalone component.** The live-preview logic is inlined into `SettingsForms.tsx`. It would be cleaner as its own `AccentPicker` component.

---

## See Also

- [[00 - Project Overview]]
- [[01 - Feature Log]]
- [[02 - Architecture]]
- [[03 - Database Schema]]
