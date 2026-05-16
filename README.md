# GamesList

A full-stack web application for tracking and gamifying video game progress among friends. Log your games, earn tickets for completing them, spin the wheel to decide what to play next, and unlock achievements as you go.

---

## Features

### Game Tracking
- Add games with full metadata: title, developer, release date, platform, status, hours played, rating, achievement progress, review, and private notes
- Status system: **Backlog**, **Playing**, **Completed**, **DNF** (Did Not Finish)
- Cover image URL field — displays as card background with hover zoom
- Favourite, Replay, and Sequel flags
- Filter by status, sort by date/title/rating, debounced search by title or developer
- Completed games grouped by year
- Quick "Mark as Completed" button on cards (one click) and a detail-page modal that prompts for hours, star rating (half-star support), achievement progress, and completion date
- Star rating gradient uses your chosen accent colour
- RAWG integration — search for a game to auto-fill developer, release date, description, genres, and cover art
- RAWG screenshot gallery on the game detail page
- View other players' game lists (reviews visible, private notes hidden)

### Personalisation
- **Accent colour picker** in Settings — drives the entire brand palette (buttons, badges, focus rings, gradients, charts, XP bar, logo) via CSS custom properties; updates live as you drag
- **Theme** — Light, Dark, or System; persisted to the database so it applies on every device and page load
- **Display name** — shown in the nav dropdown in place of your username

### Achievements
- 50+ achievements across eight categories: Completion, Hours, Tickets, Perfection (100%), Variety, Dedication, Wheel, and Misc
- Rarity tiers: Common, Uncommon, Rare, Epic — each with a distinct coloured border and badge
- XP awarded for every unlock; level progress bar on the Achievements page
- Achievement toast notification pops in the bottom-right corner when you unlock something; clicking it navigates to the Achievements page and scrolls to the card

### Ticket System
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

**Losing tickets:**
| Action | Tickets |
|--------|---------|
| Not completing an assigned game | −5 |

**Spending tickets:**
| Action | Tickets |
|--------|---------|
| Extra spin (Spin Again) | −3 |
| Upgrade to Spin + Reroll | −6 |
| Choose a game freely | −9 |
| Choose another player's next game | −100 |

### Wheel System
Each player cycles through turns in order: **Spin → Spin + Reroll → Choose Game → repeat**

- **Spin** — a random game from the entered list is selected
- **Spin + Reroll** — spin once free, take an optional reroll, then choose between up to 3 results; costs −6 tickets to upgrade
- **Choose Game** — pick any game freely (−9 tickets), or skip for +2 tickets
- Minimum 5 games must be entered before spinning
- Two spin modes per session: **Elimination** (games removed each spin until one remains) or **First Land** (single spin wins)
- Spending 100 tickets lets you choose another player's next game

### Ticket History
Full ledger of all ticket activity for all players: date, user, game, reason badges, change amount, and running balance. Current user's rows are highlighted in their accent colour.

### Social & Friends
- **Friends activity feed** on the dashboard — shows recent game completions, DNFs, backlog adds, wheel spins, and achievement unlocks from friends; updates live
- **Full activity page** (`/activity`) — expanded feed showing up to 40 recent events across all friends and yourself
- **Friend profile pages** — view any player's game list, stats, ticket balance, currently playing games, and current wheel turn (shown as a coloured pill matching the wheel page style)
- **Recommendations carousel** on the dashboard — games your friends have completed and rated, auto-rotating with dot indicators
- **Wheel history page** (`/wheel/history`) — all players' spin history with spin type badges, game results, mode labels, and ticket costs

### Dashboard
- Stats: total games, hours, completions this year, current streak
- Bar chart — games completed per year (uses accent colour)
- Radar chart — genres played (uses accent colour)
- Pie chart — platforms used (branded per platform)
- Friends activity feed (6 most recent events) with link to full activity page
- Recommendations carousel showing friends' completed and rated games
- Charts lazy-loaded for faster initial page render

