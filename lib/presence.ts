/**
 * "Is someone playing this right now?" — read from `play_sessions`.
 *
 * There is no realtime channel telling the website when a session stops: if
 * the agent crashes, the PC sleeps, or the network drops, the row simply stops
 * being updated. So "live" is an inference from recency, not a guarantee —
 * which is why a session counts as live only while it has been checkpointed
 * recently, never from `ended_at` alone.
 */
import { getLevel } from './levels'

/**
 * How stale a checkpoint can be before a session is no longer shown as live.
 *
 * The agent checkpoints every 15 minutes (`checkpointMinutes` in
 * `/api/agent/state`), with some slack for a slow poll or a brief network
 * blip. Past this, silence more likely means the game closed without a final
 * write reaching the server than that the next checkpoint is merely due.
 */
export const LIVE_STALE_AFTER_MS = 20 * 60 * 1000

export type SessionRecency = {
  ended_at: string | null
  started_at: string
  last_checkpoint_at: string | null
}

/** Pure: whether a session row should still be treated as in progress. */
export function isSessionLive(session: SessionRecency, nowMs: number): boolean {
  if (session.ended_at) return false
  const last = session.last_checkpoint_at ?? session.started_at
  const lastMs = Date.parse(last)
  if (Number.isNaN(lastMs)) return false
  return nowMs - lastMs < LIVE_STALE_AFTER_MS
}

/**
 * A session as it really stands: one with no end that isn't live any more
 * (the tracker crashed or was restarted, or the PC slept, before a final
 * write) ended at its last checkpoint. Anything that reads `ended_at == null`
 * as "still running" should read rows through this first; the game page's
 * session list (lib/play-sessions.ts) applies the same rule.
 */
export function settleSession<S extends SessionRecency>(session: S, nowMs: number): S {
  if (session.ended_at || isSessionLive(session, nowMs)) return session
  return { ...session, ended_at: session.last_checkpoint_at ?? session.started_at }
}

export type LiveSessionRow = SessionRecency & { game_id: string | null }

/**
 * The live sessions among a set of rows, keyed by game id.
 *
 * `game_id` is a library row's own id, globally unique, so this works the same
 * whether the rows span one person's games or several — handy for a future
 * friends-list indicator, not just a single profile.
 */
export function liveGameIds(rows: LiveSessionRow[], nowMs: number): Map<string, string> {
  const out = new Map<string, string>()
  for (const row of rows) {
    if (!row.game_id || out.has(row.game_id)) continue
    if (!isSessionLive(row, nowMs)) continue
    out.set(row.game_id, row.started_at)
  }
  return out
}

export type PresenceRow = LiveSessionRow & { user_id: string }

/**
 * Who is in a game right now: one live session per person (their most
 * recently started, should a crash ever leave two open), self first, then
 * whoever has been playing longest.
 */
export function livePlayers<R extends PresenceRow>(rows: R[], nowMs: number, selfId: string): R[] {
  const byUser = new Map<string, R>()
  for (const row of rows) {
    if (!row.game_id || !isSessionLive(row, nowMs)) continue
    const current = byUser.get(row.user_id)
    if (!current || row.started_at > current.started_at) byUser.set(row.user_id, row)
  }
  return Array.from(byUser.values()).sort((a, b) =>
    Number(b.user_id === selfId) - Number(a.user_id === selfId) || a.started_at.localeCompare(b.started_at))
}

export type PlayingNowEntry = {
  userId: string
  isSelf: boolean
  displayName: string
  username: string
  accentColour: string | null
  /** Their level, for the tier frame round their avatar. */
  level: number
  gameId: string
  gameTitle: string
  gameImage: string | null
  startedAt: string
}

/**
 * Everyone currently in a game — the signed-in user and every friend. Runs
 * through the normal RLS-scoped client.
 *
 * `friendIds`: the public edition's friends (lib/data/friends.ts). Without it
 * (the friends edition) every other member counts as a friend, like the
 * dashboard's Friends list. With it, only you and those friends: a stranger
 * whose play activity is set to Everyone is readable, but isn't your friend.
 */
export async function getPlayingNow(
  supabase: { from: (t: string) => any },
  selfId: string,
  nowMs: number = Date.now(),
  friendIds?: string[],
): Promise<PlayingNowEntry[]> {
  // Only open sessions checkpointed recently enough to still count as live —
  // filtered in the query so a long-dead, never-closed row costs nothing.
  const cutoff = new Date(nowMs - LIVE_STALE_AFTER_MS).toISOString()
  let query = supabase
    .from('play_sessions')
    .select('user_id, game_id, started_at, last_checkpoint_at, ended_at')
    .is('ended_at', null)
    .or(`last_checkpoint_at.gte.${cutoff},started_at.gte.${cutoff}`)
  if (friendIds) query = query.in('user_id', [selfId, ...friendIds])
  const { data: sessionRows } = await query

  const live = livePlayers((sessionRows ?? []) as PresenceRow[], nowMs, selfId)
  if (live.length === 0) return []

  const [{ data: games }, { data: profiles }] = await Promise.all([
    supabase.from('games').select('id, title, artwork_url, image_url, cover_image_url').in('id', live.map(l => l.game_id!)),
    supabase.from('profiles').select('id, display_name, username, accent_colour, xp').in('id', live.map(l => l.user_id)),
  ]) as [
    { data: { id: string; title: string; artwork_url: string | null; image_url: string | null; cover_image_url: string | null }[] | null },
    { data: { id: string; display_name: string | null; username: string; accent_colour: string | null; xp: number | null }[] | null },
  ]
  const gameById = new Map((games ?? []).map(g => [g.id, g]))
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

  return live.flatMap(l => {
    const game = gameById.get(l.game_id!)
    const profile = profileById.get(l.user_id)
    if (!game || !profile) return []
    return [{
      userId: l.user_id,
      isSelf: l.user_id === selfId,
      displayName: profile.display_name ?? profile.username,
      username: profile.username,
      accentColour: profile.accent_colour,
      level: getLevel(profile.xp ?? 0),
      gameId: game.id,
      gameTitle: game.title,
      gameImage: game.artwork_url ?? game.image_url ?? game.cover_image_url,
      startedAt: l.started_at,
    }]
  })
}

/**
 * The games, among the given users, with a session currently in progress.
 *
 * Returns a map of game id -> that session's `started_at`, so a client
 * component can tick a live "playing for Xm" display from a timestamp that
 * never changes mid-session, the same way the desktop app's own window does.
 */
export async function getLiveSessions(
  supabase: { from: (t: string) => any },
  userIds: string[],
  nowMs: number = Date.now(),
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map()

  const { data } = await supabase
    .from('play_sessions')
    .select('game_id, started_at, last_checkpoint_at, ended_at')
    .in('user_id', userIds)
    .is('ended_at', null)
    .order('started_at', { ascending: false })

  return liveGameIds((data ?? []) as LiveSessionRow[], nowMs)
}
