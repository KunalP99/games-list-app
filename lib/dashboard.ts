/**
 * Rules for the new dashboard layout (`components/dashboard/new/`).
 *
 * Pure, so each one is a unit test: which game takes the hero, whether there's
 * a play streak worth showing, and what goes in "Coming up". Supabase and IGDB
 * access stays in the components that call these.
 */
import { londonDay } from './activity'

// ── Layout switch ─────────────────────────────────────────────────────────

/**
 * The dashboard has two layouts. The choice lives in a cookie, like the games
 * list's grid/cover/table view, so there's nothing to migrate and switching is
 * one click. The new layout is the default; only someone who has chosen
 * "Back to classic" (cookie `classic`) gets the classic one.
 */
export type DashboardLayout = 'classic' | 'new'
export const DASHBOARD_LAYOUT_COOKIE = 'dashboardLayout'

export function parseDashboardLayout(value: string | undefined): DashboardLayout {
  return value === 'classic' ? 'classic' : 'new'
}

// ── Play streak ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const shiftDay = (day: string, by: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10)

/**
 * The run of consecutive UK days, up to today, with at least one tracked
 * session. Counted the same way as the Stats page's streak (`streaks` in
 * `lib/stats-wrapped.ts`): a run is still alive until a whole day passes
 * without playing.
 *
 * - `active` — played today.
 * - `at_risk` — last played yesterday: still alive, but needs a session today.
 * - `null` — no run reaches yesterday, so there's nothing to show.
 */
export type StreakStatus = { days: number; state: 'active' | 'at_risk'; since: string }

export function streakStatus(dayKeys: Iterable<string>, now: Date = new Date()): StreakStatus | null {
  const days = new Set(dayKeys)
  const today = londonDay(now.toISOString())
  const yesterday = shiftDay(today, -1)
  const last = days.has(today) ? today : days.has(yesterday) ? yesterday : null
  if (!last) return null

  let count = 0
  let since = last
  for (let day = last; days.has(day); day = shiftDay(day, -1)) {
    count++
    since = day
  }
  return { days: count, state: last === today ? 'active' : 'at_risk', since }
}

// ── Your week / month / year ──────────────────────────────────────────────

export type PlayPeriod = 'week' | 'month' | 'year'
export const PLAY_PERIODS: PlayPeriod[] = ['week', 'month', 'year']
/** The most UK days any period can cover (the year, in a leap year), for how far back to load sessions. */
export const MAX_PLAY_PERIOD_DAYS = 366

export type PlaySession = { game_id: string | null; started_at: string; minutes: number | null }
/** One bar: a single day (week, month) or a calendar month (year), clipped to the period. */
export type PlayBar = { start: string; end: string; minutes: number }
export type PlaySummary = {
  period: PlayPeriod
  /** Oldest first; the last bar always ends today. */
  bars: PlayBar[]
  totalMinutes: number
  daysPlayed: number
  dayCount: number
  /** The game with the most minutes in the period; ties go to the most recent session. */
  topGameId: string | null
}

/**
 * The first UK day of a period ending today: the last 7 days, the last 30, or
 * the last 12 calendar months (this one so far, plus the 11 before it).
 */
function periodStart(period: PlayPeriod, today: string): string {
  if (period === 'week') return shiftDay(today, -6)
  if (period === 'month') return shiftDay(today, -29)
  const [y, m] = today.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1 - 11, 1))
  return first.toISOString().slice(0, 10)
}

/**
 * Tracked play over the last week (7 days), month (30 days) or year (12
 * calendar months), up to and including today. A session counts on the UK day
 * it started, the same day the streak puts it on, so the two agree. The year
 * is a bar per calendar month; the others a bar per day.
 *
 * `sessions` should be newest first (as the dashboard loads them), which is
 * what settles a tie for most played.
 */
export function playSummary(sessions: PlaySession[], period: PlayPeriod, now: Date = new Date()): PlaySummary {
  const today = londonDay(now.toISOString())
  const days: { day: string; minutes: number }[] = []
  for (let day = periodStart(period, today); day <= today; day = shiftDay(day, 1)) days.push({ day, minutes: 0 })
  const byDay = new Map(days.map(d => [d.day, d]))
  const byGame = new Map<string, number>()

  for (const s of sessions) {
    const bucket = byDay.get(londonDay(s.started_at))
    const minutes = Math.max(0, s.minutes ?? 0)
    if (!bucket || minutes === 0) continue
    bucket.minutes += minutes
    // Map keeps first-insertion order, i.e. most recent session first.
    if (s.game_id) byGame.set(s.game_id, (byGame.get(s.game_id) ?? 0) + minutes)
  }

  let topGameId: string | null = null
  let best = 0
  for (const [id, m] of Array.from(byGame)) if (m > best) { best = m; topGameId = id }

  let bars: PlayBar[]
  if (period === 'year') {
    bars = []
    for (const d of days) {
      const last = bars[bars.length - 1]
      if (last && d.day.slice(0, 7) === last.start.slice(0, 7)) {
        last.end = d.day
        last.minutes += d.minutes
      } else {
        bars.push({ start: d.day, end: d.day, minutes: d.minutes })
      }
    }
  } else {
    bars = days.map(d => ({ start: d.day, end: d.day, minutes: d.minutes }))
  }

  return {
    period,
    bars,
    totalMinutes: days.reduce((sum, d) => sum + d.minutes, 0),
    daysPlayed: days.filter(d => d.minutes > 0).length,
    dayCount: days.length,
    topGameId,
  }
}

