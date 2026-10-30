import { gameFromSteamAppId } from './igdb'

/**
 * What a Steam app id turns out to be.
 *
 * `notAGame` is a real, useful answer rather than a failure: Blender,
 * Wallpaper Engine and the Steamworks redistributables all live in a Steam
 * library and load the same graphics runtimes as games, so nothing about the
 * process itself separates them. IGDB not having them does.
 */
export type SteamLookup =
  | { kind: 'game'; igdbId: number; name: string }
  | { kind: 'notAGame' }
  | { kind: 'unknown' }

/** A cached row, re-checked occasionally in case IGDB has since added it. */
const NEGATIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export function isStale(checkedAt: string | null | undefined, nowMs: number): boolean {
  if (!checkedAt) return true
  const t = Date.parse(checkedAt)
  if (Number.isNaN(t)) return true
  return nowMs - t > NEGATIVE_TTL_MS
}

/**
 * Decide what to do with a cached row, before any network call.
 *
 * Pure so the rules are testable without a database: a known game is used
 * forever (a Steam app does not become a different game), while a "not a game"
 * is only trusted for a month — IGDB adds titles all the time, and a game that
 * was missing on release would otherwise be written off permanently.
 */
export function fromCache(
  row: { igdb_id: number | null; name: string | null; checked_at: string | null } | null,
  nowMs: number,
): SteamLookup | null {
  if (!row) return null
  if (row.igdb_id != null) return { kind: 'game', igdbId: row.igdb_id, name: row.name ?? '' }
  return isStale(row.checked_at, nowMs) ? null : { kind: 'notAGame' }
}

/**
 * Resolve a Steam app id to its IGDB game, through the shared cache.
 *
 * The cache is deliberately not per-user: a Steam app is the same game for
 * everybody, so the first person to launch something spares everyone else the
 * lookup. IGDB allows four requests a second, which this keeps well clear of.
 *
 * `sb` must be a service-role client — `steam_game_ids` is readable by any
 * signed-in user but written only by this path.
 */
export async function resolveSteamApp(
  sb: {
    from: (t: string) => any
  },
  appId: number,
  nowMs: number = Date.now(),
): Promise<SteamLookup> {
  if (!Number.isInteger(appId) || appId <= 0) return { kind: 'unknown' }

  const { data: row } = await sb
    .from('steam_game_ids')
    .select('igdb_id, name, checked_at')
    .eq('steam_appid', appId)
    .maybeSingle()

  const cached = fromCache(row ?? null, nowMs)
  if (cached) return cached

  const { ok, game } = await gameFromSteamAppId(appId)
  // A failed request is never written: caching it would turn one bad minute
  // into a permanent "not a game" for a real title.
  if (!ok) return { kind: 'unknown' }

  await sb.from('steam_game_ids').upsert({
    steam_appid: appId,
    igdb_id: game?.id ?? null,
    name: game?.name ?? null,
    checked_at: new Date(nowMs).toISOString(),
  }, { onConflict: 'steam_appid' })

  return game ? { kind: 'game', igdbId: game.id, name: game.name } : { kind: 'notAGame' }
}
