import { sameGame, type LibraryRow } from './trackable-row'

export type ReplayCandidate = LibraryRow & { completion_date: string | null }

/**
 * Whether `game`, just marked Completed, is a replay: another Completed copy
 * of the same game (`sameGame`: a shared metadata or Steam id, or the title)
 * was finished on or before it. A copy finished with no date counts as
 * earlier, as does any copy when `game` itself has no date: either way the
 * game has now been finished twice, and this is the second time recorded.
 * Ramin's case: Mount & Blade II finished in 2021, then a later Ambient run
 * set to Completed is certainly a replay.
 */
export function finishedBefore(game: ReplayCandidate, library: ReplayCandidate[]): boolean {
  return library.some(other =>
    other.id !== game.id
    && other.status === 'completed'
    && sameGame(other, game)
    && (other.completion_date == null || game.completion_date == null || other.completion_date <= game.completion_date))
}

export type PlaythroughCopy = {
  id: string
  status: string
  completion_date: string | null
  start_date: string | null
  created_at: string
}

/**
 * One person's copies of a game in the order they were played, for the game
 * page's "Playthrough N of M". Finished runs (Completed or Dropped, with a
 * date) come first, by that date; then the rest (being played, in the
 * Backlog, or finished with no date), by when they were started, else when
 * they were added. Not simply by when each copy was added: an import can add
 * a newer run a few seconds before an older one, which numbered a 2025 replay
 * "Playthrough 1" and the 2020 original "Playthrough 2".
 */
export function playthroughOrder<C extends PlaythroughCopy>(copies: C[]): C[] {
  const finished = (c: C) => (c.status === 'completed' || c.status === 'dnf') && c.completion_date != null
  const key = (c: C): [number, string, string] => finished(c)
    ? [0, c.completion_date!, c.created_at]
    : [1, c.start_date ?? '9999-12-31', c.created_at]
  return [...copies].sort((a, b) => {
    const [ga, da, ca] = key(a)
    const [gb, db, cb] = key(b)
    return ga - gb || da.localeCompare(db) || ca.localeCompare(cb)
  })
}
