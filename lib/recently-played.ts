import type { Game } from './types'

/** A play session as the strip needs it: which game, and when it started. */
export type SessionRow = { game_id: string | null; started_at: string }

/**
 * The most recently played games, newest first, one entry per game.
 *
 * Sessions are per-launch, so a game played every evening has dozens of rows.
 * Keeping only the first occurrence of each turns "the last N sessions" into
 * "the last N games", which is what anyone means by recently played.
 *
 * Pure, because the ordering is the part worth testing: the rows arrive sorted
 * by `started_at` and the dedupe must not disturb that.
 */
export function recentGameIds(rows: SessionRow[], limit: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const row of rows) {
    if (!row.game_id || seen.has(row.game_id)) continue
    seen.add(row.game_id)
    out.push(row.game_id)
    if (out.length >= limit) break
  }
  return out
}

/** Put games back into the order their ids were given in. */
export function orderByIds(games: Game[], ids: string[]): Game[] {
  const byId = new Map(games.map(g => [g.id, g]))
  return ids.map(id => byId.get(id)).filter((g): g is Game => Boolean(g))
}

/**
 * The last few Ambient games this person actually played.
 *
 * Reads `play_sessions`, which until now was written by the agent and never
 * read. Ordering by a game's own `updated_at` would be wrong: a trigger bumps
 * it on every write, so editing a game's notes would push it to the top of a
 * list that claims to be about playing.
 *
 * Ambient only, deliberately. Games that came from the wheel have their own
 * places to appear, and mixing them in here would blur exactly the line this
 * category exists to draw.
 */
export async function getRecentlyPlayed(
  supabase: { from: (t: string) => any },
  userId: string,
  limit = 3,
): Promise<Game[]> {
  // More sessions than games wanted, since one game can hold many of the most
  // recent rows — an evening of the same game would otherwise fill the window.
  const { data: sessions } = await supabase
    .from('play_sessions')
    .select('game_id, started_at')
    .eq('user_id', userId)
    .not('game_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(60)

  const ids = recentGameIds((sessions ?? []) as SessionRow[], limit * 8)
  if (ids.length === 0) return []

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'ambient')
    .in('id', ids)

  // Filtering happens after the lookup, so a game that has since been moved out
  // of Ambient drops out and the next one down takes its place.
  return orderByIds((games ?? []) as Game[], ids).slice(0, limit)
}
