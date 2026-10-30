/**
 * "Is someone playing this right now?" — read from `play_sessions`.
 *
 * There is no realtime channel telling the website when a session stops: if
 * the agent crashes, the PC sleeps, or the network drops, the row simply stops
 * being updated. So "live" is an inference from recency, not a guarantee —
 * which is why a session counts as live only while it has been checkpointed
 * recently, never from `ended_at` alone.
 */

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