/**
 * Tickets gained over the same 7 UK days as "Your week", for the Tickets tile
 * ("+4 this week"). Gains only: spending on the wheel doesn't take away from
 * what was earned.
 */
export function ticketsEarnedThisWeek(rows: { amount: number; created_at: string }[], now: Date = new Date()): number {
  const from = periodStart('week', londonDay(now.toISOString()))
  return rows.reduce((sum, r) => (r.amount > 0 && londonDay(r.created_at) >= from ? sum + r.amount : sum), 0)
}

/** "45m", "1.7h", "12h", "240h"; empty for nothing. Whole hours from 100h, where a tenth is noise. */
export function formatPlayMinutes(minutes: number): string {
  if (minutes <= 0) return ''
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  return hours >= 100 ? `${Math.round(hours)}h` : `${Math.round(minutes / 6) / 10}h`
}

// ── Hero ──────────────────────────────────────────────────────────────────

export type Hero<T> = {
  /** The game's status: a Playing game can be marked completed from the hero; an Ambient one can't. */
  kind: 'playing' | 'ambient'
  game: T
  /** The running session's start, while the tracker sees the game. */
  liveSince: string | null
  lastPlayedAt: string | null
}

/**
 * What fills the hero at the top of the dashboard: whichever Playing or Ambient
 * game was played most recently. One running right now comes first (the latest
 * to start, if several), then the latest last-played. Games the tracker has
 * never seen go after any that it has, Playing before Ambient, keeping the
 * order they came in (newest-updated first). `null` with neither.
 */
export function pickHero<T extends { id: string }>(opts: {
  playing: T[]
  ambient: T[]
  live: Map<string, string>
  lastPlayed: Map<string, string>
}): Hero<T> | null {
  const { playing, ambient, live, lastPlayed } = opts
  const candidates = [
    ...playing.map(game => ({ game, kind: 'playing' as const })),
    ...ambient.map(game => ({ game, kind: 'ambient' as const })),
  ].map((c, index) => ({ ...c, index, live: live.get(c.game.id) ?? null, last: lastPlayed.get(c.game.id) ?? null }))
  if (candidates.length === 0) return null

  // Input order already puts Playing before Ambient, so it settles the rest.
  candidates.sort((a, b) => compareDesc(a.live, b.live) || compareDesc(a.last, b.last) || a.index - b.index)
  const top = candidates[0]
  return { kind: top.kind, game: top.game, liveSince: top.live, lastPlayedAt: top.last }
}

/** Newer timestamp first; a missing one sorts after any present one. 0 when both are missing or equal. */
function compareDesc(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a == null) return 1
  if (b == null) return -1
  return Date.parse(b) - Date.parse(a)
}

// ── Coming up ─────────────────────────────────────────────────────────────

export type ComingUpRelease = {
  id: string
  title: string
  release_date: string | null
  release_date_precision?: 'full' | 'year' | null
}
export type ComingUpEvent = { id: number; name: string; startTime: number; liveStreamUrl?: string | null }

export type ComingUpItem =
  | { kind: 'release'; key: string; title: string; day: string; gameId: string }
  | { kind: 'event'; key: string; title: string; day: string; startTime: number; url: string | null }

/**
 * Backlog games releasing soon and gaming events, merged into one list by date,
 * soonest first. Only things from today onwards; a release known only to the
 * year has no day to sit on, so it's left out.
 */
export function comingUp(
  releases: ComingUpRelease[],
  events: ComingUpEvent[],
  now: Date = new Date(),
  limit = 4,
): ComingUpItem[] {
  const today = londonDay(now.toISOString())
  const items: ComingUpItem[] = []

  for (const r of releases) {
    if (!r.release_date || r.release_date_precision === 'year') continue
    const day = r.release_date.slice(0, 10)
    if (day < today) continue
    items.push({ kind: 'release', key: `r-${r.id}`, title: r.title, day, gameId: r.id })
  }
  for (const e of events) {
    const day = londonDay(new Date(e.startTime * 1000).toISOString())
    if (day < today) continue
    items.push({ kind: 'event', key: `e-${e.id}`, title: e.name, day, startTime: e.startTime, url: e.liveStreamUrl ?? null })
  }

  return items
    .sort((a, b) => a.day.localeCompare(b.day) || a.title.localeCompare(b.title))
    .slice(0, limit)
}

/** Whole UK days from `now` until `day` (`YYYY-MM-DD`): 0 today, 1 tomorrow. */
export function daysFromToday(day: string, now: Date = new Date()): number {
  const today = londonDay(now.toISOString())
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS)
}

/** "today" / "tomorrow" / "in 5 days". */
export function countdownLabel(day: string, now: Date = new Date()): string {
  const n = daysFromToday(day, now)
  if (n <= 0) return 'today'
  if (n === 1) return 'tomorrow'
  return `in ${n} days`
}
