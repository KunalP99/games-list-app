/**
 * Which of someone's library rows a running game's hours belong to.
 *
 * One game can own several rows: the Completed story playthrough, an Ambient
 * row for the multiplayer played after it, and later a Playing replay picked
 * by the wheel. Every tracker-facing route (`/api/agent/state`, `/session`,
 * `/identify`) resolves through here so they all agree on one rule:
 *
 *   1. A Playing row wins — the game someone deliberately chose to play now.
 *   2. Then an Ambient row — the ongoing, outside-the-wheel play.
 *   3. Nothing trackable? Then the row matched in the first place (most
 *      recently touched), which is what raises the replay/resume prompt.
 *
 * So a replay takes the hours while it's in progress, and once it's marked
 * Completed the multiplayer goes straight back to the Ambient row — with no
 * prompt and nothing to re-link.
 */

export type LibraryRow = {
  id: string
  title: string
  status: string
  igdb_id?: number | null
  rawg_id?: number | null
  steam_appid?: number | null
}

const PRIORITY: Record<string, number> = { playing: 0, ambient: 1 }

export function isTrackable(row: { status: string }): boolean {
  return row.status === 'playing' || row.status === 'ambient'
}

/**
 * Whether two of one person's rows are the same game: a shared metadata id
 * or Steam app id, or failing those the same title — a replay row and its
 * Completed original always share the title.
 */
export function sameGame(a: LibraryRow, b: LibraryRow): boolean {
  if (a.id === b.id) return true
  if (a.igdb_id != null && a.igdb_id === b.igdb_id) return true
  if (a.rawg_id != null && a.rawg_id === b.rawg_id) return true
  if (a.steam_appid != null && a.steam_appid === b.steam_appid) return true
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
}

/**
 * The row the hours should go to, out of `rows` — all the same game, most
 * recently touched first. Playing, then Ambient, then simply the first.
 */
export function pickRow<R extends LibraryRow>(rows: R[]): R | undefined {
  const trackable = rows.filter(isTrackable)
  if (trackable.length > 0) {
    // Stable sort: within a status, the given (most recent first) order stays.
    return [...trackable].sort((a, b) => PRIORITY[a.status] - PRIORITY[b.status])[0]
  }
  return rows[0]
}

/**
 * Given the row something matched (an exe link, a Steam app id, an IGDB id),
 * the row the hours should actually go to: the best of every row of the same
 * game in `library` (most recently touched first).
 */
export function resolveRow<R extends LibraryRow>(matched: R, library: R[]): R {
  return pickRow([matched, ...library.filter(r => r.id !== matched.id && sameGame(r, matched))]
    // Keep the library's recency order rather than always putting `matched` first.
    .sort((a, b) => indexIn(library, a) - indexIn(library, b))) ?? matched
}

function indexIn(library: LibraryRow[], row: LibraryRow): number {
  const i = library.findIndex(r => r.id === row.id)
  return i === -1 ? Number.MAX_SAFE_INTEGER : i
}

/**
 * The library rows whose IGDB game is one of `ids` (another edition of the
 * running game, from `getEditionFamily`), most recently touched first as
 * given. Rows with no IGDB id never match.
 */
export function rowsWithIgdbIds<R extends LibraryRow>(library: R[], ids: number[]): R[] {
  const wanted = new Set(ids)
  return library.filter(r => r.igdb_id != null && wanted.has(r.igdb_id))
}

/**
 * The Backlog copy to start, when a running game has no Playing or Ambient
 * row: the most recently touched Backlog row of the same game in `library`
 * (most recently touched first), or none. Someone who puts a game in their
 * backlog and then plays it is playing that copy, so the tracker moves it to
 * Playing rather than asking "is this a replay?" of an older Completed copy
 * and adding another row beside it.
 */
export function backlogCopy<R extends LibraryRow>(row: R, library: R[]): R | undefined {
  if (isTrackable(row)) return undefined
  if (row.status === 'backlog') return row
  return library.find(r => r.status === 'backlog' && sameGame(r, row))
}
