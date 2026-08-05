// Server-only IGDB (via Twitch OAuth) provider. Returns the same shapes as
// lib/rawg.ts so it can stand in for RAWG behind the METADATA_PROVIDER flag.
// Auth: client-credentials app token (cached). Requests: POST apicalypse bodies.

import type { RawgSearchResult, RawgGameDetail, RawgScreenshot, RawgAddition } from './rawg'

const TIMEOUT_MS = 8000

// ── Image URL builders ──────────────────────────────────────────────────────
function coverUrl(imageId: string | undefined | null): string | null {
  // t_cover_big_2x (528×748) — portrait box art; last-resort for the card/hero.
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${imageId}.jpg` : null
}
// Landscape image for the card/hero (matches RAWG's landscape background_image).
function landscapeUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_720p/${imageId}.jpg`
}
// Large landscape key-art banner (IGDB-style game-page hero).
function bannerUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_1080p/${imageId}.jpg`
}
// A landscape artwork for the page banner. Games have artworks in many shapes
// (portrait posters, 16:9 key art, ultra-wide banners) in arbitrary order, so
// keep only landscape ones (ratio ≥ 1.3) and take the highest-resolution — that
// fills a 16:9 hero cleanly. Returns null if none are landscape (→ screenshot).
function artworkImage(g: { artworks?: Array<{ image_id?: string; width?: number; height?: number }> }): string | null {
  const landscape = (g.artworks ?? [])
    .filter(a => a.image_id && a.width && a.height && a.width / a.height >= 1.3)
    .sort((a, b) => (b.width! * b.height!) - (a.width! * a.height!))
  return landscape[0]?.image_id ? bannerUrl(landscape[0].image_id) : null
}
function screenshotUrl(imageId: string): string {
  return `https://images.igdb.com/igdb/image/upload/t_1080p/${imageId}.jpg`
}
// The card/hero image (landscape). Prefer a screenshot (no baked-in title text,
// so it doesn't clash with the title the card overlays), then artwork (key art —
// often has the logo), then the portrait cover as a last resort.
function heroImage(g: { artworks?: Array<{ image_id?: string }>; screenshots?: Array<{ image_id?: string }>; cover?: { image_id?: string } }): string | null {
  const shot = g.screenshots?.find(s => s.image_id)?.image_id
  if (shot) return landscapeUrl(shot)
  const art = g.artworks?.find(a => a.image_id)?.image_id
  if (art) return landscapeUrl(art)
  return coverUrl(g.cover?.image_id)
}
function releasedFrom(ts: number | undefined | null): string | null {
  return ts ? new Date(ts * 1000).toISOString().slice(0, 10) : null
}
type IgdbCompany = { company?: { name?: string }; developer?: boolean }
function developersFrom(ic: IgdbCompany[] | undefined): Array<{ name: string }> {
  return (ic ?? []).filter(c => c.developer && c.company?.name).map(c => ({ name: c.company!.name! }))
}

// ── Auth: cached app access token ───────────────────────────────────────────
let cached: { token: string; expiresAt: number } | null = null

async function getToken(): Promise<string | null> {
  const id = process.env.IGDB_CLIENT_ID
  const secret = process.env.IGDB_CLIENT_SECRET
  if (!id || !secret) return null
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token
  try {
    const res = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${id}&client_secret=${secret}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (!res.ok) return null
    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null
    cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
    return cached.token
  } catch {
    return null
  }
}

// ── Rate limit: IGDB allows 4 requests/second ───────────────────────────────
let lastRequest = 0
async function throttle() {
  const gap = 260 - (Date.now() - lastRequest)
  if (gap > 0) await new Promise(r => setTimeout(r, gap))
  lastRequest = Date.now()
}

// Run an apicalypse query. Returns [] on any failure (mirrors lib/rawg fallback).
async function igdbQuery<T = unknown>(endpoint: string, body: string, retry = true): Promise<T[]> {
  const id = process.env.IGDB_CLIENT_ID
  const token = await getToken()
  if (!id || !token) return []
  try {
    await throttle()
    const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
      method: 'POST',
      headers: { 'Client-ID': id, Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 401 && retry) { cached = null; return igdbQuery<T>(endpoint, body, false) }
    if (!res.ok) return []
    return await res.json() as T[]
  } catch {
    return []
  }
}

const DETAIL_FIELDS = 'name, summary, first_release_date, cover.image_id, artworks.image_id, artworks.width, artworks.height, screenshots.image_id, genres.name, involved_companies.company.name, involved_companies.developer'

type IgdbGame = {
  id: number
  name: string
  summary?: string
  first_release_date?: number
  cover?: { image_id?: string }
  artworks?: Array<{ image_id?: string; width?: number; height?: number }>
  screenshots?: Array<{ image_id?: string }>
  genres?: Array<{ name: string }>
  involved_companies?: IgdbCompany[]
}

// ── Public API (mirrors lib/rawg.ts) ────────────────────────────────────────

export async function searchGames(query: string): Promise<RawgSearchResult[]> {
  const q = query.replace(/"/g, '\\"')
  const games = await igdbQuery<IgdbGame>('games',
    `search "${q}"; fields ${DETAIL_FIELDS}; limit 8;`)
  return games.map(g => ({
    id: g.id,
    name: g.name,
    released: releasedFrom(g.first_release_date),
    background_image: heroImage(g),
    developers: developersFrom(g.involved_companies),
  }))
}

export async function getGameDetail(id: number): Promise<RawgGameDetail | null> {
  const games = await igdbQuery<IgdbGame>('games',
    `fields ${DETAIL_FIELDS}; where id = ${id}; limit 1;`)
  const g = games[0]
  if (!g) return null
  return {
    id: g.id,
    name: g.name,
    description_raw: g.summary ?? null,
    background_image: heroImage(g),
    cover_image: coverUrl(g.cover?.image_id),
    artwork_image: artworkImage(g),
    released: releasedFrom(g.first_release_date),
    developers: developersFrom(g.involved_companies),
    genres: (g.genres ?? []).map(x => ({ name: x.name })),
    dominant_color: null, // IGDB provides no dominant colour
    saturated_color: null,
  }
}

export async function getGameScreenshots(id: number): Promise<RawgScreenshot[]> {
  const shots = await igdbQuery<{ id: number; image_id: string }>('screenshots',
    `fields image_id; where game = ${id}; limit 8;`)
  return shots.map(s => ({ id: s.id, image: screenshotUrl(s.image_id) }))
}

export async function getGameAdditions(id: number): Promise<RawgAddition[]> {
  type Related = { id: number; name: string; first_release_date?: number; cover?: { image_id?: string } }
  const rows = await igdbQuery<{ dlcs?: Related[]; expansions?: Related[] }>('games',
    `fields dlcs.name, dlcs.first_release_date, dlcs.cover.image_id, expansions.name, expansions.first_release_date, expansions.cover.image_id; where id = ${id}; limit 1;`)
  const row = rows[0]
  if (!row) return []
  const all = [...(row.dlcs ?? []), ...(row.expansions ?? [])]
  return all.map(r => ({
    id: r.id,
    name: r.name,
    background_image: coverUrl(r.cover?.image_id),
    released: releasedFrom(r.first_release_date),
  }))
}
