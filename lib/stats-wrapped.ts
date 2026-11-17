/**
 * The extra numbers behind the Stats page's "Wrapped" design, on top of
 * lib/user-stats.ts: what only the desktop tracker can say (most played game,
 * longest session, longest streak), where tickets came from and went, and the
 * head-to-head rounds when comparing with a friend.
 *
 * Kept apart from computeUserStats on purpose — that one also feeds /games
 * and profile banners, which have no use for a user's whole session history.
 *
 * Days are UK days, like everywhere else sessions are shown (lib/activity.ts).
 */
import { londonDay } from './activity'

// ── Tickets ────────────────────────────────────────────────────────────────

export type TicketTx = { amount: number; reason: string | null }
export type TicketPart = { key: string; label: string; amount: number }
export type TicketBreakdown = {
  earned: number
  lost: number
  /** Where they came from / went, biggest groups first-defined, empty groups dropped. */
  earnedParts: TicketPart[]
  lostParts: TicketPart[]
}

const EARNED_GROUPS: { key: string; label: string; reasons: (r: string) => boolean }[] = [
  { key: 'completions', label: 'Completions', reasons: r => r.startsWith('game_completed_') },
  { key: 'perfect', label: '100% bonuses', reasons: r => r === 'achievement_100_percent' },
  { key: 'skips', label: 'Skipped turns', reasons: r => r === 'turn_skipped' },
]
const LOST_GROUPS: { key: string; label: string; reasons: (r: string) => boolean }[] = [
  { key: 'spin', label: 'Spin again', reasons: r => r === 'spin' },
  { key: 'reroll', label: 'Rerolls', reasons: r => r === 'spin_reroll' },
  { key: 'choose', label: 'Choose', reasons: r => r === 'choose_game' || r === 'choose_other_player_game' },
  { key: 'penalty', label: 'Penalties', reasons: r => r === 'assigned_game_incomplete' || r === 'objective_incomplete' },
]

function group(txs: TicketTx[], groups: typeof EARNED_GROUPS): TicketPart[] {
  const parts = groups.map(g => ({ key: g.key, label: g.label, amount: 0 }))
  const other = { key: 'other', label: 'Other', amount: 0 }
  for (const t of txs) {
    const amount = Math.abs(t.amount)
    const i = groups.findIndex(g => g.reasons(t.reason ?? ''))
    if (i === -1) other.amount += amount
    else parts[i].amount += amount
  }
  return [...parts, other].filter(p => p.amount > 0)
}

/** Earned (positive rows) and lost (negative rows: wheel spends and penalties), grouped by reason. */
export function ticketBreakdown(txs: TicketTx[]): TicketBreakdown {
  const earnedTxs = txs.filter(t => t.amount > 0)
  const lostTxs = txs.filter(t => t.amount < 0)
  return {
    earned: earnedTxs.reduce((s, t) => s + t.amount, 0),
    lost: lostTxs.reduce((s, t) => s - t.amount, 0),
    earnedParts: group(earnedTxs, EARNED_GROUPS),
    lostParts: group(lostTxs, LOST_GROUPS),
  }
}

// ── Tracked play ───────────────────────────────────────────────────────────

export type SessionRow = {
  game_id: string | null
  started_at: string
  ended_at: string | null
  last_checkpoint_at: string | null
  minutes: number
}

export type TrackedHighlights = {
  totalMinutes: number
  /** Grouped by title, so a replay's sessions count towards the same game. */
  mostPlayed: { title: string; minutes: number; share: number } | null
  runnerUp: { title: string; minutes: number } | null
  longestSession: { title: string; minutes: number; start: string; end: string } | null
  /** Days in a row (UK) with at least one session; `current` is 0 unless it reaches today or yesterday. */
  streak: { days: number; from: string; to: string; current: number } | null
}

const DAY_MS = 86_400_000
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const shiftDay = (day: string, by: number) => new Date(dayMs(day) + by * DAY_MS).toISOString().slice(0, 10)

/** The longest run of consecutive days, and the run that ends today or yesterday. */
export function streaks(dayKeys: Iterable<string>, now: Date = new Date()): TrackedHighlights['streak'] {
  const days = Array.from(new Set(dayKeys)).sort()
  if (days.length === 0) return null
  let best = { days: 1, from: days[0], to: days[0] }
  let run = { days: 1, from: days[0], to: days[0] }
  for (let i = 1; i < days.length; i++) {
    run = dayMs(days[i]) - dayMs(days[i - 1]) === DAY_MS
      ? { days: run.days + 1, from: run.from, to: days[i] }
      : { days: 1, from: days[i], to: days[i] }
    if (run.days > best.days) best = run
  }
  const today = londonDay(now.toISOString())
  const current = run.to === today || run.to === shiftDay(today, -1) ? run.days : 0
  return { ...best, current }
}

/**
 * Most played game, longest session and longest streak from one person's
 * sessions. Sessions under a minute, or whose game is gone, don't count —
 * the same rule as the activity feed and the achievements.
 */
