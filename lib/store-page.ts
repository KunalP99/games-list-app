/**
 * The game store page (`/discover/<igdbId>`, public edition, FEATURES.gameStore):
 * its data shape and the pure rules that turn IGDB's raw game into what the
 * page shows. Fetched by `getStoreGame` (lib/igdb.ts), cached in
 * lib/data/store-game.ts. Pure, so it's unit tested; safe to import anywhere.
 */

export type StoreRelated = { id: number; name: string; year: number | null; upcoming: boolean }

export type StoreGame = {
  id: number
  name: string
  summary: string | null
  /** Unix seconds. */
  releaseDate: number | null
  criticScore: number | null
  criticCount: number
  playerScore: number | null
  playerCount: number
  developer: string | null
  genres: string[]
  /** Themes and perspective, shown as tags after the genres. */
  tags: string[]
  platforms: string[]
  ageRating: string | null
  players: string | null
  cover: string | null
  /** The best landscape picture (for the library add). */
  banner: string | null
  /** The picture beside the trailer: an artwork that fits a 460×215 box, else a screenshot. */
  capsule: string | null
  screenshots: string[]
  videos: { name: string; youtubeId: string }[]
  storeLinks: { label: string; url: string }[]
  /** Per-platform release dates, for a game that isn't out yet. */
  releaseLines: string[]
  steamAppId: number | null
  /** Expansions and the bigger DLC, listed. */
  dlc: StoreRelated[]
  /** Small DLC (free quests and the like), behind "N more DLC". */
  smallDlc: StoreRelated[]
  editions: StoreRelated[]
}

// ── Videos ──────────────────────────────────────────────────────────────────

/**
 * Which videos to show, best first: a launch trailer, then any other trailer,
 * then the rest (gameplay, cinematics), never dev diaries before trailers.
 * IGDB gives The Witcher 3 seventeen, in no useful order.
 */