### Settings
- **Profile** — update display name
- **Security** — change password
- **Appearance** — choose theme (Light / Dark / System) and accent colour

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | [Next.js 14](https://nextjs.org) — App Router, TypeScript |
| Backend & Database | [Supabase](https://supabase.com) — PostgreSQL, Auth, RLS, RPCs |
| Styling | [Tailwind CSS](https://tailwindcss.com) + CSS custom properties for dynamic theming |
| Charts | [Recharts](https://recharts.org) |
| Game Data | [RAWG API](https://rawg.io/apidocs) — search, cover art, descriptions, genres |
| Testing | [Vitest](https://vitest.dev) + jsdom |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [RAWG API key](https://rawg.io/apidocs) (free)

### 1. Clone and install

```bash
git clone https://github.com/KunalP99/games-list-app.git
cd games-list-app
npm install
```

### 2. Set up environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RAWG_API_KEY=your-rawg-api-key
```

Find Supabase credentials under **Settings → API** in your Supabase project.

### 3. Apply the database schema

Run each block in your Supabase project's **SQL Editor**.

<details>
<summary><strong>Profiles & Auth</strong></summary>

```sql
create extension if not exists "uuid-ossp";

create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  username       text unique not null,
  display_name   text,
  avatar_url     text,
  ticket_balance integer not null default 0,
  xp             integer not null default 0,
  wheel_turn     text not null default 'spin'
                 check (wheel_turn in ('spin', 'spin_reroll', 'choose')),
  theme_preference text not null default 'system'
                 check (theme_preference in ('light', 'dark', 'system')),
  accent_colour  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
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
<summary><strong>Games</strong></summary>

```sql
create table public.games (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.profiles(id) on delete cascade,
  title                text not null,
  developer            text,
  release_date         date,
  status               text not null default 'backlog'
                       check (status in ('playing', 'completed', 'backlog', 'dnf')),
  hours_played         numeric(6,1) check (hours_played >= 0),
  completion_date      date,
  rating               numeric(3,1) check (rating >= 0.5 and rating <= 5),
  achievement_progress numeric(5,2) check (achievement_progress >= 0 and achievement_progress <= 100),
  review               text,
  notes                text,
  image_url            text,
  rawg_id              integer,
  description          text,
  genres               text[],
  platform             text,
  is_favourite         boolean not null default false,
  is_replay            boolean not null default false,
  is_sequel            boolean not null default false,
  in_wheel             boolean not null default false,
  assigned_by          uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
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
<summary><strong>Ticket Transactions & RPCs</strong></summary>

```sql
create table public.ticket_transactions (
  id                 uuid primary key default uuid_generate_v4(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  amount             integer not null,
  reason             text not null,
  game_id            uuid references public.games(id) on delete set null,
  wheel_turn_at_time text check (wheel_turn_at_time in ('spin', 'spin_reroll', 'choose')),
  balance_before     integer not null,
  balance_after      integer not null,
  note               text,
  created_at         timestamptz not null default now()
);

create index idx_tickets_user_id on public.ticket_transactions(user_id);
create index idx_tickets_created_at on public.ticket_transactions(created_at desc);

alter table public.ticket_transactions enable row level security;
create policy "tickets_select_all" on public.ticket_transactions for select using (true);

-- Award tickets atomically
create or replace function public.award_tickets(
  p_user_id uuid, p_amount integer, p_reason text,
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

-- Reverse completion tickets for a game (called before re-awarding on edit)
create or replace function public.reverse_game_completion_tickets(
  p_user_id uuid, p_game_id uuid
) returns void language plpgsql security definer as $$
declare v_total integer;
begin
  select coalesce(sum(amount), 0) into v_total
  from public.ticket_transactions
  where user_id = p_user_id and game_id = p_game_id
    and reason in (
      'game_completed_short', 'game_completed_medium', 'game_completed_long',
      'game_completed_bonus_hours', 'achievement_100_percent'
    );
  if v_total <> 0 then
    delete from public.ticket_transactions
    where user_id = p_user_id and game_id = p_game_id
      and reason in (
        'game_completed_short', 'game_completed_medium', 'game_completed_long',
        'game_completed_bonus_hours', 'achievement_100_percent'
      );
    update public.profiles
    set ticket_balance = ticket_balance - v_total
    where id = p_user_id;
  end if;
end; $$;

-- Award XP
create or replace function public.award_xp(
  p_user_id uuid, p_amount integer
) returns void language plpgsql security definer as $$
begin
  update public.profiles set xp = xp + p_amount where id = p_user_id;
end; $$;
```
</details>

<details>
<summary><strong>Wheel Spins</strong></summary>

```sql
create table public.wheel_spins (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  spin_type     text not null check (spin_type in ('spin', 'spin_reroll', 'choose', 'choose_skip')),
  spin_mode     text check (spin_mode in ('elimination', 'first_land')),
  result_name   text,
  option_a_name text,
  option_b_name text,
  games_list    text[],
  tickets_spent integer,
  created_at    timestamptz not null default now()
);

alter table public.wheel_spins enable row level security;
-- All authenticated users can read spins (for shared history and activity feeds)
create policy "wheel_spins_read_all" on public.wheel_spins
  for select using (auth.role() = 'authenticated');
-- Users can only write their own spins
create policy "wheel_spins_manage_own" on public.wheel_spins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```
</details>

<details>
<summary><strong>Achievements</strong></summary>

```sql
create table public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.user_achievements enable row level security;
create policy "achievements_select_all" on public.user_achievements for select using (true);
create policy "achievements_insert_own" on public.user_achievements
  for insert with check (auth.uid() = user_id);
```
</details>

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to the login page.

### 5. Run tests

```bash
npm test          # single run
npm run test:watch  # watch mode
```

---

## Project Structure

```
app/
  (auth)/           # Login, signup pages
  (app)/            # All authenticated pages
    dashboard/
    games/          # List, detail, new, edit + actions.ts
    tickets/
    wheel/
      history/      # Shared spin history across all players
    achievements/
    activity/       # Full friends activity feed
    settings/
    users/
      [username]/   # Friend profile page
  api/
    achievement-flash/  # Cookie-based flash for new achievement toasts
    rawg/               # RAWG proxy endpoints
components/
  layout/           # Nav, UserDropdown, ThemeInitialiser, AchievementProvider
  games/            # GameCard, GameForm, GameListView, GameFilters, …
  dashboard/        # GamesPerYearChart, GenreAndPlatformCharts, FriendActivityFeed
  users/            # RecommendationsCarousel, AddToBacklogButton
  wheel/            # WheelClient, WheelAnimation
lib/
  achievements.ts   # Achievement definitions, XP, level math, unlock logic
  tickets.ts        # Ticket award/penalty calculations
  wheel.ts          # Turn cycle, winner selection
  wheel-history.ts  # Spin type badges, labels, cost inference
  activity.ts       # Activity feed item types, builder, formatters
  accent.ts         # Hex → HSL palette generator for CSS custom properties
  constants.ts      # Ticket costs, awards, wheel rules
  data/
    profile.ts      # React cache()-wrapped profile fetch (deduplicates layout + page queries)
```
