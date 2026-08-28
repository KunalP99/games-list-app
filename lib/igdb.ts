// Server-only IGDB (via Twitch OAuth) provider. Returns the same shapes as
// lib/rawg.ts so it can stand in for RAWG behind the METADATA_PROVIDER flag.
// Auth: client-credentials app token (cached). Requests: POST apicalypse bodies.

import type { RawgSearchResult, RawgGameDetail, RawgScreenshot, RawgAddition, GameCompany, GameExtras, DeveloperGamesInfo, RelatedGame } from './rawg'
import { EMPTY_GAME_EXTRAS } from './rawg'
import { SEARCH_PAGE_SIZE } from './rawg'

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

export async function searchGames(query: string, page = 1): Promise<RawgSearchResult[]> {
  const q = query.replace(/"/g, '\\"')
  const games = await igdbQuery<IgdbGame>('games',
    `search "${q}"; fields ${DETAIL_FIELDS}; limit ${SEARCH_PAGE_SIZE}; offset ${(page - 1) * SEARCH_PAGE_SIZE};`)
  return games.map(g => ({
    id: g.id,
    name: g.name,
    released: releasedFrom(g.first_release_date),
    background_image: heroImage(g),
    cover_image: coverUrl(g.cover?.image_id),
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

// All of a game's landscape images (for the form's image chooser): landscape
// artworks (highest-resolution first — the same order artworkImage() prefers)
// followed by screenshots. De-duped, all at t_1080p so a picked URL matches what
// getGameDetail would store. Returns [] on failure or if the game has none.
export async function getGameImages(id: number): Promise<string[]> {
  const games = await igdbQuery<IgdbGame>('games',
    `fields artworks.image_id, artworks.width, artworks.height, screenshots.image_id; where id = ${id}; limit 1;`)
  const g = games[0]
  if (!g) return []
  const artworks = (g.artworks ?? [])
    .filter(a => a.image_id && a.width && a.height && a.width / a.height >= 1.3)
    .sort((a, b) => (b.width! * b.height!) - (a.width! * a.height!))
    .map(a => bannerUrl(a.image_id!))
  const shots = (g.screenshots ?? [])
    .filter(s => s.image_id)
    .map(s => screenshotUrl(s.image_id!))
  return Array.from(new Set([...artworks, ...shots]))
}

// ── Gaming-industry events (dashboard "Upcoming Events" card) ────────────────
export type IgdbEventNetwork = { type: string; url: string }
export type IgdbEvent = {
  id: number; name: string; startTime: number; endTime: number | null
  liveStreamUrl: string | null; logoUrl: string | null; networks: IgdbEventNetwork[]
}

type IgdbEventRow = {
  id: number; name: string; start_time?: number; end_time?: number; live_stream_url?: string
  event_logo?: { image_id?: string }
  event_networks?: Array<{ url?: string; network_type?: { name?: string } }>
}

// Map event_networks → {type, url}, keeping only valid entries and one per type.
// "Official website" is dropped — the card shows streaming/social links only.
function eventNetworks(raw: IgdbEventRow['event_networks']): IgdbEventNetwork[] {
  const seen = new Set<string>()
  const out: IgdbEventNetwork[] = []
  for (const n of raw ?? []) {
    const type = n.network_type?.name
    if (!type || !n.url || seen.has(type) || type === 'Official website') continue
    seen.add(type)
    out.push({ type, url: n.url })
  }
  return out
}

const EVENT_FIELDS = 'fields name, start_time, end_time, live_stream_url, event_logo.image_id, event_networks.url, event_networks.network_type.name;'

function toEvent(r: IgdbEventRow): IgdbEvent {
  return {
    id: r.id,
    name: r.name,
    startTime: r.start_time!,
    endTime: r.end_time ?? null,
    liveStreamUrl: r.live_stream_url ?? null,
    logoUrl: r.event_logo?.image_id ? bannerUrl(r.event_logo.image_id) : null,
    networks: eventNetworks(r.event_networks),
  }
}

// Up to `limit` events for the dashboard card, prioritising the soonest future
// events (soonest first); if there aren't enough, the remaining slots are filled
// with the most recent past events (so the card always shows `limit` when the
// DB has that many). start_time/end_time are Unix seconds. [] on failure.
export async function getUpcomingEvents(limit = 5): Promise<IgdbEvent[]> {
  const now = Math.floor(Date.now() / 1000)
  const future = await igdbQuery<IgdbEventRow>(
    'events',
    `${EVENT_FIELDS} where start_time > ${now}; sort start_time asc; limit ${limit};`,
  )
  const events = future.filter(r => r.start_time).map(toEvent)
  if (events.length < limit) {
    const past = await igdbQuery<IgdbEventRow>(
      'events',
      `${EVENT_FIELDS} where start_time < ${now}; sort start_time desc; limit ${limit - events.length};`,
    )
    events.push(...past.filter(r => r.start_time).map(toEvent))
  }
  return events.slice(0, limit)
}

// Most anticipated upcoming games — future releases ranked by IGDB hype
// (pre-release excitement). Excludes DLC/editions (game_type 0, no
// version_parent) and cancelled titles. Ordered most-hyped first.
export async function getAnticipatedGames(limit = 12): Promise<RelatedGame[]> {
  const now = Math.floor(Date.now() / 1000)
  const rows = await igdbQuery<{ id: number; name: string; first_release_date?: number; cover?: { image_id?: string }; screenshots?: Array<{ image_id?: string }>; artworks?: Array<{ image_id?: string }>; game_status?: number }>(
    'games',
    `fields name, first_release_date, cover.image_id, screenshots.image_id, artworks.image_id, game_status; where first_release_date > ${now} & hypes > 0 & game_type = 0 & version_parent = null; sort hypes desc; limit ${limit + 8};`)
  return rows
    .filter(g => g.game_status !== 6) // drop cancelled
    .map(g => ({
      id: g.id,
      name: g.name,
      coverUrl: coverUrl(g.cover?.image_id),
      released: releasedFrom(g.first_release_date),
      bannerUrl: heroImage(g), // landscape screenshot → artwork → cover
    }))
    .slice(0, limit)
}

// Company logo — logos are transparent PNGs, so use .png (not .jpg).
function companyLogoUrl(imageId: string | undefined | null): string | null {
  return imageId ? `https://images.igdb.com/igdb/image/upload/t_logo_med/${imageId}.png` : null
}

// Rich "About" metadata: involved companies (with roles + logos) plus a facts
// block (modes, perspectives, themes, franchise, engine, critic score).
export async function getGameExtras(id: number): Promise<GameExtras> {
  type Row = {
    involved_companies?: Array<{
      developer?: boolean; publisher?: boolean; porting?: boolean
      company?: { name?: string; logo?: { image_id?: string } }
    }>
    game_modes?: Array<{ name: string }>
    player_perspectives?: Array<{ name: string }>
    themes?: Array<{ name: string }>
    franchises?: Array<{ name: string }>
    game_engines?: Array<{ name: string }>
    aggregated_rating?: number
    aggregated_rating_count?: number
    rating?: number
    rating_count?: number
  }
  const rows = await igdbQuery<Row>('games',
    `fields involved_companies.developer, involved_companies.publisher, involved_companies.porting, involved_companies.company.name, involved_companies.company.logo.image_id, game_modes.name, player_perspectives.name, themes.name, franchises.name, game_engines.name, aggregated_rating, aggregated_rating_count, rating, rating_count; where id = ${id}; limit 1;`)
  const g = rows[0]
  if (!g) return EMPTY_GAME_EXTRAS

  // Collapse involved_companies → one entry per company, merging its role(s).
  const byName = new Map<string, GameCompany>()
  for (const ic of g.involved_companies ?? []) {
    const name = ic.company?.name
    if (!name) continue
    const roles: string[] = []
    if (ic.developer) roles.push('Developer')
    if (ic.publisher) roles.push('Publisher')
    if (ic.porting) roles.push('Porting')
    // Support (supporting) companies are intentionally not listed.
    if (roles.length === 0) continue
    const existing = byName.get(name)
    if (existing) { for (const r of roles) if (!existing.roles.includes(r)) existing.roles.push(r) }
    else byName.set(name, { name, logoUrl: companyLogoUrl(ic.company?.logo?.image_id), roles })
  }
  // Show a single, most-specific role per company: a company that both
  // publishes and does something more specific (developing/porting) shows the
  // specific role, not "Publisher · Porting".
  const rolePick = ['Developer', 'Porting', 'Publisher']
  const roleSort: Record<string, number> = { Developer: 0, Publisher: 1, Porting: 2 }
  const companies = Array.from(byName.values())
    .map(c => ({ ...c, roles: [rolePick.find(r => c.roles.includes(r)) ?? c.roles[0] ?? 'Involved'] }))
    .sort((a, b) => (roleSort[a.roles[0]] ?? 3) - (roleSort[b.roles[0]] ?? 3))

  return {
    companies,
    gameModes: (g.game_modes ?? []).map(x => x.name),
    playerPerspectives: (g.player_perspectives ?? []).map(x => x.name),
    themes: (g.themes ?? []).map(x => x.name),
    franchise: g.franchises?.[0]?.name ?? null,
    engines: (g.game_engines ?? []).map(x => x.name),
    criticRating: g.aggregated_rating != null ? Math.round(g.aggregated_rating) : null,
    criticRatingCount: g.aggregated_rating_count ?? null,
    userRating: g.rating != null ? Math.round(g.rating) : null,
    userRatingCount: g.rating_count ?? null,
  }
}

// Mainline games by the game's developer. Excludes the game itself, plus DLC,
// expansions, bundles, and alternate editions (game_type = 0 "Main Game" and no
// version_parent). Ordered oldest → newest.
export async function getDeveloperGames(id: number): Promise<DeveloperGamesInfo> {
  const grows = await igdbQuery<{ involved_companies?: Array<{ developer?: boolean; company?: { id: number; name: string } }> }>(
    'games', `fields involved_companies.developer, involved_companies.company.id, involved_companies.company.name; where id = ${id}; limit 1;`)
  const dev = (grows[0]?.involved_companies ?? []).find(ic => ic.developer && ic.company?.id)?.company
  if (!dev) return null

  const games = await igdbQuery<{ id: number; name: string; first_release_date?: number; cover?: { image_id?: string }; game_status?: number }>(
    'games',
    `fields name, first_release_date, cover.image_id, game_status; where involved_companies.company = ${dev.id} & involved_companies.developer = true & game_type = 0 & version_parent = null; sort first_release_date asc; limit 50;`)
  const list = games
    // Drop the current game and any cancelled titles (game_status 6 = Cancelled).
    .filter(g => g.id !== id && g.game_status !== 6)
    .map(g => ({ id: g.id, name: g.name, coverUrl: coverUrl(g.cover?.image_id), released: releasedFrom(g.first_release_date) }))
    // Newest → oldest by release date; undated (unannounced/upcoming) titles go first.
    .sort((a, b) => {
      if (!a.released) return b.released ? -1 : 0
      if (!b.released) return 1
      return b.released.localeCompare(a.released)
    })
  if (list.length === 0) return null
  return { developer: dev.name, games: list }
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
