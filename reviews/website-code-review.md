# Code review — GamesList website (Next.js + Supabase)

Reviewed: 2026-11-03 · Scope: `app/`, `lib/`, `components/`, `middleware.ts`, `db/`, `supabase/`
Method: static reading only — no tests, typecheck or app were run during the review.

Legend: **Confirmed** = traced in the code. **Potential** = depends on something the repo can't show (noted).
Tick each box as you resolve it.

---

## Critical

### [ ] C1. Ticket/XP database functions are callable by anyone, for any user — Potential (verify grants)
`db/schema.sql:63-93` (`award_tickets`), `:95` (`award_xp`), `:136` (`reverse_game_completion_tickets`), `:162` (`reverse_game_dnf_tickets`)

**Problem:** All four are `SECURITY DEFINER` (bypass RLS) and none checks `p_user_id = auth.uid()`. Supabase grants EXECUTE on `public` functions to `anon` and `authenticated` by default; the schema dump uses `--no-privileges`, so the repo can't show whether that was revoked. If not, from any browser console:
```js
supabase.rpc('award_tickets', { p_user_id: '<anyone>', p_amount: 9999, p_reason: 'admin_adjustment' })
supabase.rpc('reverse_game_completion_tickets', { p_user_id: '<friend>', p_game_id: '<their game>' })
```
**Why it matters:** Tickets are the core of the app; signup is open and email confirmation is off, so any stranger can do this.

**Verify on prod:**
```sql
select proname,
       has_function_privilege('anon', oid, 'execute')          as anon,
       has_function_privilege('authenticated', oid, 'execute') as authed
from pg_proc where proname in ('award_tickets','award_xp','reverse_game_completion_tickets','reverse_game_dnf_tickets');
```
**Fix:** Revoke from browser roles; call only from the server via the service-role client (`createAdminClient()` in `lib/tickets.ts` and the wheel/game actions). Pin `search_path` while there.
```sql
REVOKE EXECUTE ON FUNCTION public.award_tickets(uuid,int,public.ticket_reason,uuid,text) FROM anon, authenticated, public;
-- repeat for award_xp, reverse_game_completion_tickets, reverse_game_dnf_tickets
ALTER FUNCTION public.award_tickets(uuid,int,public.ticket_reason,uuid,text) SET search_path = public;
```

### [ ] C2. Users can make themselves admin and set their own ticket balance — Confirmed (schema)
`db/schema.sql:814` — `profiles_update_own ... FOR UPDATE USING (auth.uid() = id)`

**Problem:** Row-scoped, not column-scoped. This succeeds from the browser:
```js
supabase.from('profiles').update({ is_admin: true, ticket_balance: 500, wheel_turn: 'choose' }).eq('id', myId)
```
`is_admin` gates `/admin/exe-links` (the `global_exe_links` table every desktop agent trusts) and video curation. `tickets_insert_own` (`:827`) also lets users insert fake ledger rows.

**Fix:** Column-level grants; move writes to `wheel_turn` / `pending_wheel_*` / `wheel_session` to the admin client in `app/(app)/wheel/actions.ts`.
```sql
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, theme_preference, accent_colour, wheel_enabled) ON public.profiles TO authenticated;
DROP POLICY tickets_insert_own ON public.ticket_transactions;
```

---

## High

### [ ] H1. The client decides wheel results; free spins are repeatable — Confirmed
`app/(app)/wheel/actions.ts:222-267`, `finalizeUpgradeChoice` (`:399`), `finalizeSpinReroll` (`:503`)

**Problem:** `performSpin` returns a winner but never stores it. `acceptSpinResult(resultName, …, wonGame, …, ticketsSpent)` accepts whatever the client sends. A user can call `performSpin` repeatedly (free re-spins) or accept any game. `upgradeMaxGames` is also client-supplied. The "server-determined winner" claim in CLAUDE.md doesn't hold.

**Fix:** Persist the winner server-side in `wheel_session` inside `performSpin` / `performReroll` / `pickNextUpgradeGame`; finalizers read it from the DB, and `performSpin` refuses while a result is pending.
```ts
const { data } = await supabase.from('profiles').select('wheel_session').eq('id', user.id).single()
const session = restoreSession(data?.wheel_session)
if (!session?.winner || session.winner !== resultName) return { error: 'Result does not match the spin' }
```

### [ ] H2. Completing a game can award tickets twice, or for someone else's game — Confirmed
`app/(app)/games/actions.ts:372-439` (`markAsCompleted`), `:225-332` (`updateGame`)

