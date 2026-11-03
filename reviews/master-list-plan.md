# Plan — Master list game detection (Discord-style)

Written: 2026-11-03 · Status: **proposal, nothing implemented yet**
Related: `website-code-review.md` (C1, C2, M3), `tracker-code-review.md` (T-H1, T-H2, T-M2, T-M3)

## Decisions (from discussion)

| # | Question | Decision |
|---|---|---|
| 1 | Keep existing `global_exe_links` entries? | **No — start fresh.** Table is replaced. |
| 2 | What enters the admin queue? | **Automatic** — every exe a user links that isn't on the master list. |
| 3 | Discord list refresh | **Weekly** check; the master table is the snapshot; a bad/failed fetch never replaces it. |
| 4 | Discord terms risk | **Accepted.** |
| 5 | Fix C1/C2 first | **Yes** — Phase 0. |

## The detection order this produces

```
Every 10 s, on the PC:
 1. Already one of my games?   Steam RunningAppID / my exe links          → track          (local, no request)
 2. On the master list?        full path ends with a list entry           → identify by id (local check; 1 request on a hit)
 3. Fallbacks:                 Steam folder manifest → identify
                               Epic / EA / Battle.net title → identify
 4. Still nothing:             toast "Is this a game?"  (an exe-name guess may *suggest* a title, never auto-adds)
 5. User links / adds it:      tracks for them immediately → appears in the admin queue → approve → master list
```

Master list = Discord rows (`source='discord'`) + admin-approved rows (`source='admin'`). **Admin wins** when both match the same path.

---

## Phase 0 — Prerequisites (security)

Admin approvals will now affect *every* user's tracker, so the admin flag must be trustworthy first.

- [ ] **C2**: column-restrict `profiles` updates so users can't set `is_admin` / `ticket_balance` themselves.
- [ ] **C1**: revoke EXECUTE on the ticket/XP functions from `anon`/`authenticated`.
- [ ] **M3**: make cron routes fail closed when `CRON_SECRET` is missing (the new cron below relies on it).

See `website-code-review.md` for the exact SQL.

---

## Phase 1 — Database

Run in the Supabase SQL editor (prod), then `npm run db:dump && npm run db:migration && npm run db:reset`.

```sql
-- The master list. One row per (source, path ending).
CREATE TABLE public.detectable_games (
  id                 BIGSERIAL PRIMARY KEY,
  path_suffix        TEXT NOT NULL,      -- 'tunic/tunic.exe' — lowercase, '/' separators, no drive/user folders
  source             TEXT NOT NULL CHECK (source IN ('discord', 'admin')),
  name               TEXT NOT NULL,
  steam_appid        INTEGER,            -- from Discord's third_party_skus; resolves to IGDB via resolveSteamApp
  igdb_id            INTEGER,            -- set directly on admin rows; exact, preferred over steam_appid
  discord_id         TEXT,               -- Discord's own id, so re-imports update rather than duplicate
  approved_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_seen_import   TIMESTAMPTZ,        -- discord rows: when the weekly import last saw this entry
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, path_suffix)
);
CREATE INDEX detectable_games_suffix_idx ON public.detectable_games (path_suffix);
ALTER TABLE public.detectable_games ENABLE ROW LEVEL SECURITY;
-- No policies: read/written only by service-role routes (cron, agent API, admin actions).

-- Audit trail for the weekly import (also what the admin page shows as "last synced").
CREATE TABLE public.detectable_import_runs (
  id            BIGSERIAL PRIMARY KEY,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT NOT NULL CHECK (status IN ('applied', 'rejected', 'failed')),
  entries_seen  INTEGER,
  rows_upserted INTEGER,
  rows_removed  INTEGER,
  note          TEXT          -- why it was rejected/failed
);
ALTER TABLE public.detectable_import_runs ENABLE ROW LEVEL SECURITY;

-- User-submitted links now remember where the exe lived (ending only).
ALTER TABLE public.game_executables ADD COLUMN IF NOT EXISTS path_suffix TEXT;

-- Queue items an admin has dismissed ("not a game" / "not worth listing").
CREATE TABLE public.detectable_dismissed (
  path_suffix  TEXT PRIMARY KEY,
  dismissed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.detectable_dismissed ENABLE ROW LEVEL SECURITY;

-- Start fresh (decision 1). Only after the code no longer reads it.
DROP TABLE IF EXISTS public.global_exe_links;
```

---

## Phase 2 — Weekly import (the snapshot)

**New:** `lib/detectable.ts` (pure, unit-tested) + `app/api/cron/sync-detectable/route.ts` + `vercel.json` weekly schedule + `scripts/import-detectable.mjs` (first import / local stack).

### `lib/detectable.ts` — pure transform
`parseDiscordList(json) → { rows, skipped }`:
1. Must be an array; each entry must have `id`, `name`, `executables[]`. Otherwise → reject the whole list.
2. Keep executables with `os === 'win32'`, `is_launcher === false`.
3. **Skip** names starting with `>` and rows with `arguments` (shared engine exes like `hl2.exe` — 15 rows; revisit later).
4. Normalise `name` → lowercase, `\` → `/`, trim.
5. `steam_appid` = first `third_party_skus` entry with `distributor === 'steam'` and a numeric id.
6. **Ambiguity rule:** if two *different* Discord entries produce the same `path_suffix`, drop both and count them in `skipped` (a guess between two games is worse than no answer).

### Cron route — fail safe
```
fetch Discord list (30 s timeout)
  ├─ network error / non-200 / bad JSON         → record 'failed',   keep table as is
  ├─ parseDiscordList rejects the shape          → record 'rejected', keep table as is
  ├─ sanity gate fails                           → record 'rejected', keep table as is
  │     • fewer than 5,000 rows, or
  │     • fewer than 80% of the last *applied* run
  └─ OK → upsert discord rows on (source, path_suffix) in batches of 1,000, set last_seen_import = now
          → delete discord rows with last_seen_import older than 28 days (gone for 4 weekly runs)
          → NEVER touch source = 'admin' rows
          → record 'applied'
