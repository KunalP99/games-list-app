import 'server-only'
import { backlogCopy, type LibraryRow } from './trackable-row'
import { FEATURES, editionStatus } from './edition'

type Sb = { from: (table: string) => any }

/**
 * When the tracker sees a game whose only copies are untrackable, and one of
 * them is in the Backlog, that copy is the one being played now. Without
 * this, a Completed copy edited more recently than the Backlog one raised
 * "is this a replay?", and answering it added a further row beside the
 * Backlog copy, which the game page then counted as another playthrough.
 *
 * With Ambient (the friends edition) the Backlog copy is returned as it is,
 * so the tracker asks about *it*: "set it to Playing or Ambient?" (a backlog
 * game may be an ongoing one), and either answer moves that same copy
 * (/api/agent/resume). Without Ambient (public) there's nothing to ask: it's
 * moved to Playing and tracked straight away.
 *
 * Moves it only while it's still in the Backlog (compare-and-set), so a
 * change made on the website at the same moment isn't overwritten. Gives it
 * today's start date if it has none, and the running game's Steam app id if
 * it has none, so the next launch matches it directly. Returns the row to
 * answer with: the Backlog copy (asked about, or now Playing), or `row`
 * unchanged when there's none (or the move lost a race).
 */
export async function preferBacklogCopy<R extends LibraryRow & { start_date?: string | null }>(
  sb: Sb,
  row: R,
  library: R[],
  steamAppId: number | null = null,
): Promise<R> {
  const copy = backlogCopy(row, library)
  if (!copy) return row
  if (FEATURES.ambient) return copy
  const status = editionStatus('playing')
  const update: Record<string, unknown> = {
    status,
    completion_date: null,
    start_date: copy.start_date ?? new Date().toISOString().slice(0, 10),
  }
  if (steamAppId != null && copy.steam_appid == null) update.steam_appid = steamAppId
  const { data, error } = await (sb.from('games') as any)
    .update(update)
    .eq('id', copy.id)
    .eq('status', 'backlog')
    .select('id')
  if (error) {
    console.error(`tracker: could not start backlog copy ${copy.id}: ${error.message}`)
    return row
  }
  if (!data || data.length === 0) return row
  return { ...copy, status, steam_appid: copy.steam_appid ?? steamAppId }
}
