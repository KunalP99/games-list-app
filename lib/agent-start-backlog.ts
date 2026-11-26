import 'server-only'
import { backlogCopy, type LibraryRow } from './trackable-row'
import { editionStatus } from './edition'

type Sb = { from: (table: string) => any }

/**
 * When the tracker sees a game whose only copies are untrackable, and one of
 * them is in the Backlog, that copy is moved to Playing and its hours start
 * counting: playing a game you've put in your backlog is starting it. Without
 * this, a Completed copy edited more recently than the Backlog one raised
 * "is this a replay?", and answering it added a further row beside the
 * Backlog copy, which the game page then counted as another playthrough.
 *
 * Moves it only while it's still in the Backlog (compare-and-set), so a
 * change made on the website at the same moment isn't overwritten. Gives it
 * today's start date if it has none, and the running game's Steam app id if
 * it has none, so the next launch matches it directly. Returns the row as it
 * now is, or `row` unchanged when there's nothing to start (or the move lost
 * a race), so the caller answers as it would have.
 */
export async function startBacklogCopy<R extends LibraryRow & { start_date?: string | null }>(
  sb: Sb,
  row: R,
  library: R[],
  steamAppId: number | null = null,
): Promise<R> {
  const copy = backlogCopy(row, library)
  if (!copy) return row
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