export function orderVideos<V extends { name: string }>(videos: V[], limit = 4): V[] {
  const rank = (name: string) => {
    const n = name.toLowerCase()
    if (/launch trailer/.test(n)) return 0
    if (/^trailer$|official trailer|announcement trailer|reveal trailer/.test(n)) return 1
    if (/trailer/.test(n)) return 2
    if (/gameplay/.test(n)) return 3
    if (/diary|interview|behind|making of/.test(n)) return 5
    return 4
  }
  return videos
    .map((v, i) => ({ v, i, r: rank(v.name) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, limit)
    .map(x => x.v)
}

// ── Age rating ──────────────────────────────────────────────────────────────

type RawAgeRating = { organization?: { name?: string } | null; rating_category?: { rating?: string } | null }

/** PEGI for UK users (the site's home), else ESRB; "PEGI 18", "ESRB M". */
export function pickAgeRating(ratings: RawAgeRating[] | undefined): string | null {
  for (const org of ['PEGI', 'ESRB']) {
    const r = (ratings ?? []).find(a => a.organization?.name === org && a.rating_category?.rating)
    if (r) return `${org} ${r.rating_category!.rating}`
  }
  return null
}

// ── Players ─────────────────────────────────────────────────────────────────

type RawMultiplayer = {
  onlinemax?: number; offlinemax?: number; onlinecoopmax?: number; offlinecoopmax?: number
  onlinecoop?: boolean; offlinecoop?: boolean; lancoop?: boolean; campaigncoop?: boolean; splitscreen?: boolean
}

/**
 * One line about who plays: "Single player only", or "1–4 · Online co-op ·
 * Split screen". From IGDB's game modes and multiplayer modes; null when it
 * knows neither.
 */
export function playersLine(modes: string[], multiplayer: RawMultiplayer[] | undefined): string | null {
  const mm = multiplayer ?? []
  const lower = modes.map(m => m.toLowerCase())
  const multi = mm.length > 0 || lower.some(m => /multiplayer|co-operative|mmo|battle royale/.test(m))
  if (!multi) return lower.includes('single player') ? 'Single player only' : null

  const max = Math.max(0, ...mm.flatMap(m => [m.onlinemax ?? 0, m.offlinemax ?? 0, m.onlinecoopmax ?? 0, m.offlinecoopmax ?? 0]))
  const parts: string[] = []
  if (max > 1) parts.push(`1–${max}`)
  if (mm.some(m => m.onlinecoop)) parts.push('Online co-op')
  if (mm.some(m => m.offlinecoop || m.lancoop) && !mm.some(m => m.splitscreen)) parts.push('Local co-op')
  if (mm.some(m => m.splitscreen)) parts.push('Split screen')
  if (lower.includes('massively multiplayer online (mmo)')) parts.push('MMO')
  if (parts.length === 0 || (parts.length === 1 && max > 1)) parts.push('Multiplayer')
  if (lower.includes('single player')) parts.unshift('Single player')
  return parts.join(' · ')
}

// ── Where to buy ────────────────────────────────────────────────────────────

/** IGDB's website types that are shops, in display order, with our label. */
const STORES: [igdbType: string, label: string][] = [
  ['Steam', 'Steam'],
  ['GOG', 'GOG'],
  ['Epic', 'Epic'],
  ['Playstation', 'PlayStation Store'],
  ['Xbox', 'Xbox'],
  ['Nintendo', 'Nintendo eShop'],
  ['Itch', 'itch.io'],
]

/** The game's shop pages from IGDB's websites: known shops only, each once, in a fixed order. */
export function storeLinks(websites: { url?: string; type?: { type?: string } | null }[] | undefined): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = []
  for (const [type, label] of STORES) {
    const site = (websites ?? []).find(w => w.type?.type?.toLowerCase() === type.toLowerCase() && w.url && /^https?:\/\//.test(w.url))
    if (site) out.push({ label, url: site.url!.replace(/^http:/, 'https:') })
  }
  return out
}

// ── Release ─────────────────────────────────────────────────────────────────

export function isUpcoming(releaseDate: number | null, nowMs: number): boolean {
  return releaseDate == null || releaseDate * 1000 > nowMs
}

/**
 * Whether IGDB only knows the year: it stores "sometime in 2027" as 31
 * December 2027. A countdown to that would be a made-up date, so those show
 * "Coming 2027" instead.
 */
export function isYearOnly(releaseDate: number | null): boolean {
  if (releaseDate == null) return false
  const d = new Date(releaseDate * 1000)
  return d.getUTCMonth() === 11 && d.getUTCDate() === 31
}

/** "Out in" for a game not out yet: days and hours, plus minutes on the last day. Null once it's out. */
export function countdown(releaseDate: number | null, nowMs: number): { days: number; hours: number; minutes: number; lastDay: boolean } | null {
  if (releaseDate == null) return null
  const left = releaseDate * 1000 - nowMs
  if (left <= 0) return null
  const minutesLeft = Math.floor(left / 60_000)
  const days = Math.floor(minutesLeft / 1440)
  const hours = Math.floor((minutesLeft % 1440) / 60)
  const minutes = minutesLeft % 60
  return { days, hours, minutes, lastDay: days === 0 }
}

const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/**
 * "PC, PS5: 12 Dec 2026", one line per date, soonest first, for a game not
 * out yet. Dates IGDB only knows to the year (31 Dec placeholders) show the year.
 */
export function releaseLines(dates: { date?: number; platform?: { abbreviation?: string; name?: string } | null }[] | undefined): string[] {
  const byDate = new Map<number, string[]>()
  for (const d of dates ?? []) {
    if (d.date == null) continue
    const p = d.platform?.abbreviation ?? d.platform?.name
    if (!p) continue
    const list = byDate.get(d.date) ?? []
    if (!list.includes(p)) list.push(p)
    byDate.set(d.date, list)
  }
  return [...byDate.entries()].sort((a, b) => a[0] - b[0]).map(([date, platforms]) => {
    const dt = new Date(date * 1000)
    const yearOnly = dt.getUTCMonth() === 11 && dt.getUTCDate() === 31
    return `${platforms.join(', ')}: ${yearOnly ? dt.getUTCFullYear() : dayMonthYear.format(dt)}`
  })
}

// ── DLC and editions ────────────────────────────────────────────────────────

/**
 * Which add-ons get cards and which are summed up in one line. Expansions
 * (IGDB's own word for the big ones: Blood and Wine) always get cards; plain
 * DLC gets cards too when there are only a few, and otherwise one line
 * ("5 free quests") so a pile of small extras doesn't crowd the big ones out.
 */
export function splitAddOns(expansions: StoreRelated[], dlcs: StoreRelated[], maxCardDlc = 3): { cards: StoreRelated[]; small: StoreRelated[] } {
  const byYear = (a: StoreRelated, b: StoreRelated) => (a.year ?? 9999) - (b.year ?? 9999)
  const big = [...expansions].sort(byYear)
  if (dlcs.length <= maxCardDlc) return { cards: [...big, ...[...dlcs].sort(byYear)], small: [] }
  return { cards: big, small: [...dlcs].sort(byYear) }
}

// ── Platforms ───────────────────────────────────────────────────────────────

/** IGDB's platform abbreviations people wouldn't recognise, in plain words. */
const PLATFORM_NAMES: Record<string, string> = {
  XONE: 'Xbox One', 'Series X|S': 'Xbox Series X|S', X360: 'Xbox 360', XBOX: 'Xbox',
  PS1: 'PlayStation', PS2: 'PlayStation 2', PS3: 'PlayStation 3', PS4: 'PlayStation 4', PS5: 'PlayStation 5', PSV: 'PS Vita', PSP: 'PSP',
  Switch: 'Switch', 'Switch 2': 'Switch 2', WiiU: 'Wii U', Mac: 'Mac', Linux: 'Linux', PC: 'PC', iOS: 'iOS', Android: 'Android', Stadia: 'Stadia',
}

/**
 * Platforms in a friendly order (PC first, then newest consoles) with plain
 * names: "PC, PlayStation 5, PlayStation 4, Xbox Series X|S, Xbox One, Switch 2, Switch".
 */
export function platformNames(platforms: { abbreviation?: string; name?: string }[] | undefined): string[] {
  const ORDER = ['PC', 'Mac', 'Linux', 'PS5', 'PS4', 'PS3', 'Series X|S', 'XONE', 'X360', 'Switch 2', 'Switch', 'WiiU', 'iOS', 'Android']
  const rank = (a: string) => { const i = ORDER.indexOf(a); return i === -1 ? ORDER.length : i }
  return (platforms ?? [])
    .map(p => ({ key: p.abbreviation ?? p.name ?? '', name: p.abbreviation ? PLATFORM_NAMES[p.abbreviation] ?? p.name ?? p.abbreviation : p.name ?? '' }))
    .filter(p => p.name)
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map(p => p.name.replace(/^PC \(Microsoft Windows\)$/, 'PC'))
}
