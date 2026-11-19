// Private notes live in their own table (game_private_notes), readable only by
// their owner; public notes stay in games.notes. Game rows are readable by
// other users, so a private note kept in the row was readable by anyone
// signed in, whatever the page showed (db/batch3.sql).

type Client = { from: (table: string) => any }

/**
 * Saves a game's notes where they belong and returns the value for the
 * games.notes column: the text if public, null if private (the private copy is
 * written here instead). Uses the caller's own client: the owner may write
 * their own private notes.
 */
export async function saveGameNotes(
  supabase: Client,
  args: { gameId: string; userId: string; notes: string | null; isPublic: boolean },
): Promise<string | null> {
  const text = args.notes?.trim() || null
  if (args.isPublic || !text) {
    await supabase.from('game_private_notes').delete().eq('game_id', args.gameId).eq('user_id', args.userId)
    return args.isPublic ? text : null
  }
  const { error } = await supabase.from('game_private_notes').upsert(
    { game_id: args.gameId, user_id: args.userId, notes: text, updated_at: new Date().toISOString() },
    { onConflict: 'game_id' },
  )
  if (error) throw new Error(`Could not save private notes: ${error.message}`)
  return null
}

/**
 * The game with its notes as its owner sees them: a private game's notes come
 * from game_private_notes. Anyone else gets the row unchanged (public notes
 * only, since a private game's games.notes is empty).
 */
export async function withOwnerNotes<G extends { id: string; user_id: string; notes?: string | null; notes_public?: boolean | null }>(
  supabase: Client,
  game: G,
  viewerId: string | null | undefined,
): Promise<G> {
  if (!viewerId || viewerId !== game.user_id || game.notes_public) return game
  const { data } = await supabase.from('game_private_notes').select('notes').eq('game_id', game.id).maybeSingle()
  // Until the move is finished (db/batch3.sql PART B), an older private note
  // may still be in the row itself.
  return { ...game, notes: data?.notes ?? game.notes ?? null }
}
