/**
 * The master list of detectable games — pure logic, no database or network.
 *
 * The list is seeded from Discord's own game-detection list
 * (`https://discord.com/api/v9/applications/detectable`, undocumented) and
 * topped up by admin-approved rows. Each row is a *path ending* such as
 * `tunic/tunic.exe`, matched against the end of a running program's full
 * path on the user's PC. Bare exe names are not enough on their own:
 * `game.exe` belongs to 192 different games in that list, so the folder is
 * what tells them apart.
 *
 * Plan and background: reviews/master-list-plan.md.
 */

/** One row bound for `detectable_games`, before it has an id. */
export type DetectableRow = {
  path_suffix: string
  name: string
  steam_appid: number | null
  discord_id: string
}

export type ParseResult =
  | { ok: true; rows: DetectableRow[]; entriesSeen: number; skipped: number }
  | { ok: false; reason: string }

/**
 * Lowercase, forward slashes, no leading/trailing slashes or empty segments.
 * Returns '' for anything that isn't a usable ending.
 */
export function normaliseSuffix(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\\/g, '/')
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .join('/')
}

/** The last segment of a path ending — what the tracker indexes rows by. */
export function basename(suffix: string): string {
  const i = suffix.lastIndexOf('/')
  return i === -1 ? suffix : suffix.slice(i + 1)
}

function steamIdOf(skus: unknown): number | null {
  if (!Array.isArray(skus)) return null
  for (const sku of skus) {
    if (sku?.distributor !== 'steam') continue
    const id = typeof sku.id === 'string' ? sku.id : typeof sku.id === 'number' ? String(sku.id) : ''
    if (/^\d+$/.test(id) && Number(id) > 0 && Number(id) <= 2_147_483_647) return Number(id)
  }
  return null
}

/**
 * Turn Discord's list into master-list rows.
 *
 * Rejects the *whole* list if its shape is wrong — a half-understood list is
 * worse than last week's, which stays in place (see the cron route).
 *
 * Kept: Windows executables that aren't launchers. Skipped: `>`-prefixed
 * names and rows with required `arguments` — shared engine binaries like
 * `hl2.exe` and `javaw.exe`, where the exe says nothing about which game it is.
 *
 * Ambiguity: if two *different* entries produce the same path ending, both
 * are dropped. Guessing between two games is worse than not knowing.
 */
export function parseDiscordList(json: unknown): ParseResult {
  if (!Array.isArray(json)) return { ok: false, reason: 'not an array' }

  const owners = new Map<string, DetectableRow>()
  const ambiguous = new Set<string>()
  let skipped = 0

  for (const entry of json) {
    if (
      typeof entry?.id !== 'string' || !entry.id ||
      typeof entry?.name !== 'string' || !entry.name.trim() ||
      (entry.executables != null && !Array.isArray(entry.executables))
    ) {
      return { ok: false, reason: `malformed entry ${JSON.stringify(entry?.id ?? null)}` }
    }

    const steamAppId = steamIdOf(entry.third_party_skus)
    for (const exe of entry.executables ?? []) {
      if (exe?.os !== 'win32' || exe.is_launcher === true) continue
      if (typeof exe.name !== 'string') continue
      if (exe.name.startsWith('>') || exe.arguments) { skipped++; continue }

      const suffix = normaliseSuffix(exe.name)
      if (!suffix) { skipped++; continue }
      if (ambiguous.has(suffix)) { skipped++; continue }

      const owner = owners.get(suffix)
      if (owner && owner.discord_id !== entry.id) {
        owners.delete(suffix)
        ambiguous.add(suffix)
        skipped += 2
        continue
      }
      owners.set(suffix, {
        path_suffix: suffix,
        name: entry.name.trim(),
        steam_appid: steamAppId,
        discord_id: entry.id,
      })
    }
  }

  return { ok: true, rows: Array.from(owners.values()), entriesSeen: json.length, skipped }
}

/** Fewer rows than this and the list is assumed broken, not shrunk. */
export const MIN_IMPORT_ROWS = 5000
/** A fresh list must keep at least this share of the last applied one. */
export const MIN_IMPORT_RATIO = 0.8

