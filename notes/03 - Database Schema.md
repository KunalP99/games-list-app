---
tags: [gameslist, database, supabase, schema]
created: 2026-04-30
---

# GamesList — Database Schema

All tables live in the `public` schema in Supabase (PostgreSQL). Row-level security is enabled on every table.

---

## Tables

### `profiles`

One row per user, created automatically by the `handle_new_user` trigger on signup.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | — | Matches `auth.users.id` (FK) |
| `username` | `text` | — | Derived from email local part; immutable |
| `display_name` | `text` | `null` | User-editable display name |
| `ticket_balance` | `int4` | `0` | Cached running balance; updated by RPC |
| `xp` | `int4` | `0` | Experience points; updated by `award_xp` RPC |
| `wheel_turn` | `text` | `'spin'` | Current turn type: `spin`, `spin_reroll`, `choose` |
| `theme_preference` | `text` | `'system'` | `light`, `dark`, or `system` |
| `accent_colour` | `text` | `null` | Hex colour string (e.g. `#ff5722`) |
| `created_at` | `timestamptz` | `now()` | |
| `updated_at` | `timestamptz` | `now()` | |

**RLS policy:** users can read all profiles (for Friends page), but only update their own row.

---

### `games`

One row per game per user.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `uuid` | `uuid_generate_v4()` | |
| `user_id` | `uuid` | — | FK → `profiles.id` |
| `title` | `text` | — | |
| `developer` | `text` | `null` | |
| `release_date` | `text` | `null` | Stored as string (RAWG returns various formats) |
| `status` | `text` | `'backlog'` | `playing`, `completed`, `backlog`, `dnf` |
| `hours_played` | `numeric` | `null` | |
| `completion_date` | `date` | `null` | |
| `rating` | `int4` | `null` | 1–5 star rating |
| `achievement_progress` | `int4` | `null` | 0–100 percentage |
| `review` | `text` | `null` | |
| `notes` | `text` | `null` | Private notes |
| `image_url` | `text` | `null` | Cover image from RAWG |
| `rawg_id` | `int4` | `null` | RAWG game ID for deduplication |
| `description` | `text` | `null` | From RAWG |
| `genres` | `text[]` | `null` | Array of genre strings from RAWG |
| `platform` | `text` | `null` | Platform the game was played on |
| `is_favourite` | `boolean` | `false` | |
| `is_replay` | `boolean` | `false` | |
| `is_sequel` | `boolean` | `false` | |
| `assigned_by` | `text` | `null` | Username of whoever assigned the game |
| `created_at` | `timestamptz` | `now()` | |
| `updated_at` | `timestamptz` | `now()` | |

**RLS policy:** users can read all games (for Friends page), but only insert/update/delete their own.

---

### `ticket_transactions`

Append-only ledger. Never update or delete rows.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `amount` | `int4` | Positive = earned, negative = spent |
| `reason` | `text` | One of the `ticket_reason` enum values |
| `game_id` | `uuid` | FK → `games.id` (nullable; `ON DELETE SET NULL`) |
| `wheel_turn_at_time` | `text` | Snapshot of turn type at time of transaction |
| `balance_before` | `int4` | |
| `balance_after` | `int4` | |
| `note` | `text` | Optional freeform note |
| `created_at` | `timestamptz` | |

**Reason enum values:** `game_completed_short`, `game_completed_medium`, `game_completed_long`, `game_completed_bonus_hours`, `achievement_100_percent`, `sequel_back_to_back`, `series_back_to_back`, `turn_skipped`, `objective_completed`, `spin`, `spin_reroll`, `choose_game`, `choose_other_player_game`, `assigned_game_incomplete`, `objective_incomplete`, `admin_adjustment`

---

### `wheel_spins`

One row per spin event, for history/analytics.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `spin_type` | `text` | `spin`, `spin_reroll`, `choose` |
| `spin_mode` | `text` | `elimination`, `first_land`, or null |
| `result_name` | `text` | The game that was landed on |
| `option_a_name` | `text` | First option (Spin+Reroll flow) |
| `option_b_name` | `text` | Second option (Spin+Reroll flow) |
| `created_at` | `timestamptz` | |

---

### `user_achievements`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | |
| `user_id` | `uuid` | FK → `profiles.id` |
| `achievement_id` | `text` | Matches achievement ID in `lib/achievements.ts` |
| `unlocked_at` | `timestamptz` | |

Unique constraint on `(user_id, achievement_id)`.

---

### `changelog_entries`

Created but unused — the changelog page was deferred.

| Column | Type |
|---|---|
| `id` | `uuid` |
| `version` | `text` |
| `title` | `text` |
| `body` | `text` |
| `released_at` | `timestamptz` |
| `created_at` | `timestamptz` |

---

## Postgres Functions (RPCs)

### `award_tickets(p_user_id, p_amount, p_reason, p_game_id?, p_note?)`

Atomically:
1. Locks the profile row with `SELECT FOR UPDATE`
2. Reads current `ticket_balance`
3. Inserts a `ticket_transactions` row with before/after balance
4. Updates `profiles.ticket_balance`

Security definer — runs as the table owner, bypasses RLS.

### `reverse_game_completion_tickets(p_user_id, p_game_id)`

1. Sums all completion-reason transactions for the given game
2. Deletes those transaction rows
3. Subtracts the sum from `profiles.ticket_balance`

Called before re-awarding when a completed game is edited.

### `award_xp(p_user_id, p_amount)`

Atomically increments `profiles.xp`. Used by achievement unlock flow.

---

## Triggers

### `handle_new_user` (on `auth.users INSERT`)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id,
    split_part(new.email, '@', 1)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Derives username from the email. Known caveat: emails with `+` aliases (e.g. `user+tag@gmail.com`) produce usernames like `user+tag`, which can break `/users/[username]` routing.

---

## SQL to Apply Schema Changes

If setting up from scratch, or adding new columns to an existing instance:

```sql
-- DNF status (extends CHECK constraint)
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_status_check;
ALTER TABLE games ADD CONSTRAINT games_status_check
  CHECK (status IN ('playing', 'completed', 'backlog', 'dnf'));

-- Wheel turn column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wheel_turn TEXT NOT NULL DEFAULT 'spin'
  CHECK (wheel_turn IN ('spin', 'spin_reroll', 'choose'));

-- Theme + accent colour
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'system'
    CHECK (theme_preference IN ('light', 'dark', 'system')),
  ADD COLUMN IF NOT EXISTS accent_colour TEXT;

-- Wheel spins table
CREATE TABLE IF NOT EXISTS public.wheel_spins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  spin_type TEXT NOT NULL CHECK (spin_type IN ('spin', 'spin_reroll', 'choose')),
  spin_mode TEXT CHECK (spin_mode IN ('elimination', 'first_land')),
  result_name TEXT, option_a_name TEXT, option_b_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wheel spins" ON public.wheel_spins
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## See Also

- [[02 - Architecture]]
- [[01 - Feature Log]]
