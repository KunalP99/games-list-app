import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { validateSessionPayload, computeHoursDelta, addHours } from '@/lib/agent-session'
import { checkAndAwardAchievements } from '@/lib/achievements'

export const dynamic = 'force-dynamic'

type GameRow = { id: string; title: string; status: string; hours_played: number | null }

/**
 * A play-session checkpoint from the agent.
 *
 * Checkpoints carry the session's cumulative minutes, so this applies only the
 * delta since the last one. That makes retries, replays and a flushed offline
 * buffer all harmless.
 *
 * The rule that matters: only games whose status is 'playing' are ever
 * written to, and that status is re-read here rather than trusted from the
 * client. Hours on a completed game would reverse and re-award its entire
 * ticket ledger (see updateGame), so no client program may reach it.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = validateSessionPayload(body, Date.now())
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const { clientSessionId, minutes, startedAt, endedAt, steamAppId, exeName } = parsed.value

  // ── Resolve which game this is ────────────────────────────────────────────
  let game: GameRow | null = null

  if (steamAppId != null) {
    const { data } = await (sb.from('games') as any)
      .select('id, title, status, hours_played')
      .eq('user_id', identity.userId)
      .eq('steam_appid', steamAppId)
      .in('status', ['playing', 'ambient'])
      // Several rows per title are legitimate (replays); the most recently
      // touched one is the one being played.
      .order('updated_at', { ascending: false })
      .limit(1)
    game = ((data ?? [])[0] ?? null) as GameRow | null
  }

  if (!game && exeName) {
    const { data: link } = await (sb.from('game_executables') as any)
      .select('game_id')
      .eq('user_id', identity.userId)
      .eq('exe_name', exeName)
      .maybeSingle()
    if (link?.game_id) {
      const { data } = await (sb.from('games') as any)
        .select('id, title, status, hours_played')
        .eq('user_id', identity.userId)
        .eq('id', link.game_id)
        .maybeSingle()
      game = (data ?? null) as GameRow | null
    }
  }

  if (!game) return NextResponse.json({ ignored: true, reason: 'no_match' })

  // Re-read, never trust: the client does not get to say what status a game is.
  // Playing and ambient are both trackable. Completed is the one that must stay
  // out of reach — writing hours there reverses and re-awards its entire ticket
  // ledger (see updateGame).
  if (game.status !== 'playing' && game.status !== 'ambient') {
    return NextResponse.json({
      ignored: true, reason: 'not_trackable', gameId: game.id, title: game.title, status: game.status,
    })
  }

  // ── Work out what to add ──────────────────────────────────────────────────
  const { data: existing } = await (sb.from('play_sessions') as any)
    .select('id, applied_hours, last_checkpoint_at')
    .eq('user_id', identity.userId)
    .eq('client_session_id', clientSessionId)
    .maybeSingle()

  const appliedHours = Number(existing?.applied_hours ?? 0)
  const lastCheckpointAt = existing?.last_checkpoint_at ? Date.parse(existing.last_checkpoint_at) : null
  const nowIso = new Date().toISOString()

  const delta = computeHoursDelta({
    minutes,
    appliedHours,
    lastCheckpointAtMs: Number.isNaN(lastCheckpointAt as number) ? null : lastCheckpointAt,
    nowMs: Date.now(),
  })

  let totalHours = game.hours_played ?? 0
  if (delta > 0) {
    totalHours = addHours(game.hours_played, delta)
    const { error: updateError } = await (sb.from('games') as any)
      // Only this column. updateGame is a full-row update and must not be
      // reused here — it would null out every field the agent doesn't know.
      .update({ hours_played: totalHours })
      .eq('id', game.id)
      .eq('user_id', identity.userId)
      // Re-asserted in the write itself, not just the read above: the status
      // could have changed in between.
      .in('status', ['playing', 'ambient'])
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  const { error: sessionError } = await (sb.from('play_sessions') as any).upsert({
    user_id: identity.userId,
    game_id: game.id,
    device_id: identity.deviceId,
    client_session_id: clientSessionId,
    minutes,
    started_at: startedAt,
    ended_at: endedAt,
    applied_hours: appliedHours + delta,
    last_checkpoint_at: nowIso,
  }, { onConflict: 'user_id,client_session_id' })
  if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

  // Hours achievements count across every status, so tracked time can unlock
  // them. Record the unlock even though the toast (a cookie set by a server
  // action) can't reach a browser from here — the user sees it on next visit.
  if (delta > 0) {
    try {
      await checkAndAwardAchievements(sb as any, identity.userId)
    } catch {
      // Never let achievement evaluation fail a session write.
    }
  }

  return NextResponse.json({
    ok: true,
    gameId: game.id,
    title: game.title,
    addedHours: delta,
    totalHours,
  })
}
