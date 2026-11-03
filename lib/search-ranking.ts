/**
 * Ordering game search results the way a person means them.
 *
 * IGDB's own full-text search ranks on text relevance alone, so "Cyber"
 * happily puts an obscure DLC or a bundle ahead of Cyberpunk 2077, and an
 * exact title can be buried below its own expansions. This re-ranks a pool of
 * candidates (gathered by `searchGames` in `lib/igdb.ts`) into groups, best
 * first:
 *
 *   0. Exact title, full game    — "World of Warcraft" for "world of warcraft"
 *   1. Exact title, anything else — searching a DLC by its full name still
 *                                   finds that DLC first
 *   2. Full game whose words match the query — every query word starts a word
 *                                   of the title, so "Cyber" → "Cyberpunk 2077"
 *                                   and "witcher 3" → "The Witcher 3: Wild Hunt"
 *   3. Full game IGDB matched some other way (an alternative name, say)
 *   4. Everything else — DLC, expansions, bundles, packs, alternate editions
 *
 * Within a group, most popular first (rating count, plus hype for games not
 * out yet), and IGDB's own order breaks any remaining tie.
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

function group(c: RankCandidate, target: string, queryWords: string[]): number {
  const full = isFullGame(c)
  if (target && normaliseTitle(c.name) === target) return full ? 0 : 1
  if (!full) return 4
  return wordsMatch(queryWords, c.name) ? 2 : 3
}

/**
 * Higher is more popular. Only compared within one group, never across.
 *
 * `total_rating_count` — how many people/critics rated it on IGDB. Big for
 *   established games (Cyberpunk 2077 is in the thousands), 0 for new ones.
 * `hypes` — how many people follow it before release. The only signal an
 *   unreleased game has, and it stops growing once the game is out.
 */
function popularity(c: RankCandidate): number {
  // TODO(human): combine total_rating_count and hypes into one score.
  // Placeholder: ratings alone, so the file works until this is decided.
  return c.total_rating_count ?? 0
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
    .map((c, index) => ({ c, index, group: group(c, target, queryWords), pop: popularity(c) }))
    .sort((a, b) => a.group - b.group || b.pop - a.pop || a.index - b.index)
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
