# GamesList

A full-stack web application for tracking and gamifying video game progress among friends. Log your games, earn tickets for completing them, and use the wheel system to decide what to play next.

---

## Features

### Game Tracking
- Add games to your personal list with detailed information:
  - Title, developer, and year
  - Status — Backlog, Playing, or Completed
  - Hours played
  - Completion date and rating (1–10)
  - Achievement progress (%)
  - Personal review and private notes
- Filter and sort your game list by status
- Click any game to view a full detail page
- View other players' game lists (reviews visible, private notes hidden)

### Ticket System (Gamification)
Earn, spend, and lose tickets based on your gaming activity.

**Earning tickets:**
| Action | Tickets |
|--------|---------|
| Complete a short game (<20 hrs) | +1 |
| Complete a medium game (20–49 hrs) | +2 |
| Complete a long game (50–100 hrs) | +3 |
| Every 20 hrs beyond 100 hrs | +1 |
| 100% achievement completion | +3 |
| Play a sequel immediately after the previous game | +1 |
| Continue a series back-to-back | +1 |
| Skip your Choose Game turn | +2 |
| Complete a custom objective | +X |

**Losing tickets:**
| Action | Tickets |
|--------|---------|
| Not completing an assigned game | −5 |
| Not completing an agreed custom objective | −X |

**Spending tickets:**
| Action | Tickets |
|--------|---------|
| Spin | −3 |
| Spin + Reroll | −6 |
| Choose a game | −9 |
| Choose another player's next game | −100 |

### Wheel System
Each player cycles through turns in order: **Spin → Spin + Reroll → Choose Game → repeat**

- **Spin** — a random game from your wheel is selected; you must play it
- **Spin + Reroll** — two games are picked; choose one, and re-spin the other as many times as you like before confirming
- **Choose Game** — pick any game freely, or skip (earns +2 tickets and advances your turn)
- A minimum of 5 games must be added to the wheel before spinning
- You control which of your games are included in the wheel
- Spending 100 tickets lets you choose another player's next game

### Ticket History
Full ledger of all ticket activity including date, reason, related game, wheel turn at the time, and running balance.

### Changelog
A timeline of updates made to the app.

---

## Tech Stack

