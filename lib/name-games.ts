import { searchRawgGames } from './rawg'

/**
 * Identifying a non-Steam game by its launcher's own display name.
 *
 * Unlike the Steam path (`lib/steam-games.ts`), there is no cross-reference
 * table to look an id up in — Epic, GOG and the rest don't publish one IGDB
 * can key on. The only route is a name search, so this is fuzzier in kind,
 * not just in degree: a search miss proves nothing (IGDB's ranking can simply
 * not surface the right title), so it is never treated as "not a game" and
 * never cached as a negative. A hit is only trusted when the result's name
 * matches *exactly*, once both are reduced to bare lowercase letters and
 * digits — "ABZU" (a launcher's display name) and "Abzu" (IGDB's) normalise
 * to the same string; a loose or partial match does not, and is left for the
 * user to resolve by hand rather than risk filing the wrong game.
 */
export type NameLookup =
  | { kind: 'game'; igdbId: number; name: string }
  // Inconclusive, not negative — never follow this with "don't ask again".
  | { kind: 'noMatch' }

export function normaliseTitle(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export async function findGameByExactName(displayName: string): Promise<NameLookup> {
  const query = displayName.trim()
  if (!query) return { kind: 'noMatch' }

  const target = normaliseTitle(query)
  if (!target) return { kind: 'noMatch' }

  const results = await searchRawgGames(query)
  const hit = results.find(r => normaliseTitle(r.name) === target)
  return hit ? { kind: 'game', igdbId: hit.id, name: hit.name } : { kind: 'noMatch' }
}
