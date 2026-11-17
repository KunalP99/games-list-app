/**
 * Executable links — "this program is that game" (`game_executables`) — one
 * per exe name *per folder*, so two games sharing a program name can each
 * have their own: WoW Retail and WoW Forever both run `Wow.exe`, from
 * `_retail_\` and `_forever_\`. `path_suffix` is the folder part
 * ("_forever_/wow.exe"); a link without one predates folders, or came from a
 * tracker too old to send it.
 *
 * Every route that writes a link goes through `writeExeLink`, and every place
 * that only knows an exe name (older trackers) picks with `pickLegacyLink`,
 * so the rules live in one place.
 */

export type ExeLinkRow = {
  id: string
  game_id: string
  exe_name: string
  path_suffix: string | null
  created_at: string
}

export type ExeLinkWrite =
  | { kind: 'update'; id: string; set: { game_id: string; path_suffix?: string } }
  | { kind: 'insert' }

/**
 * Whether saving `exe → game` (with or without a folder) should update an
 * existing link or add a new one, given that exe's existing links.
 *
 * - With a folder: the link for that folder is updated; failing that, a
 *   folder-less link to the same game gains the folder; otherwise it's a new
 *   link — which is what lets Retail sit beside Forever.
 * - Without a folder (older trackers, the Settings link page): behaves as it
 *   always has when the exe has a single link — that one is repointed — and
 *   otherwise updates the folder-less link, or adds one.
 */
export function planExeLinkWrite(
  existing: Pick<ExeLinkRow, 'id' | 'game_id' | 'path_suffix'>[],
  input: { gameId: string; pathSuffix: string | null },
): ExeLinkWrite {
  const { gameId, pathSuffix } = input
  if (pathSuffix) {
    const sameFolder = existing.find(r => r.path_suffix === pathSuffix)
    if (sameFolder) return { kind: 'update', id: sameFolder.id, set: { game_id: gameId } }
    const legacySameGame = existing.find(r => r.path_suffix == null && r.game_id === gameId)
    if (legacySameGame) return { kind: 'update', id: legacySameGame.id, set: { game_id: gameId, path_suffix: pathSuffix } }
    return { kind: 'insert' }
  }
  if (existing.length === 1) return { kind: 'update', id: existing[0].id, set: { game_id: gameId } }
  const legacy = existing.find(r => r.path_suffix == null)
  if (legacy) return { kind: 'update', id: legacy.id, set: { game_id: gameId } }
  return { kind: 'insert' }
}

/**
 * The one link to use when all that's known is the exe name (trackers older
 * than per-folder matching): the folder-less link if there is one, else the
 * newest. Deterministic, so the agent's state and its session checkpoints
 * always agree on the game.
 */
export function pickLegacyLink<R extends Pick<ExeLinkRow, 'path_suffix' | 'created_at'>>(rows: R[]): R | undefined {
  return rows.find(r => r.path_suffix == null)
    ?? [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
}

type Sb = { from: (t: string) => any }

/** Save `exe → game` for a user, per `planExeLinkWrite`. Returns an error message, or null. */
export async function writeExeLink(
  sb: Sb,
  input: { userId: string; gameId: string; exeName: string; pathSuffix: string | null },
): Promise<string | null> {
  const { data: existing, error: readError } = await sb.from('game_executables')
    .select('id, game_id, path_suffix')
    .eq('user_id', input.userId)
    .eq('exe_name', input.exeName)
  if (readError) return readError.message

  const plan = planExeLinkWrite(existing ?? [], { gameId: input.gameId, pathSuffix: input.pathSuffix })
  const { error } = plan.kind === 'update'
    ? await sb.from('game_executables').update(plan.set).eq('id', plan.id).eq('user_id', input.userId)
    : await sb.from('game_executables').insert({
        user_id: input.userId,
        game_id: input.gameId,
        exe_name: input.exeName,
        path_suffix: input.pathSuffix,
      })
  return error ? error.message : null
}
