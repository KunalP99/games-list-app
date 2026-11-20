/**
 * Games played in an emulator (the desktop tracker reads the emulator's window
 * title; see `desktop/src-tauri/src/emulators.rs`).
 *
 * One emulator program runs every game, so it can never be linked to a game
 * the way an ordinary exe is. Instead the tracker sends what the emulator is
 * showing, the console, the disc's serial code where it shows one, and the
 * game's name, and `/api/agent/identify`'s `emulator` mode works out the game.
 * What someone picks is remembered per console and serial (or cleaned name)
 * in `emulator_titles` (db/emulator-tracking.sql).
 *
 * Pure: unit tested in lib/__tests__/emulators.test.ts.
 */
import { normaliseTitle } from './search-ranking'

/**
 * The consoles the tracker recognises emulators for, keyed by IGDB platform
 * id. `label` is the site's own platform name (PLATFORM_GROUPS in
 * components/games/PlatformSelect.tsx), stored on a game the tracker adds.
 */
export const EMULATOR_PLATFORMS: Record<number, { label: string }> = {
  7: { label: 'PS1' },
  8: { label: 'PS2' },
  9: { label: 'PS3' },
  38: { label: 'PSP' },
  46: { label: 'PS Vita' },
  48: { label: 'PS4' },
}

export function isEmulatorPlatform(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id in EMULATOR_PLATFORMS
}

/**
 * A PlayStation serial in one canonical form, four letters then five digits
 * ("SLUS20946"), or null when it isn't one. Accepts the ways emulators and
 * disc file names write them: SLUS-20946, SLUS_209.46, SLUS 20946, BLUS30443,
 * ULUS10041, PCSE00000, CUSA00900, NPUB31234.
 */
export function normaliseSerial(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.trim().toUpperCase().match(/^([A-Z]{4})[-_ ]?(\d{3})\.?(\d{2})$/)
  return m ? `${m[1]}${m[2]}${m[3]}` : null
}

/**
 * A game's name as an emulator shows it, made searchable: no trademark marks,
 * no bracketed serial, no "(USA)", "(Disc 1)", "(Rev 1)" or "[!]" tags, and a
 * trailing ", The" moved to the front, as disc databases write "Legend of
 * Dragoon, The".
 */
export function cleanEmulatorTitle(raw: string): string {
  let t = raw.replace(/[®™©]/g, '')
  // Bracketed and parenthesised tags: serials, regions, discs, revisions.
  t = t.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '')
  t = t.replace(/\s+/g, ' ').trim()
  const article = t.match(/^(.*),\s*(The|A|An)$/i)
  if (article) t = `${article[2]} ${article[1]}`
  return t.trim()
}

/**
 * The key a remembered choice is stored under: the serial when there is one
 * (the same disc always has it, however the emulator words the name), else
 * the cleaned name reduced to letters and digits. Null when there's neither.
 */
export function emulatorTitleKey(serial: string | null, title: string | null): string | null {
  if (serial) return `serial:${serial}`
  const name = title ? normaliseTitle(cleanEmulatorTitle(title)) : ''
  return name ? `title:${name}` : null
}

export type EmulatorRequest = { platform: number; serial: string | null; title: string | null; key: string }

/**
 * Reads and checks the `emulator` object a tracker sends ({ platform, serial?,
 * title? }). An error string when it can't be used.
 */
export function parseEmulatorRequest(raw: unknown): EmulatorRequest | string {
  if (!raw || typeof raw !== 'object') return 'emulator must be an object'
  const o = raw as Record<string, unknown>
  if (!isEmulatorPlatform(o.platform)) return 'emulator.platform must be a supported IGDB platform id'
  if (o.title != null && (typeof o.title !== 'string' || o.title.length > 200)) return 'emulator.title must be a short string'
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : null
  const serial = normaliseSerial(o.serial)
  const key = emulatorTitleKey(serial, title)
  if (!key) return 'emulator needs a serial or a title'
  return { platform: o.platform, serial, title, key }
}
