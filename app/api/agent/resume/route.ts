import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'
import { PROVIDER_ID_COLUMN } from '@/lib/rawg'

export const dynamic = 'force-dynamic'

/**
 * Acts on the agent's "is this a replay?" / "are you resuming?" / "set to
 * Playing or Ambient?" prompt, triggered by `/api/agent/identify`'s
 * `resumable` flag on a Completed, DNF or Backlog match. All three update
 * an existing, already-identified game — never anything the user hasn't
 * explicitly confirmed, since a background program silently deciding a
 * backlog game "counts as Playing now" would be the wrong kind of
 * automatic. They're still three genuinely different cases, not one:
 *
 *   dnf       — the same unfinished playthrough, picked back up. Updates the
 *               existing row in place (status -> playing, clears the
 *               "dropped" date) — a second row here would just be an
 *               orphaned duplicate with nothing to link to.
 *   backlog   — never played at all yet. Same in-place update as dnf, but
 *               the target status is the user's own choice between the two
 *               genuinely trackable ones (`status` in the body carries it).
 *   completed — a deliberate second attempt at something already finished.
 *               Creates a brand-new row instead, carrying over the display
 *               metadata (title, platform, artwork, ...) but none of the
 *               finished run's own stats (hours, achievements, rating) —
 *               the original Completed row is never touched, so the first
 *               playthrough's record stays exactly as it was.
 *
 * Either way, the executable (if given) ends up linked to whichever row is
 * now the live one, so tracking starts on the very next poll.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Captured as its own const: TypeScript's narrowing of `identity` from the
  // check above does not reach inside the linkExe closure defined below.
  const userId = identity.userId

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof body?.gameId !== 'string' || body.gameId.length === 0) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }
  if (body?.kind !== 'completed' && body?.kind !== 'dnf' && body?.kind !== 'backlog') {
    return NextResponse.json({ error: 'kind must be "completed", "dnf" or "backlog"' }, { status: 400 })
  }
  const kind: 'completed' | 'dnf' | 'backlog' = body.kind
  // Only meaningful (and required) for backlog — dnf/completed each have
  // exactly one possible outcome, so there's nothing for the caller to pick.
  if (kind === 'backlog' && body?.status !== 'playing' && body?.status !== 'ambient') {
    return NextResponse.json({ error: 'status must be "playing" or "ambient" when kind is "backlog"' }, { status: 400 })
  }
  const targetStatus: 'playing' | 'ambient' = kind === 'backlog' ? body.status : 'playing'
  const exeName = typeof body?.exeName === 'string' && body.exeName.trim()
    ? normaliseExeName(body.exeName)
    : null

  const { data: game } = await (sb.from('games') as any)
    .select(`id, title, status, start_date, developer, release_date, release_date_precision, cover_image_url,
      image_url, artwork_url, description, genres, platform, dominant_color, steam_appid, ${PROVIDER_ID_COLUMN}`)
    .eq('id', body.gameId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 })
  // Guards against a stale prompt acted on after the game was edited on the
  // website in the meantime — the status this request assumes has to still
  // be true.
  if (game.status !== kind) {
    return NextResponse.json({ error: `game is no longer ${kind}` }, { status: 409 })
  }

  async function linkExe(gameId: string) {
    if (!exeName) return
    const { error } = await (sb.from('game_executables') as any).upsert({
      user_id: userId,
      game_id: gameId,
      exe_name: exeName,
    }, { onConflict: 'user_id,exe_name' })
    if (error) console.error(`resume: could not link ${exeName} to ${gameId}: ${error.message}`)
  }

  if (kind === 'dnf' || kind === 'backlog') {
    const { error } = await (sb.from('games') as any)
      .update({
        status: targetStatus,
        completion_date: null,
        // A backlog game has never been started, so it has no start_date
        // yet either — a dnf one already does, and keeps it, since this is
        // the same playthrough continuing, not a new one.
        start_date: game.start_date ?? new Date().toISOString().slice(0, 10),
      })
      .eq('id', game.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await linkExe(game.id)
    return NextResponse.json({ ok: true, gameId: game.id, title: game.title })
  }

  // completed: a new row, carrying the old one's display identity only.
  const { data: created, error } = await (sb.from('games') as any)
    .insert({
      user_id: userId,
      title: game.title,
      developer: game.developer,
      status: 'playing',
      is_replay: true,
      platform: game.platform,
      start_date: new Date().toISOString().slice(0, 10),
      steam_appid: game.steam_appid,
      [PROVIDER_ID_COLUMN]: game[PROVIDER_ID_COLUMN],
      image_url: game.image_url,
      cover_image_url: game.cover_image_url,
      artwork_url: game.artwork_url,
      genres: game.genres,
      description: game.description,
      release_date: game.release_date,
      release_date_precision: game.release_date_precision,
      completion_date_precision: 'year',
      dominant_color: game.dominant_color,
    })
    .select('id, title')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await linkExe(created.id)
  return NextResponse.json({ ok: true, gameId: created.id, title: created.title })
}
