/**
 * Ordering game search results the way a person means them.
 *
 * IGDB's own full-text search ranks on text relevance alone, so "Cyber"
 * happily puts an obscure DLC or a bundle ahead of Cyberpunk 2077, and an
 * exact title can be buried below its own expansions. This re-ranks a pool of
 * candidates (gathered by `searchGames` in `lib/igdb.ts`) the way store
 * searches (Steam, Epic…) behave: text match decides *whether* something is a
 * contender, popularity decides the order among contenders.
 *
 * Two groups, best first:
 *
 *   0. Titles the query matches — exact, or every query word starts a word of
 *      the title, so "Cyber" → "Cyberpunk 2077", "witcher 3" → "The Witcher 3"
 *   1. Everything else IGDB returned (matched on an alternative name, say)
 *
 * Within a group, highest `score` first: popularity on a log scale, so each
 * ×10 in popularity is worth one point, plus a point for an exact title and
 * minus a point for an add-on (DLC, bundle, edition…). An exact title therefore
 * beats anything less than ten times as popular — "World of Warcraft" stays
 * above "World of Warcraft Classic" — but an obscure game that happens to be
 * called "Cyber" no longer outranks Cyberpunk 2077. IGDB's own order breaks
 * any remaining tie.
 *
 * Pure: no IGDB access here, so every case is a unit test.
 */

/** Reduce a title to bare lowercase letters and digits, for exact comparison. */
export function normaliseTitle(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function words(raw: string): string[] {
  return raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * IGDB `game_type` ids that are a complete game in their own right, as
 * opposed to an add-on to one. Ids per IGDB's `game_types` endpoint:
 * 0 main game, 4 standalone expansion, 8 remake, 9 remaster, 10 expanded game.
 * Left out on purpose: 1 DLC, 2 expansion, 3 bundle, 5 mod, 6 episode,
 * 7 season, 11 port, 12 fork, 13 pack, 14 update.
 */
export const FULL_GAME_TYPES = [0, 4, 8, 9, 10] as const

export type RankCandidate = {
  name: string
  /** IGDB `game_type` id. Absent means unknown, and is not held against it. */
  game_type?: number | null
  /** Set when this is an alternate edition of another game (GOTY, Deluxe…). */
  version_parent?: number | null
  total_rating_count?: number | null
  hypes?: number | null
}

export function isFullGame(c: RankCandidate): boolean {
  if (c.version_parent != null) return false
  if (c.game_type == null) return true
  return (FULL_GAME_TYPES as readonly number[]).includes(c.game_type)
}

/** Every query word is the start of some word in the title. */
function wordsMatch(queryWords: string[], name: string): boolean {
  if (queryWords.length === 0) return false
  const nameWords = words(name)
  return queryWords.every(q => nameWords.some(n => n.startsWith(q)))
}

/** Worth one ×10 step of popularity each — see the header comment. */
const EXACT_TITLE_BONUS = 1
const ADD_ON_PENALTY = 1

/**
 * Popularity on a log scale, nudged by exactness and game type. Only compared
 * within one group, never across.
 */
export function score(c: RankCandidate, exact: boolean): number {
  return Math.log10(popularity(c) + 1)
    + (exact ? EXACT_TITLE_BONUS : 0)
    - (isFullGame(c) ? 0 : ADD_ON_PENALTY)
}

/**
 * Higher is more popular. Only compared within one group, never across.
 *
 * `total_rating_count` — how many people/critics rated it on IGDB. Big for
 *   established games (Cyberpunk 2077 is in the thousands), 0 for new ones.
 * `hypes` — how many people follow it before release. The only signal an
 *   unreleased game has, and it stops growing once the game is out.
 *
 * Summed: both count people paying attention to a game, and each covers the
 * other's blind spot. Ratings alone scored every unreleased game 0, sinking a
 * heavily anticipated title below any obscure released one; hype alone ignores
 * everything that has shipped. A released game keeps its pre-launch hype, which
 * is fair — it was real interest — and is small next to its ratings anyway.
 */
export function popularity(c: RankCandidate): number {
  return (c.total_rating_count ?? 0) + (c.hypes ?? 0)
}

/**
 * Re-rank candidates for `query`. Input order is treated as IGDB's own
 * relevance order and only used as the final tie-break. Does not drop or
 * dedupe anything — see `mergeById` for combining several result sets.
 */
export function rankSearchResults<T extends RankCandidate>(query: string, candidates: T[]): T[] {
  const target = normaliseTitle(query)
  const queryWords = words(query)
  return candidates
    .map((c, index) => {
      const exact = target !== '' && normaliseTitle(c.name) === target
      const group = exact || wordsMatch(queryWords, c.name) ? 0 : 1
      return { c, index, group, score: score(c, exact) }
    })
    .sort((a, b) => a.group - b.group || b.score - a.score || a.index - b.index)
    .map(x => x.c)
}

/** Concatenate result sets, keeping the first occurrence of each id. */
export function mergeById<T extends { id: number }>(...sets: T[][]): T[] {
  const seen = new Set<number>()
  const out: T[] = []
  for (const set of sets) {
    for (const item of set) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

/** Escape a string for use inside an apicalypse double-quoted literal. */
export function apicalypseString(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
