const RAWG_BASE = 'https://api.rawg.io/api'
// Fail fast if RAWG is slow/down (it returns 522s during outages) so a page
// that awaits a RAWG call doesn't hang ~20s waiting for the socket to time out.
const RAWG_TIMEOUT_MS = 7000

// Active game-metadata provider. IGDB stands in for RAWG (same return shapes)
// behind this flag; existing RAWG-linked games keep working when it's 'rawg'.
export const METADATA_PROVIDER: 'rawg' | 'igdb' = process.env.METADATA_PROVIDER === 'igdb' ? 'igdb' : 'rawg'
// The games column holding the active provider's id.
export const PROVIDER_ID_COLUMN: 'rawg_id' | 'igdb_id' = METADATA_PROVIDER === 'igdb' ? 'igdb_id' : 'rawg_id'
// The active provider's stored id for a game.
export function providerIdOf(game: { rawg_id?: number | null; igdb_id?: number | null }): number | null {
  return METADATA_PROVIDER === 'igdb' ? (game.igdb_id ?? null) : (game.rawg_id ?? null)
}

export type RawgSearchResult = {
  id: number
  name: string
  released: string | null
  background_image: string | null
  cover_image?: string | null // portrait box art (IGDB); may be absent for RAWG
  developers?: Array<{ name: string }>
}

export type RawgGameDetail = {
  id: number
  name: string
  description_raw: string | null
  background_image: string | null
  cover_image: string | null // portrait box art (IGDB); null for RAWG
  artwork_image: string | null // landscape key-art banner (IGDB); null for RAWG
  released: string | null
  developers: Array<{ name: string }>
  genres: Array<{ name: string }>
  dominant_color: string | null
  saturated_color: string | null
  // Steam app id, from IGDB's external_games, so the desktop agent can match a
  // running Steam game without an API call per check. Carried on the detail
  // every add/edit path already fetches, rather than in a query of its own —
  // it costs no extra IGDB round-trip, the same reasoning as GameExtras below.
  // Null for games with no Steam release, and always null on the RAWG path.
  steam_app_id: number | null
}

export type RawgScreenshot = {
  id: number
  image: string
}

// Results per search page (shared by the API route so it can report `hasMore`).
export const SEARCH_PAGE_SIZE = 12

export async function searchRawgGames(query: string, page = 1): Promise<RawgSearchResult[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).searchGames(query, page)
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  try {
    const url = `${RAWG_BASE}/games?key=${key}&search=${encodeURIComponent(query)}&page_size=${SEARCH_PAGE_SIZE}&page=${page}&search_precise=true`
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(RAWG_TIMEOUT_MS) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

export async function getRawgGameDetail(rawgId: number): Promise<RawgGameDetail | null> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getGameDetail(rawgId)
  const key = process.env.RAWG_API_KEY
  if (!key) return null
  try {
    const url = `${RAWG_BASE}/games/${rawgId}?key=${key}`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(RAWG_TIMEOUT_MS) })
    if (!res.ok) return null
    // RAWG carries no Steam cross-reference. Spelled out rather than left
    // undefined, so callers can read the field without a guard.
    return { ...(await res.json()), steam_app_id: null }
  } catch {
    return null
  }
}

export async function getRawgScreenshots(rawgId: number): Promise<RawgScreenshot[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getGameScreenshots(rawgId)
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  try {
    const url = `${RAWG_BASE}/games/${rawgId}/screenshots?key=${key}&page_size=8`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(RAWG_TIMEOUT_MS) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

// Landscape images (artworks + screenshots) a user can pick from as a game's
// banner in the add/edit form. IGDB has artworks; RAWG only has screenshots.
export async function getGameImages(id: number): Promise<string[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getGameImages(id)
  const shots = await getRawgScreenshots(id)
  return shots.map(s => s.image)
}

export type RawgAchievement = {
  id: number
  name: string
  description: string
  image: string
  percent: string
}

export async function getRawgAchievements(rawgId: number): Promise<RawgAchievement[]> {
  if (METADATA_PROVIDER === 'igdb') return [] // IGDB has no achievement data
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  try {
    const url = `${RAWG_BASE}/games/${rawgId}/achievements?key=${key}&page_size=50`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(RAWG_TIMEOUT_MS) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}

// Rich "About" metadata for the game detail page (companies + a facts block).
export type GameCompany = { name: string; logoUrl: string | null; roles: string[] }
export type GameExtras = {
  companies: GameCompany[]
  gameModes: string[]
  playerPerspectives: string[]
  themes: string[]
  franchise: string | null
  engines: string[]
  criticRating: number | null
  criticRatingCount: number | null
  userRating: number | null       // IGDB community score (%)
  userRatingCount: number | null  // number of users who rated
  // Steam app id, from IGDB's external_games. Carried here rather than fetched
  // separately because the extras query already hits the games endpoint, so it
  // costs no extra IGDB round-trip (and they're throttled to 4/sec). Null for
  // games with no Steam release, and always null on the RAWG path.
  steamAppId: number | null
}

export const EMPTY_GAME_EXTRAS: GameExtras = {
  companies: [], gameModes: [], playerPerspectives: [], themes: [],
  franchise: null, engines: [], criticRating: null, criticRatingCount: null,
  userRating: null, userRatingCount: null, steamAppId: null,
}

// IGDB has involved-company roles + logos and the facts block; RAWG does not,
// so it returns the empty shape (matches the getRawgAchievements pattern).
export async function getGameExtras(id: number): Promise<GameExtras> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getGameExtras(id)
  return EMPTY_GAME_EXTRAS
}

// Mainline games by a game's developer (for the detail page's "More from …" section).
// `bannerUrl` is an optional landscape hero image (used by the anticipated-games carousel).
export type RelatedGame = { id: number; name: string; coverUrl: string | null; released: string | null; bannerUrl?: string | null }
export type DeveloperGamesInfo = { developer: string; games: RelatedGame[] } | null

// IGDB-only (RAWG lacks the involved-company graph). Returns null when there's
// no developer or no other mainline games by them.
export async function getDeveloperGames(id: number): Promise<DeveloperGamesInfo> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getDeveloperGames(id)
  return null
}

// Most anticipated upcoming games (IGDB hype). IGDB-only; RAWG returns [].
export async function getAnticipatedGames(limit = 12): Promise<RelatedGame[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getAnticipatedGames(limit)
  return []
}

export type RawgAddition = {
  id: number
  name: string
  background_image: string | null
  released: string | null
}

export async function getRawgAdditions(rawgId: number): Promise<RawgAddition[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).getGameAdditions(rawgId)
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  try {
    const url = `${RAWG_BASE}/games/${rawgId}/additions?key=${key}&page_size=50`
    const res = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(RAWG_TIMEOUT_MS) })
    if (!res.ok) return []
    const data = await res.json()
    return data.results ?? []
  } catch {
    return []
  }
}
