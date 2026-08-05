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
}

export type RawgScreenshot = {
  id: number
  image: string
}

export async function searchRawgGames(query: string): Promise<RawgSearchResult[]> {
  if (METADATA_PROVIDER === 'igdb') return (await import('./igdb')).searchGames(query)
  const key = process.env.RAWG_API_KEY
  if (!key) return []
  try {
    const url = `${RAWG_BASE}/games?key=${key}&search=${encodeURIComponent(query)}&page_size=8&search_precise=true`
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
    return await res.json()
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
