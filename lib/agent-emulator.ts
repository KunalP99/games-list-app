import 'server-only'
import { searchGamesOnPlatform } from './igdb'
import { normaliseTitle } from './search-ranking'
import { cleanEmulatorTitle, EMULATOR_PLATFORMS, type EmulatorRequest } from './emulators'
import { pickRow, resolveRow, isTrackable, type LibraryRow } from './trackable-row'
import { fileTrackerGame } from './agent-file-game'
import { editionStatus } from './edition'
import { startBacklogCopy } from './agent-start-backlog'

/**
 * A game running in an emulator: what `/api/agent/identify` (emulator mode)
 * and `/api/agent/emulator-choice` answer. Rules and the key format live in
 * lib/emulators.ts; remembered answers in `emulator_titles`.
 *
 *   tracked   — in the library as Playing (or Ambient): track it. Marked Emulated.
 *   untracked — in the library but Completed, Dropped or Backlog: the tracker
 *               offers to resume it (`resumable`), as for any other game.
 *   add       — an exact match on that console they don't own: the tracker
 *               asks "Track it?" (`candidates[0]`).
 *   pick      — no exact match: the tracker shows these candidates (up to 3)
 *               plus "None of these".
 *   ignored   — they said "None of these" before: never ask again.
 *   added     — (choice only) filed as Playing, marked Emulated.
 *   unknown   — nothing to go on: decide nothing, try again later.
 *
 * No exe link is ever written: one emulator program runs every game.
 */

type Sb = any
type Candidate = { igdbId: number; name: string; released: string | null; cover: string | null }
export type EmulatorAnswer =
  | { result: 'tracked' | 'untracked' | 'added'; gameId: string; title: string; status: string; resumable: string | null }
  | { result: 'add' | 'pick'; candidates: Candidate[] }
  | { result: 'ignored' | 'unknown' }

async function library(sb: Sb, userId: string): Promise<LibraryRow[]> {
  const { data } = await (sb.from('games') as any)
    .select('id, title, status, igdb_id, rawg_id, steam_appid, start_date')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as LibraryRow[]
}

async function remember(sb: Sb, userId: string, req: EmulatorRequest, gameId: string | null) {
  const { error } = await (sb.from('emulator_titles') as any).upsert(
    { user_id: userId, platform: req.platform, title_key: req.key, game_id: gameId },
    { onConflict: 'user_id,platform,title_key' },
  )
  if (error) console.error(`emulator: could not remember ${req.key}: ${error.message}`)
}

/**
 * The answer for a library row, marking it Emulated when its hours will be
 * tracked. A Backlog copy of an otherwise untrackable game is started first
 * (lib/agent-start-backlog.ts), as for any other running game.
 */
async function answerFor(sb: Sb, owned: LibraryRow, rows: LibraryRow[]): Promise<EmulatorAnswer> {
  const row = await startBacklogCopy(sb, owned, rows)
  const trackable = isTrackable(row)
  if (trackable) {
    await (sb.from('games') as any).update({ is_emulated: true }).eq('id', row.id).eq('is_emulated', false)
  }
  return {
    result: trackable ? 'tracked' : 'untracked',
    gameId: row.id,
    title: row.title,
    status: row.status,
    resumable: trackable ? null : row.status,
  }
}

function ownedRow(rows: LibraryRow[], igdbId: number): LibraryRow | undefined {
  const first = pickRow(rows.filter(g => g.igdb_id === igdbId))
  return first ? resolveRow(first, rows) : undefined
}

function toCandidate(r: { id: number; name: string; released: string | null; cover_image?: string | null }): Candidate {
  return { igdbId: r.id, name: r.name, released: r.released, cover: r.cover_image ?? null }
}

export async function identifyEmulated(sb: Sb, userId: string, req: EmulatorRequest): Promise<EmulatorAnswer> {
  // 1. Asked before?
  const { data: saved } = await (sb.from('emulator_titles') as any)
    .select('game_id')
    .eq('user_id', userId)
    .eq('platform', req.platform)
    .eq('title_key', req.key)
    .maybeSingle()
  if (saved) {
    if (saved.game_id == null) return { result: 'ignored' }
    const rows = await library(sb, userId)
    const row = rows.find(r => r.id === saved.game_id)
    if (row) return answerFor(sb, resolveRow(row, rows), rows)
  }

  // 2. IGDB, on that console only. A serial alone can't be searched.
  if (!req.title) return { result: 'unknown' }
  const name = cleanEmulatorTitle(req.title)
  if (!normaliseTitle(name)) return { result: 'unknown' }
  const results = await searchGamesOnPlatform(name, req.platform, 5)
  if (results.length === 0) return { result: 'unknown' }

  const exact = results.find(r => normaliseTitle(r.name) === normaliseTitle(name))
  if (exact) {
    const rows = await library(sb, userId)
    const row = ownedRow(rows, exact.id)
    if (row) {
      // Certain on both sides, so remembered: the next launch needs no IGDB.
      await remember(sb, userId, req, row.id)
      return answerFor(sb, row, rows)
    }
    return { result: 'add', candidates: [toCandidate(exact)] }
  }
  return { result: 'pick', candidates: results.slice(0, 3).map(toCandidate) }
}

/**
 * What they chose in the tracker's pop-up: a game (`igdbId`, offered as an
 * exact match or picked from the candidates) or "None of these" (null).
 * Remembered either way.
 */
export async function chooseEmulated(
  sb: Sb,
  userId: string,
  req: EmulatorRequest,
  choice: { igdbId: number; title: string } | null,
): Promise<EmulatorAnswer | { error: string }> {
  if (!choice) {
    await remember(sb, userId, req, null)
    return { result: 'ignored' }
  }
  const rows = await library(sb, userId)
  const row = ownedRow(rows, choice.igdbId)
  if (row) {
    await remember(sb, userId, req, row.id)
    return answerFor(sb, row, rows)
  }
  const status = editionStatus('playing')
  const created = await fileTrackerGame(sb, {
    userId,
    igdbId: choice.igdbId,
    fallbackTitle: choice.title,
    status,
    platform: EMULATOR_PLATFORMS[req.platform].label,
    isEmulated: true,
  })
  if ('error' in created) return created
  await remember(sb, userId, req, created.id)
  return { result: 'added', gameId: created.id, title: created.title, status, resumable: null }
}