```
- Guarded by `CRON_SECRET` (fail closed).
- Uses the service-role client (`createAdminClient`).
- Admin page shows the last `applied` run date and any recent `rejected`/`failed` runs, so a silently broken import is visible.

---

## Phase 3 — Getting the list onto each PC

**New:** `GET /api/agent/detectable` (device-token auth).

- Returns a compact list: `[[path_suffix, row_id], …]` — about 11k rows, roughly 400 KB (much less gzipped). Admin rows replace Discord rows with the same suffix before sending.
- Sends an `ETag` (latest `applied` import + latest admin change). The tracker sends `If-None-Match`; unchanged → `304`, nothing downloaded.
- Tracker caches it as `detectable.json` in its data folder and checks for a newer one **once a day** (and at startup). Offline? It keeps using its cached copy — the snapshot idea again, on the PC side.

---

## Phase 4 — Tracker matching

**New module:** `desktop/src-tauri/src/master_list.rs`.

- Load `detectable.json`; build `HashMap<exe_basename, Vec<(suffix, row_id)>>` for fast lookup.
- For each running candidate: lowercase path, `\` → `/`; look up by basename; a row matches when the path **equals** the suffix or **ends with `/` + suffix**. If several match, the **longest** suffix wins.
- Gate before matching: visible window + running ≥ 20 s. **No graphics-DLL check** — a list hit already proves it's a game.
- On a hit → `POST /api/agent/identify` with `{ detectableId, exeName, pathSuffix }`.

**Server — `identify` gains a `detectableId` mode:**
1. Load the row. `igdb_id` present → use it (admin rows).
2. Else `steam_appid` → existing `resolveSteamApp` → exact IGDB game.
3. Else exact-title search on `name` (the ~2% with no store id).
4. Then the existing owned/added/untracked logic, and save the exe link **with `path_suffix`**.

**Also in this phase (closes tracker findings):**
- [ ] Remove the `identify_global_exe_links` step (table is gone).
- [ ] **T-H1:** guessed-title path becomes toast-only — suggests a title, never auto-adds.
- [ ] **T-H2:** per-run backoff for `unknown` results (e.g. retry after 10 minutes).
- [ ] Keep `lookupExe` working in `identify` for older desktop versions until everyone updates — it now looks up `detectable_games` by bare exe name (only if exactly one row has that basename).

---

## Phase 5 — User submissions → admin approval

1. **Tracker sends the path ending whenever a user links or adds a game** (toast "Yes", link panel, "add it as a new game"). Rule for building it (`path_suffix()` in Rust, unit-tested):
   - start with the exe file name;
   - add parent folders one at a time until the last one added isn't generic (`bin`, `binaries`, `win64`, `win32`, `x64`, `x86`, `release`, `retail`, `content`);
   - never more than 3 segments, never a drive letter, never `users/<name>` — **privacy: the full path never leaves the PC.**
2. Stored on `game_executables.path_suffix`. The user is tracked immediately — approval only affects everyone else.
3. **Admin queue** (replaces today's derived queue on `/admin/exe-links`): user links whose `path_suffix` has no `detectable_games` match and isn't in `detectable_dismissed`, grouped by suffix + game, showing how many users linked it.
   - **Approve** → admin can edit the suffix first → inserts `source='admin'` with the exact `igdb_id`. Every tracker picks it up at its next daily list check.
   - **Dismiss** → into `detectable_dismissed`, leaves the queue.
   - Links typed on the website (no path known) show "no path — enter an ending" so the admin can supply one.

---

## Tests

- **Vitest:** `parseDiscordList` (shape rejection, win32/launcher/`>`/arguments filtering, Steam id extraction, ambiguity drop) and the sanity gate. Fixture: a small hand-cut sample of real entries (e.g. Tunic, Hades, Hades II, two `game.exe` games).
- **Rust:** suffix matching (equals / ends-with / longest wins / Hades vs Hades II / `game.exe` collisions) and `path_suffix()` (generic folders, 3-segment cap, never includes `users/…`). Build test inputs through the same normalisation the runtime uses (lesson from T-M3).
- **Server:** `identify` with `detectableId` — admin row with `igdb_id`, Discord row with `steam_appid`, row with neither.

---

## Rollout order

1. Phase 0 (SQL only).
2. Phase 1 tables (keep `global_exe_links` for now) + Phase 2 import → run `scripts/import-detectable.mjs` once, check counts on the admin page.
3. Phase 3 endpoint + `identify` `detectableId` mode (server side is backwards-compatible).
4. Phase 4 + 5 tracker changes → new desktop release.
5. Admin queue UI switch → then `DROP TABLE global_exe_links`.

## Known risks

- **Discord terms** — accepted (decision 4). Mitigated by the snapshot: Discord changing/blocking the endpoint only stops *updates*.
- **Folder names differ between stores** for a few games (e.g. Epic vs Steam install folder). Those miss the list and fall back to Steps 3–5; the admin queue then catches them.
- **~2% of Windows entries have no Steam id** — they rely on exact-title search, which can miss.
- **Older desktop versions** keep working via `lookupExe` until they update.
- **Shared engine exes** (`hl2.exe`, `javaw.exe`) are skipped in v1.
