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