**Problem:** `markAsCompleted` checks neither current status nor whether its update changed a row. Same game open in two tabs → Complete in both → tickets + XP awarded twice. With a friend's game id the update silently matches 0 rows, then tickets are still awarded to the caller using the hours they supplied. `updateGame` has the same gap when `existing` is `null`.

**Fix:**
```ts
const { data: changed, error } = await supabase.from('games').update(update)
  .eq('id', id).eq('user_id', user.id).eq('status', 'playing').select('id')
if (error) return { error: error.message }
if (!changed?.length) return { error: 'This game is no longer in progress.' }
```
In `updateGame`: `if (!existing) return { error: 'Game not found' }` right after the read.

### [ ] H3. `markAsDnf` on a completed game keeps the completion tickets — Confirmed
`app/(app)/games/actions.ts:443-478`

**Problem:** Applies the DNF penalty without reversing completion awards (`updateGame` does reverse, `:337-340`). UI only shows the button for `playing`, but a stale tab reaches it.

**Fix:** Add `.eq('status','playing')` to the update (as H2), or call `reverseGameCompletionTickets` when `existing.status === 'completed'`.

### [ ] H4. Double-submits double-charge or double-award on the wheel — Confirmed
`app/(app)/wheel/actions.ts:271-307`, `:604-630`, `advanceTurn` at `:23`

**Problem:** Each action reads `wheel_turn` / `ticket_balance`, then acts in a separate step. Two overlapping `skipChooseTurn` calls both award +2. Two `paySpinAgain` calls both pass the balance check → negative balance (no floor in `award_tickets`, no `CHECK (ticket_balance >= 0)`). `advanceTurn` ignores errors.

**Fix:** Conditional turn advance; only award if a row actually moved. Do balance checks inside the DB function.
```ts
const { data: moved } = await supabase.from('profiles')
  .update({ wheel_turn: nextWheelTurn(current), /* … */ })
  .eq('id', userId).eq('wheel_turn', current).select('id')
if (!moved?.length) return { error: 'Turn already finished' }
```
```sql
IF v_balance_before + p_amount < 0 THEN RAISE EXCEPTION 'insufficient tickets'; END IF;
```

### [ ] H5. `/api/admin/import-tickets` is open to every signed-in user — Confirmed
`app/api/admin/import-tickets/route.ts:112-218`

**Problem:** No `is_admin` check. Any user can upload a CSV that inserts arbitrary ledger rows and overwrites their `ticket_balance` (`:214`).

**Fix:** Delete it (one-off migration; `scripts/import-tickets.mjs` exists), or gate on `is_admin` after C2.

---

## Medium

### [ ] M1. Agent checkpoints double-count when requests overlap — Confirmed
`app/api/agent/session/route.ts:84-127`

Reads `applied_hours`, computes delta, writes `games.hours_played` and `play_sessions` separately. Replay-safety only holds sequentially. The agent's 15s timeout + offline queue (and two PCs) make overlap realistic → both add the delta. **Fix:** one Postgres function that `SELECT … FOR UPDATE`s the `play_sessions` row and does `hours_played = hours_played + delta`.

### [ ] M2. Ticket changes aren't atomic — Confirmed
`app/(app)/games/actions.ts:313-352`, `lib/tickets.ts:43-52`

Status is written first, then several separate RPCs. A failure mid-way leaves a completed game with partial tickets, and the action throws unhandled. Wheel finalizers ignore insert errors on `wheel_spins` / `games`. **Fix:** a DB function per transition (`complete_game`, `finalize_wheel_turn`) — also fixes H2/H4.

### [ ] M3. Cron routes are fail-open — Confirmed
`app/api/cron/check-releases/route.ts:12` (same in `check-events`, `sync-playlists`)

`if (secret && …)` lets anyone run service-role jobs (and burn YouTube quota) if `CRON_SECRET` is unset. **Fix:** `if (!secret || header !== \`Bearer ${secret}\`) return 401`.

### [ ] M4. Private notes are only hidden in the UI — Confirmed
`games_select_all` exposes every column to any signed-in user; `app/(app)/users/[username]/page.tsx:49` uses `select('*')` and passes `notes` into the client component `GameTableView`. Only `app/(app)/games/[id]/page.tsx:383` respects `notes_public`. **Fix:** owner-only table (or view) for private notes; select explicit columns.

### [ ] M5. Tickets page loads the entire ledger, and will silently truncate — Confirmed
`app/(app)/tickets/page.tsx:151-168`

All users' transactions + joins, paginated in memory. PostgREST's default max-rows (1000) means older history will silently disappear once exceeded. **Fix:** paginate in SQL (grouped view + `.range()`).

### [ ] M6. Raw search text interpolated into `.or()` — Confirmed
`app/(app)/games/page.tsx:60`, `app/(app)/users/[username]/page.tsx:63`