/**
 * Should a freshly parsed list replace the stored one? `lastApplied` is the
 * row count of the last *applied* import, or null for the very first.
 */
export function sanityCheck(rowCount: number, lastApplied: number | null): { ok: true } | { ok: false; reason: string } {
  if (rowCount < MIN_IMPORT_ROWS) {
    return { ok: false, reason: `only ${rowCount} rows (minimum ${MIN_IMPORT_ROWS})` }
  }
  if (lastApplied != null && rowCount < lastApplied * MIN_IMPORT_RATIO) {
    return { ok: false, reason: `${rowCount} rows is under ${MIN_IMPORT_RATIO * 100}% of the last import (${lastApplied})` }
  }
  return { ok: true }
}

/**
 * The compact list sent to every tracker: `[path_suffix, row id]` pairs.
 * Where an admin row and a Discord row share an ending, the admin row wins.
 */
export function compactList(rows: { id: number; path_suffix: string; source: string }[]): [string, number][] {
  const bySuffix = new Map<string, { id: number; admin: boolean }>()
  for (const r of rows) {
    const admin = r.source === 'admin'
    const existing = bySuffix.get(r.path_suffix)
    if (existing && (existing.admin || !admin)) continue
    bySuffix.set(r.path_suffix, { id: r.id, admin })
  }
  return Array.from(bySuffix.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([suffix, { id }]) => [suffix, id])
}

/** Folder names that say nothing about which game they belong to. */
export const GENERIC_FOLDERS = ['bin', 'binaries', 'win64', 'win32', 'x64', 'x86', 'release', 'retail', 'content'] as const

/** Most segments a user-submitted or admin-entered ending may have. */
export const MAX_SUFFIX_SEGMENTS = 3

/**
 * Validate a path ending that came from a user's tracker or an admin's form.
 * Stricter than Discord's own rows: at most three segments, ends in `.exe`,
 * and nothing that looks like a drive or a user's home folder — the full
 * path is meant to stay on the PC, so anything carrying one is refused
 * rather than trimmed. Returns the normalised ending, or null.
 */
export function cleanSubmittedSuffix(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 260) return null
  const suffix = normaliseSuffix(raw)
  if (!suffix || !suffix.endsWith('.exe')) return null
  const segments = suffix.split('/')
  if (segments.length > MAX_SUFFIX_SEGMENTS) return null
  if (segments.some(s => /^[a-z]:$/.test(s) || s === 'users' || s === '..' || s === '.')) return null
  return suffix
}

/**
 * Would a tracker already recognise this program from the master list? True
 * when any tail of the submitted ending is on it — the tracker matches list
 * endings against the end of the full path, and the submitted ending *is*
 * the end of that path. (A list ending longer than the submitted one might
 * match too; that can't be told from here, so it counts as not covered and
 * an admin sees it.)
 */
export function isCovered(suffix: string, listed: Set<string>): boolean {
  const segments = suffix.split('/')
  for (let i = 0; i < segments.length; i++) {
    if (listed.has(segments.slice(i).join('/'))) return true
  }
  return false
}

type GameKeyed ={ path_suffix: string; source: string; discord_id: string | null; igdb_id: number | null }

/**
 * For older trackers that only send a bare exe name: the row with that
 * basename, or null when there are none or they point at different games
 * (the name alone can't say which). Several endings for the *same* game —
 * WoW's `_retail_/wow.exe` and `_ptr_/wow.exe` — are one answer, not a clash.
 * An admin row is preferred when there is one.
 */
export function uniqueByBasename<T extends GameKeyed>(rows: T[], exeName: string): T | null {
  const name = exeName.toLowerCase()
  const hits = rows.filter(r => basename(r.path_suffix) === name)
  if (hits.length === 0) return null
  const games = new Set(hits.map(r => r.igdb_id != null ? `igdb:${r.igdb_id}` : `discord:${r.discord_id}`))
  if (games.size !== 1) return null
  return hits.find(r => r.source === 'admin') ?? hits[0]
}
