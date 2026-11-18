// Server-side parsing of the game form's numbers and hidden JSON fields.
//
// Server Actions are callable directly, with any payload, so nothing the form
// itself enforces (min/max on an input, a well-formed hidden field) can be
// relied on here. These are the checks that actually hold.

/**
 * The most hours a game can hold: the column's own limit (`numeric(6,1)`).
 * Deliberately not lower: people genuinely have 10,000+ hours in some games.
 * Checked here only so a bigger number gets a clear message rather than a raw
 * database error. Typed-in hours earning tickets is a separate question
 * (tracked-hours tickets, code review batch 3), not something a cap solves.
 */
export const MAX_HOURS_PLAYED = 99_999.9

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function blank(raw: unknown): boolean {
  return raw == null || (typeof raw === 'string' && raw.trim() === '')
}

/** Hours played: blank → null; otherwise 0–MAX_HOURS_PLAYED, to 0.1h like the column. */
export function parseHours(raw: unknown): Parsed<number | null> {
  if (blank(raw)) return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Hours played must be a number of 0 or more.' }
  if (n > MAX_HOURS_PLAYED) {
    return { ok: false, error: `Hours played can't be more than ${MAX_HOURS_PLAYED.toLocaleString('en-GB')}.` }
  }
  return { ok: true, value: Math.round(n * 10) / 10 }
}

/** Achievement progress: blank → null; otherwise a percentage, 0–100. */
export function parseAchievementProgress(raw: unknown): Parsed<number | null> {
  if (blank(raw)) return { ok: true, value: null }
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { ok: false, error: 'Achievement progress must be between 0 and 100.' }
  }
  return { ok: true, value: n }
}

/** JSON from a hidden form field; anything unparseable is treated as empty. */
function jsonArray(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const MAX_ITEMS = 500
const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, max) : null

export type DlcEntry = { name: string; rawg_id: number | null; owned: boolean; removed?: boolean }

/** The game form's `dlc` field. Malformed entries are dropped, never stored. */
export function parseDlc(raw: unknown): DlcEntry[] {
  const out: DlcEntry[] = []
  for (const item of jsonArray(raw).slice(0, MAX_ITEMS)) {
    if (typeof item !== 'object' || item === null) continue
    const d = item as Record<string, unknown>
    const name = str(d.name, 200)
    if (!name) continue
    const rawgId = typeof d.rawg_id === 'number' && Number.isInteger(d.rawg_id) && d.rawg_id > 0 ? d.rawg_id : null
    out.push({ name, rawg_id: rawgId, owned: d.owned === true, ...(d.removed === true ? { removed: true } : {}) })
  }
  return out
}

export type GameVideo = { youtube_id: string; title: string; author_name: string | null; thumbnail_url: string | null }

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** Only https image addresses are kept; they are shown to everyone who views the game. */
function httpsUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    return new URL(v).protocol === 'https:' ? v : null
  } catch {
    return null
  }
}

/** The game form's `youtube_videos` field. Entries without a real video id are dropped. */
export function parseYoutubeVideos(raw: unknown): GameVideo[] {
  const out: GameVideo[] = []
  for (const item of jsonArray(raw).slice(0, MAX_ITEMS)) {
    if (typeof item !== 'object' || item === null) continue
    const v = item as Record<string, unknown>
    if (typeof v.youtube_id !== 'string' || !YOUTUBE_ID.test(v.youtube_id)) continue
    out.push({
      youtube_id: v.youtube_id,
      title: str(v.title, 300) ?? 'YouTube video',
      author_name: str(v.author_name, 200),
      thumbnail_url: httpsUrl(v.thumbnail_url),
    })
  }
  return out
}

/** A JSON list of short strings (e.g. genres). */
export function parseStringList(raw: unknown, maxItems = 50): string[] {
  const out: string[] = []
  for (const item of jsonArray(raw).slice(0, maxItems)) {
    const s = str(item, 100)
    if (s) out.push(s)
  }
  return out
}
