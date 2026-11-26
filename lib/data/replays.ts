import 'server-only'
import { finishedBefore, type ReplayCandidate } from '@/lib/replays'

type Sb = { from: (table: string) => any }

/**
 * Called just after a game is saved as Completed (createGame, updateGame,
 * markAsCompleted): if the person has already finished another copy of it,
 * this one is tagged as a replay. Only ever adds the tag (someone can still
 * tag a replay by hand, or untick one this got wrong). Best-effort: a failure
 * is logged, never fails the completion itself. Runs before achievements are
 * checked, so a second finish counts towards the replay ones at once.
 */
export async function tagReplayIfFinishedBefore(sb: Sb, userId: string, gameId: string): Promise<void> {
  const { data, error } = await (sb.from('games') as any)
    .select('id, title, status, igdb_id, rawg_id, steam_appid, completion_date, is_replay')
    .eq('user_id', userId)
  if (error || !data) {
    if (error) console.error(`replay tag: could not read the library: ${error.message}`)
    return
  }
  const library = data as (ReplayCandidate & { is_replay: boolean | null })[]
  const game = library.find(g => g.id === gameId)
  if (!game || game.is_replay || game.status !== 'completed' || !finishedBefore(game, library)) return
  const { error: updateError } = await (sb.from('games') as any)
    .update({ is_replay: true })
    .eq('id', gameId)
    .eq('user_id', userId)
  if (updateError) console.error(`replay tag: could not tag ${gameId}: ${updateError.message}`)
}