export function trackedHighlights(
  sessions: SessionRow[],
  titles: Map<string, string>,
  now: Date = new Date(),
): TrackedHighlights {
  const counted = sessions.filter(s => s.game_id && s.minutes >= 1 && titles.has(s.game_id))
  const totalMinutes = counted.reduce((sum, s) => sum + s.minutes, 0)

  const byTitle = new Map<string, { title: string; minutes: number }>()
  for (const s of counted) {
    const title = titles.get(s.game_id!)!
    const key = title.trim().toLowerCase()
    const cur = byTitle.get(key) ?? { title, minutes: 0 }
    byTitle.set(key, { title: cur.title, minutes: cur.minutes + s.minutes })
  }
  const ranked = Array.from(byTitle.values()).sort((a, b) => b.minutes - a.minutes)

  let longest: SessionRow | null = null
  for (const s of counted) if (!longest || s.minutes > longest.minutes) longest = s

  return {
    totalMinutes,
    mostPlayed: ranked[0] ? { ...ranked[0], share: totalMinutes ? ranked[0].minutes / totalMinutes : 0 } : null,
    runnerUp: ranked[1] ?? null,
    longestSession: longest
      ? {
          title: titles.get(longest.game_id!)!,
          minutes: longest.minutes,
          start: longest.started_at,
          end: longest.ended_at ?? longest.last_checkpoint_at ?? longest.started_at,
        }
      : null,
    streak: streaks(counted.map(s => londonDay(s.started_at)), now),
  }
}

// ── Head-to-head ───────────────────────────────────────────────────────────

export type RoundInput = {
  key: string
  you: number | null
  friend: number | null
  /** False for a stat where less is better. */
  higherWins?: boolean
}

export type Round = RoundInput & { winner: 'you' | 'friend' | 'tie' | null; diff: number }

/** Who took each round. A round with a side missing data has no winner and scores for no one. */
export function scoreRounds(inputs: RoundInput[]): { rounds: Round[]; you: number; friend: number } {
  const rounds = inputs.map(r => {
    if (r.you == null || r.friend == null) return { ...r, winner: null, diff: 0 }
    const higher = r.higherWins ?? true
    const diff = Math.abs(r.you - r.friend)
    const winner: Round['winner'] = r.you === r.friend ? 'tie'
      : (r.you > r.friend) === higher ? 'you' : 'friend'
    return { ...r, winner, diff }
  })
  return {
    rounds,
    you: rounds.filter(r => r.winner === 'you').length,
    friend: rounds.filter(r => r.winner === 'friend').length,
  }
}

/**
 * Your share of a split band: how well you did against the two of you,
 * clamped so the smaller half always has room for its number.
 */
export function splitShare(you: number, friend: number, higherWins = true): number {
  const total = you + friend
  if (total <= 0) return 0.5
  const share = higherWins ? you / total : friend / total
  return Math.min(0.65, Math.max(0.35, share))
}

// ── Formatting ─────────────────────────────────────────────────────────────

/** "45m", "6h 42m", "9h" */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "45m" under an hour, whole hours ("212h") from there — for totals where minutes past the hour don't matter. */
export function formatHoursRough(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`
}

const ukShortDay =new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const ukTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false })
const ukWeekdayDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })

/** "12 Oct – 25 Oct 2026" (or a single day) from two `YYYY-MM-DD` keys. */
export function formatDayRange(from: string, to: string): string {
  const fmt = (d: string) => ukShortDay.format(new Date(dayMs(d)))
  const year = to.slice(0, 4)
  return from === to ? `${fmt(from)} ${year}` : `${fmt(from)} – ${fmt(to)} ${year}`
}

/** "Sat 14 Sep · 19:40 – 02:22", UK time. */
export function formatSessionWhen(start: string, end: string): string {
  return `${ukWeekdayDate.format(new Date(start)).replace(',', '')} · ${ukTime.format(new Date(start))} – ${ukTime.format(new Date(end))}`
}

/** Black or white, whichever reads better on a hex background. */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  // Contrast against near-black text vs white; pick the higher.
  return (lum + 0.05) / 0.06 >= 1.05 / (lum + 0.05) ? '#1A0A05' : '#FFFFFF'
}

// ── Loading ────────────────────────────────────────────────────────────────

export type WrappedExtras = {
  tickets: TicketBreakdown
  tracked: TrackedHighlights
  /** Completed games at 100% achievements, alphabetical. */
  perfectedTitles: string[]
}

type Sb = { from: (t: string) => any }

/** Every row of a query, past PostgREST's 1,000-row cap. */
async function fetchAll<T>(query: () => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await query().range(from, from + 999) as { data: T[] | null }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

/** The Wrapped-only numbers for one user. Readable for friends too (same RLS as the profile pages). */
export async function computeWrappedExtras(supabase: Sb, userId: string, now: Date = new Date()): Promise<WrappedExtras> {
  const [games, txs, sessions] = await Promise.all([
    fetchAll<{ id: string; title: string; status: string; achievement_progress: number | null }>(() =>
      supabase.from('games').select('id, title, status, achievement_progress').eq('user_id', userId).order('id')),
    fetchAll<TicketTx>(() =>
      supabase.from('ticket_transactions').select('amount, reason').eq('user_id', userId).order('created_at')),
    fetchAll<SessionRow>(() =>
      supabase.from('play_sessions').select('game_id, started_at, ended_at, last_checkpoint_at, minutes').eq('user_id', userId).order('started_at')),
  ])
  const titles = new Map(games.map(g => [g.id, g.title]))
  return {
    tickets: ticketBreakdown(txs),
    tracked: trackedHighlights(sessions, titles, now),
    perfectedTitles: games
      .filter(g => g.status === 'completed' && g.achievement_progress === 100)
      .map(g => g.title)
      .sort((a, b) => a.localeCompare(b)),
  }
}
