/**
 * The "Play Sessions" achievements: everything worked out from the desktop
 * tracker's `play_sessions` rows rather than from the library. Pure — the
 * Supabase reads live in lib/achievements.ts's gatherStats, which hands the
 * rows over here.
 *
 * Days are UK days, like the rest of the session UI (lib/activity.ts), so
 * "played on Saturday" means Saturday on a UK clock, not in UTC.
 */
import { londonDay } from './activity'

export type AchievementSession = {
  game_id: string | null
  started_at: string
  ended_at: string | null
  last_checkpoint_at: string | null
  minutes: number
}

/** Another player's session, for Squad Up — `gameKey` says which game it was (see gameKey). */
export type KeyedSession = AchievementSession & { gameKey: string }

export type SessionAchievementStats = {
  sessionCount: number
  /** Longest run of consecutive UK days with at least one session. */
  longestDayStreak: number
  /** Most minutes in any single Saturday + Sunday. */
  bestWeekendMinutes: number
  /** Most minutes in any single UK day. */
  bestDayMinutes: number
  /** Most different games with a session on the same UK day. */
  mostGamesInADay: number
  /** Most minutes tracked on any one game. */
  mostMinutesOnOneGame: number
  distinctGames: number
  /** Played the same game at the same time as someone else, for SQUAD_OVERLAP_MS or more. */
  hasSquadUp: boolean
}

/** How long two sessions must overlap to count as playing together. */
export const SQUAD_OVERLAP_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000
/** No session counts as longer than this, whatever a broken row says. */
const MAX_SESSION_MS = 24 * HOUR_MS

/**
 * Which game a library row is, across different people's libraries: each
 * person has their own `games` row for the same game, so ids never match.
 * The metadata provider's id when there is one, else the lower-cased title.
 */
export function gameKey(game: { title: string; igdb_id?: number | null; rawg_id?: number | null }): string {
  if (game.igdb_id) return `igdb:${game.igdb_id}`
  if (game.rawg_id) return `rawg:${game.rawg_id}`
  return `title:${game.title.trim().toLowerCase()}`
}

/** A session's span: start to its end, or — never properly ended — its last checkpoint. */
function span(s: AchievementSession): [number, number] {
  const start = Date.parse(s.started_at)
  const end = Date.parse(s.ended_at ?? s.last_checkpoint_at ?? s.started_at)
  return [start, Math.min(Math.max(end, start), start + MAX_SESSION_MS)]
}

/** Sessions that count: a real game and at least a minute — the feed's rule too. */
function counted<S extends AchievementSession>(sessions: S[]): S[] {
  return sessions.filter(s => s.game_id && s.minutes >= 1 && !isNaN(Date.parse(s.started_at)))
}

/**
 * Minutes played on each UK day. A session crossing midnight is split
 * between the two days, stepping on hour boundaries (which are UK hour
 * boundaries too — the offset is always whole hours). Scaled to the
 * session's tracked minutes, so a session that sat idle past its last
 * checkpoint can't count for more than was actually tracked.
 */
export function minutesByDay(sessions: AchievementSession[]): Map<string, number> {
  const days = new Map<string, number>()
  for (const s of counted(sessions)) {
    const [start, end] = span(s)
    const length = end - start
    if (length <= 0) {
      const day = londonDay(s.started_at)
      days.set(day, (days.get(day) ?? 0) + s.minutes)
      continue
    }
    const scale = s.minutes / (length / 60000)
    let t = start
    while (t < end) {
      const next = Math.min(end, Math.floor(t / HOUR_MS) * HOUR_MS + HOUR_MS)
      const day = londonDay(new Date(t).toISOString())
      days.set(day, (days.get(day) ?? 0) + ((next - t) / 60000) * scale)
      t = next
    }
  }
  return days
}

const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`)

/** Longest run of consecutive days among `YYYY-MM-DD` keys. */
export function longestStreak(days: Iterable<string>): number {
  const sorted = Array.from(new Set(days)).sort()
  let best = 0
  let run = 0
  let prev = NaN
  for (const day of sorted) {
    const ms = dayMs(day)
    run = ms - prev === 86_400_000 ? run + 1 : 1
    best = Math.max(best, run)
    prev = ms
  }
  return best
}

/** Most minutes in one Saturday + the Sunday after it. */
function bestWeekend(byDay: Map<string, number>): number {
  const weekends = new Map<string, number>()
  byDay.forEach((minutes, day) => {
    const weekday = new Date(dayMs(day)).getUTCDay() // the key is a UK date read as UTC midnight
    if (weekday !== 6 && weekday !== 0) return
    // Key each weekend by its Saturday.
    const saturday = weekday === 6 ? day : new Date(dayMs(day) - 86_400_000).toISOString().slice(0, 10)
    weekends.set(saturday, (weekends.get(saturday) ?? 0) + minutes)
  })
  return Math.max(0, ...Array.from(weekends.values()))
}

/**
 * Whether any of `own` overlaps, on the same game, with any of `others` for
 * at least SQUAD_OVERLAP_MS. `ownKeys` maps the player's own game ids to
 * game keys.
 */
export function hasSquadUp(own: AchievementSession[], ownKeys: Map<string, string>, others: KeyedSession[]): boolean {
  const byKey = new Map<string, [number, number][]>()
  for (const o of counted(others)) {
    byKey.set(o.gameKey, [...(byKey.get(o.gameKey) ?? []), span(o)])
  }
  for (const s of counted(own)) {
    const key = ownKeys.get(s.game_id!)
    if (!key) continue
    const [start, end] = span(s)
    for (const [oStart, oEnd] of byKey.get(key) ?? []) {
      if (Math.min(end, oEnd) - Math.max(start, oStart) >= SQUAD_OVERLAP_MS) return true
    }
  }
  return false
}

export function sessionAchievementStats(
  own: AchievementSession[],
  ownKeys: Map<string, string> = new Map(),
  others: KeyedSession[] = [],
): SessionAchievementStats {
  const sessions = counted(own)
  const byDay = minutesByDay(sessions)

  const gamesByDay = new Map<string, Set<string>>()
  const minutesByGame = new Map<string, number>()
  for (const s of sessions) {
    const day = londonDay(s.started_at)
    gamesByDay.set(day, (gamesByDay.get(day) ?? new Set()).add(s.game_id!))
    minutesByGame.set(s.game_id!, (minutesByGame.get(s.game_id!) ?? 0) + s.minutes)
  }

  return {
    sessionCount: sessions.length,
    longestDayStreak: longestStreak(sessions.map(s => londonDay(s.started_at))),
    bestWeekendMinutes: Math.round(bestWeekend(byDay)),
    bestDayMinutes: Math.round(Math.max(0, ...Array.from(byDay.values()))),
    mostGamesInADay: Math.max(0, ...Array.from(gamesByDay.values()).map(g => g.size)),
    mostMinutesOnOneGame: Math.max(0, ...Array.from(minutesByGame.values())),
    distinctGames: minutesByGame.size,
    hasSquadUp: hasSquadUp(sessions, ownKeys, others),
  }
}