- **Framework** — [Next.js 14](https://nextjs.org) (App Router, TypeScript)
- **Backend & Database** — [Supabase](https://supabase.com) (PostgreSQL, Auth, Row Level Security)
- **Styling** — [Tailwind CSS](https://tailwindcss.com)
- **Auth** — Supabase Auth with email/password and email confirmation

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/KunalP99/games-list-app.git
cd games-list-app
npm install
```

### 2. Set up environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Find these in your Supabase project under **Settings → API**.

### 3. Apply the database schema

Run the following SQL in your Supabase project's **SQL Editor**. Apply each phase as it is built.

<details>
<summary><strong>Phase 1 — Profiles & Auth</strong></summary>

```sql
create extension if not exists "uuid-ossp";

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  display_name  text,
  avatar_url    text,
  ticket_balance integer not null default 0,
  wheel_turn    text not null default 'spin'
                check (wheel_turn in ('spin', 'spin_reroll', 'choose')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute procedure public.handle_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end; $$;

create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
```
</details>

<details>
<summary><strong>Phase 2 — Games</strong></summary>

```sql
create table public.games (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  title               text not null,
  developer           text,
  year_developed      integer check (year_developed >= 1950 and year_developed <= 2100),
  status              text not null default 'backlog'
                      check (status in ('playing', 'completed', 'backlog')),
  hours_played        numeric(6,1) check (hours_played >= 0),
  completion_date     date,
  rating              integer check (rating >= 1 and rating <= 10),
  achievement_progress numeric(5,2) check (achievement_progress >= 0 and achievement_progress <= 100),
  review              text,
  notes               text,
  in_wheel            boolean not null default false,
  assigned_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_games_user_id on public.games(user_id);
create index idx_games_user_wheel on public.games(user_id, in_wheel) where in_wheel = true;

create trigger trg_games_updated_at before update on public.games
  for each row execute procedure public.handle_updated_at();

alter table public.games enable row level security;
create policy "games_select_all" on public.games for select using (true);
create policy "games_insert_own" on public.games for insert with check (auth.uid() = user_id);
create policy "games_update_own" on public.games for update using (auth.uid() = user_id);
create policy "games_delete_own" on public.games for delete using (auth.uid() = user_id);
```
</details>

<details>
<summary><strong>Phase 4 — Ticket Transactions</strong></summary>

```sql
create type public.ticket_reason as enum (
  'game_completed_short', 'game_completed_medium', 'game_completed_long',
  'game_completed_bonus_hours', 'achievement_100_percent',
  'sequel_back_to_back', 'series_back_to_back', 'turn_skipped',
  'objective_completed', 'spin', 'spin_reroll', 'choose_game',
  'choose_other_player_game', 'assigned_game_incomplete',
  'objective_incomplete', 'admin_adjustment'
);

create table public.ticket_transactions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  amount          integer not null,
  reason          public.ticket_reason not null,
  game_id         uuid references public.games(id) on delete set null,
  wheel_turn_at_time text check (wheel_turn_at_time in ('spin', 'spin_reroll', 'choose')),
  balance_before  integer not null,
  balance_after   integer not null,
  note            text,
  created_at      timestamptz not null default now()
);

create index idx_tickets_user_id on public.ticket_transactions(user_id);
create index idx_tickets_created_at on public.ticket_transactions(created_at desc);

alter table public.ticket_transactions enable row level security;
create policy "tickets_select_own" on public.ticket_transactions
  for select using (auth.uid() = user_id);

create or replace function public.award_tickets(
  p_user_id uuid, p_amount integer, p_reason public.ticket_reason,
  p_game_id uuid default null, p_note text default null
) returns void language plpgsql security definer as $$
declare v_balance_before integer; v_wheel_turn text;
begin
  select ticket_balance, wheel_turn into v_balance_before, v_wheel_turn
  from public.profiles where id = p_user_id for update;
  insert into public.ticket_transactions
    (user_id, amount, reason, game_id, wheel_turn_at_time, balance_before, balance_after, note)
  values
    (p_user_id, p_amount, p_reason, p_game_id, v_wheel_turn,
     v_balance_before, v_balance_before + p_amount, p_note);
  update public.profiles set ticket_balance = v_balance_before + p_amount where id = p_user_id;
end; $$;
```
</details>

<details>
<summary><strong>Phase 5 — Wheel Spins</strong></summary>

```sql
create table public.wheel_spins (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  spin_type        text not null check (spin_type in ('spin', 'spin_reroll', 'choose')),
  game_id_result   uuid references public.games(id) on delete set null,
  game_id_option_a uuid references public.games(id) on delete set null,
  game_id_option_b uuid references public.games(id) on delete set null,
  ticket_transaction_id uuid references public.ticket_transactions(id) on delete set null,
  created_at       timestamptz not null default now()
);

alter table public.wheel_spins enable row level security;
create policy "wheel_spins_select_own" on public.wheel_spins
  for select using (auth.uid() = user_id);
```
</details>

<details>
<summary><strong>Phase 6 — Changelog</strong></summary>

```sql
create table public.changelog_entries (
  id          uuid primary key default uuid_generate_v4(),
  version     text not null,
  title       text not null,
  body        text not null,
  released_at date not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.changelog_entries enable row level security;
create policy "changelog_select_all" on public.changelog_entries for select using (true);
```
</details>

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

---

## Build Progress

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Project setup, auth, dashboard shell | ✅ Complete |
| 2 | Game list CRUD, game detail page | 🔜 Next |
| 3 | Social features (view friends' lists) | ⏳ Planned |
| 4 | Ticket system and history | ⏳ Planned |
| 5 | Wheel system | ⏳ Planned |
| 6 | Polish, changelog, mobile, toasts | ⏳ Planned |
