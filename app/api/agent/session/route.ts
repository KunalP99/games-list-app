import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { validateSessionPayload, computeHoursDelta, roundHours } from '@/lib/agent-session'
import { checkAndAwardAchievements } from '@/lib/achievements'
import { isTrackable, pickRow, resolveRow, type LibraryRow } from '@/lib/trackable-row'
import { pickLegacyLink, type ExeLinkRow } from '@/lib/exe-links'
import { FEATURES } from '@/lib/edition'
import { londonDay } from '@/lib/activity'

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
  const { clientSessionId, minutes, startedAt, endedAt, steamAppId, exeName, gameId } = parsed.value

  // ── Resolve which game this is ────────────────────────────────────────────
  // Several rows per game are legitimate (a Completed story run, an Ambient
  // row for the multiplayer since, a Playing replay). Whatever matched — the
  // Steam id or the exe link — the hours go to the row lib/trackable-row.ts
  // picks among that game's rows: Playing, then Ambient. The same rule
  // /api/agent/state uses, so the agent and the server agree on the game.
  const { data: libraryData, error: libraryError } = await (sb.from('games') as any)
    .select('id, title, status, hours_played, steam_appid, igdb_id, rawg_id, assigned_by, tracks_hours')
    .eq('user_id', identity.userId)
    .order('updated_at', { ascending: false })
  if (libraryError) return NextResponse.json({ error: libraryError.message }, { status: 500 })
  const library = (libraryData ?? []) as (GameRow & LibraryRow & { assigned_by: string | null })[]

  let game: (GameRow & LibraryRow & { assigned_by: string | null }) | null = null

  // Newer trackers say which game they matched — per folder, so WoW Retail and
  // Forever (both Wow.exe) are told apart. Used only if it's in this user's
  // own library; the status check below still applies, as for any match.
  if (gameId) {
    const named = library.find(g => g.id === gameId)
    if (named) game = resolveRow(named, library)
  }

  if ((!game || !isTrackable(game)) && steamAppId != null) {
    const bySteam = pickRow(library.filter(g => g.steam_appid === steamAppId))
    if (bySteam) game = resolveRow(bySteam, library)
  }

  // As before, the exe link is the fallback when the Steam id found nothing
  // trackable.
  // An exe can have a link per folder; trackers that don't send a game id get
  // the same one /api/agent/state gives them (pickLegacyLink).
  if ((!game || !isTrackable(game)) && exeName) {
    const { data: links } = await (sb.from('game_executables') as any)
      .select('game_id, path_suffix, created_at')
      .eq('user_id', identity.userId)
      .eq('exe_name', exeName)
    const link = pickLegacyLink((links ?? []) as Pick<ExeLinkRow, 'game_id' | 'path_suffix' | 'created_at'>[])
    const linked = link?.game_id ? library.find(g => g.id === link.game_id) : undefined
    if (linked) {
      const resolved = resolveRow(linked, library)
      if (!game || isTrackable(resolved)) game = resolved
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

  // ── Claim this checkpoint on the session row, then add the hours ──────────
  // Two copies of the same checkpoint at once (the tracker retrying while the
  // first is still being processed) used to both read the same applied_hours
  // and both add the same delta. Now the session row is moved on only if
  // applied_hours is still what was read: exactly one request wins and adds
  // the hours; the other changes nothing and reports 0 added.
  // Rounded like the numeric(6,1) column, so the rollback below can match it.
  const claimedHours = roundHours(appliedHours + delta)
  const sessionFields = {
    game_id: game.id,
    device_id: identity.deviceId,
    minutes,
    started_at: startedAt,
    ended_at: endedAt,
    applied_hours: claimedHours,
    last_checkpoint_at: nowIso,
  }
  const raced = () => NextResponse.json({
    ok: true, gameId: game!.id, title: game!.title, addedHours: 0, ticketsEarned: 0, totalHours: game!.hours_played ?? 0,
  })

  if (existing) {
    const { data: claimed, error: claimError } = await (sb.from('play_sessions') as any)
      .update(sessionFields)
      .eq('id', existing.id)
      .eq('applied_hours', existing.applied_hours)
      .select('id')
    if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
    if (!claimed?.length) return raced()
  } else {
    const { error: insertError } = await (sb.from('play_sessions') as any).insert({
      user_id: identity.userId,
      client_session_id: clientSessionId,
      ...sessionFields,
    })
    // 23505: the same session's first checkpoint, inserted by the other copy.
    if (insertError?.code === '23505') return raced()
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    // A new session of this game on this PC means any earlier one still open
    // there was never closed: the tracker was restarted, crashed, or the PC
    // slept before its final write. Close it at its last checkpoint, so it
    // stops counting as running anywhere. Best effort: never fails the
    // checkpoint it rides on.
    try {
      await closeOrphanedSessions(sb, identity.userId, identity.deviceId, game.id, clientSessionId, startedAt)
    } catch {
      // The display rule (settleSession) covers anything left open.
    }
  }

  let totalHours = game.hours_played ?? 0
  let hoursTicketsEarned = 0
  if (delta > 0) {
    // hours_played + delta in one statement (db/review-fixes.sql), so two
    // sessions at once (two PCs) can't overwrite each other's hours. Only this
    // column, and only while the game is still Playing or Ambient — re-checked
    // in the write itself, since the status could have changed since the read.
    const { data: newTotal, error: addError } = await (sb as any).rpc('add_game_hours', {
      p_user_id: identity.userId,
      p_game_id: game.id,
      p_delta: delta,
    })
    if (addError) {
      // Give the claim back, so the tracker's retry can apply these hours.
      await (sb.from('play_sessions') as any)
        .update({ applied_hours: appliedHours })
        .eq('user_id', identity.userId)
        .eq('client_session_id', clientSessionId)
        .eq('applied_hours', claimedHours)
      return NextResponse.json({ error: addError.message }, { status: 500 })
    }
    // null: the game stopped being trackable in between, so nothing was added.
    if (newTotal != null) {
      totalHours = Number(newTotal)
      // 1 ticket per 25 hours played (lib/hours-tickets.ts), on one running
      // counter per player, credited to the game that crosses the line. Not
      // for a game the wheel picked: it pays by length when it's completed.
      // Counted once per checkpoint, because the claim above already makes
      // each delta apply once.
      if (FEATURES.hoursTickets && !game.assigned_by) {
        const cap = FEATURES.hoursTicketDailyCap
        const { data: paid, error: ticketError } = await (sb as any).rpc('add_hours_progress', {
          p_user_id: identity.userId,
          p_game_id: game.id,
          p_minutes: Math.round(delta * 60),
          p_daily_cap_minutes: cap == null ? null : cap * 60,
          p_day: londonDay(new Date().toISOString()),
        })
        if (ticketError) console.error(`session: hours tickets for ${game.id} failed: ${ticketError.message}`)
        else hoursTicketsEarned = Number(paid ?? 0)
      }
    }
  }

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
    ticketsEarned: hoursTicketsEarned,
    addedHours: delta,
    totalHours,
  })
}

/**
 * Ends this PC's earlier sessions of the same game that were never closed,
 * each at its own last checkpoint (or its start, if it never had one).
 * Only sessions that started before the new one; another game running at the
 * same time, or another PC, is left alone.
 */
async function closeOrphanedSessions(
  sb: { from: (table: string) => any },
  userId: string,
  deviceId: string,
  gameId: string,
  currentClientSessionId: string,
  currentStartedAt: string,
) {
  const { data: open } = await sb.from('play_sessions')
    .select('id, started_at, last_checkpoint_at')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .eq('game_id', gameId)
    .is('ended_at', null)
    .neq('client_session_id', currentClientSessionId)
    .lt('started_at', currentStartedAt)
  for (const row of (open ?? []) as { id: string; started_at: string; last_checkpoint_at: string | null }[]) {
    await sb.from('play_sessions')
      .update({ ended_at: row.last_checkpoint_at ?? row.started_at })
      .eq('id', row.id)
      .is('ended_at', null)
  }
}
