const RAWG_BASE = 'https://api.rawg.io/api'
// Fail fast if RAWG is slow/down (it returns 522s during outages) so a page
// that awaits a RAWG call doesn't hang ~20s waiting for the socket to time out.
const RAWG_TIMEOUT_MS = 7000

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

export type RawgAchievement = {
  id: number
  name: string
  description: string
  image: string
  percent: string
}

export async function getRawgAchievements(rawgId: number): Promise<RawgAchievement[]> {
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