"Warhammer 40,000" breaks the filter; commas/parens allow extra filter conditions (bounded by RLS). **Fix:** strip/escape `,()` or use separate `.ilike` queries.

### [ ] M7. Local schema dump/migration are stale — Confirmed
`db/schema.sql` (dumped 2026-09-19)

`device_tokens`, `play_sessions`, `game_executables`, `global_exe_links`, `steam_game_ids` are missing, so `db:reset` builds a DB where no agent route works. **Fix:** `npm run db:dump && npm run db:migration`.

### [ ] M8. `WheelClient.tsx` is hard to maintain — Improvement
`components/wheel/WheelClient.tsx` — 1,730 lines, 38 `useState`. A `useReducer` over `WheelSession` (`lib/wheel-session.ts`) would make transitions testable. Do it when next touching the wheel, not as a rewrite.

---

## Low

- [ ] **L1.** `middleware.ts:41` — protected-route list is stale (no `/settings`, `/stats`, `/admin`…). Harmless (`(app)/layout.tsx` redirects) but misleading; drop it or invert to "everything except `/login`".
- [ ] **L2.** `app/auth/callback/route.ts:7-13` — unvalidated `next` → `next=@evil.com` builds `https://site@evil.com`. Needs a valid code; fix: `if (!next.startsWith('/') || next.startsWith('//')) next = '/dashboard'`.
- [ ] **L3.** `app/(app)/games/actions.ts:118-119` — unguarded `JSON.parse` on form fields; hours/rating not range-checked server-side (negative or `NaN` reach ticket maths). Small zod schema per action.
- [ ] **L4.** `reverse_game_completion_tickets` (`db/schema.sql:136`) deletes *all* transactions for the game, not only completion reasons as its name / CLAUDE.md say.
- [ ] **L5.** 109 `as any` casts; hand-written `lib/database.types.ts` drifting (`spin_type`, agent tables). Use `supabase gen types`.
- [ ] **L6.** `profiles_select_all USING (true)` exposes all profiles (incl. `wheel_session`, balances) to *anonymous* visitors. Use `auth.role() = 'authenticated'`.
- [ ] **L7.** CLAUDE.md drift: "No test suite" / "45 tests" (≈380 cases now), `deleteGame` "no ticket change" (it reverses), a `spin_type` CHECK that prod doesn't have.

---

## Testing gaps

- [ ] **RLS / permissions tests** — anon/authenticated client against the local stack asserting `rpc('award_tickets')` and `update({ is_admin: true })` are refused. Would have caught C1/C2. Highest value.
- [ ] **Ticket transitions in server actions** — `updateGame` status matrix; `markAsCompleted` called twice. Only `calculateCompletionAwards` is tested today.
- [ ] **Agent route handlers** — especially concurrent session checkpoints (M1).
- [ ] **Wheel finalizers** — called with a result that doesn't match the spin (H1).

---

## Overall assessment

Carefully built: comments explain *why*, pure logic is separated and well tested (`wheel-session` 64 cases, `activity` 90), and the agent design is thoughtful (hashed tokens, loopback-only pairing, status re-asserted in the write, e2e refuses to run against prod). The weak spot is systemic: **trust lives in server actions, but Supabase exposes the database directly**, so RLS and definer functions are the real boundary — and they're too permissive. Second theme: check-then-act races around tickets.

### Top five
1. C1 — revoke execute on ticket/XP functions.
2. C2 — column-restrict `profiles` updates; drop `tickets_insert_own`.
3. H2/H3 — guard completion/DNF transitions on current status.
4. H1 — store wheel results server-side.
5. H4/M1 — race-safe turn advances and checkpoints.

### Architectural concerns
- Business rules are spread across multi-call server actions (source of M2 and the races). Moving each ticket-affecting transition into one Postgres function gives atomicity, race safety and a single authorisation point.
- Hand-written types + stale migration → local dev increasingly diverges from prod.
- "Load everything, filter in JS" pages (tickets, `gatherStats` in achievements) will hit the 1000-row cap before they hit performance limits.

### Prioritised action plan
1. **Today (SQL only):** C1 revokes, C2 column grants, drop `tickets_insert_own`, delete/gate import route (H5), cron secret fail-closed (M3).
2. **This week:** ticket RPCs via admin client; status guards (H2/H3); conditional turn update (H4); RLS test script.
3. **Next:** server-side wheel results (H1); locking checkpoint function (M1); refresh schema + generate types (M7, L5).
4. **Ongoing:** SQL pagination for tickets (M5), private notes (M4), search escaping (M6), `WheelClient` reducer (M8), CLAUDE.md refresh (L7).
