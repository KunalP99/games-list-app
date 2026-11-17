import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { accentPalette } from '@/lib/accent'
import { isTrackable, resolveRow, sameGame, type LibraryRow } from '@/lib/trackable-row'

export const dynamic = 'force-dynamic'

/**
 * What the agent needs to know to do its job: which games are currently set to
 * Playing (and their Steam app ids), which executables have already been linked
 * to a game, which executables the user has said to never track, and the
 * user's theme/accent so the agent's own chrome matches the site.
 *
 * Polled every few minutes. Deliberately returns nothing about games that are
 * not Playing — the agent has no reason to know the rest of the library.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Every query below is scoped by identity.userId. The service role bypasses
  // RLS, so this scoping is the only thing keeping one user out of another's
  // rows — it must never be dropped.
  const [profileRes, gamesRes, linksRes, ignoredRes] = await Promise.all([
    (sb.from('profiles') as any)
      .select('display_name, username, theme_preference, accent_colour')
      .eq('id', identity.userId)
      .maybeSingle(),
    // The whole library, not just the trackable rows: an exe link can point
    // at a row that's since been Completed, and the rule in
    // lib/trackable-row.ts needs its siblings to send the hours elsewhere.
    (sb.from('games') as any)
      .select('id, title, status, steam_appid, igdb_id, rawg_id, hours_played, platform')
      .eq('user_id', identity.userId)
      .order('updated_at', { ascending: false }),
    (sb.from('game_executables') as any)
      .select('exe_name, game_id')
      .eq('user_id', identity.userId),
    (sb.from('ignored_executables') as any)
      .select('exe_name')
      .eq('user_id', identity.userId),
  ])

  await (sb.from('device_tokens') as any)
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', identity.deviceId)

  // Don't swallow query failures. An empty executables map looks exactly like
  // "nothing linked yet", so a broken query here is invisible from the agent's
  // side — which cost real debugging time once already.
  const failure = [profileRes, gamesRes, linksRes, ignoredRes].find(r => r.error)
  if (failure) {
    return NextResponse.json({ error: failure.error.message }, { status: 500 })
  }

  const profile = profileRes.data as { display_name: string | null; username: string; theme_preference: string | null; accent_colour: string | null } | null
  const library = (gamesRes.data ?? []) as (LibraryRow & { hours_played: number | null; platform: string | null })[]
  const links = (linksRes.data ?? []) as { exe_name: string; game_id: string }[]
  const ignored = (ignoredRes.data ?? []) as { exe_name: string }[]

  // Ambient games are tracked exactly like playing ones; they are simply the
  // ongoing games that sit outside the wheel. Playing rows first: the agent
  // takes the first row matching a running Steam game, so this order is what
  // makes a replay win over the same game's Ambient row (lib/trackable-row.ts).
  const trackable = library
    .filter(isTrackable)
    .sort((a, b) => Number(a.status !== 'playing') - Number(b.status !== 'playing'))

  // Each exe link, redirected to the row its hours belong to now — a link
  // made for the Ambient row still feeds a Playing replay of the same game,
  // and one left on a since-Completed replay falls back to the Ambient row.
  const byId = new Map(library.map(g => [g.id, g]))
  const executables = Object.fromEntries(links.map(l => {
    const linked = byId.get(l.game_id)
    return [l.exe_name, linked ? resolveRow(linked, library).id : l.game_id]
  }))
  const linkedIds = new Set(Object.values(executables))

  // Same default the rest of the app uses for an unset accent.
  const accent = profile?.accent_colour ?? '#ff5722'

  return NextResponse.json({
    playing: trackable.map(g => {
      // A replay row the wheel or the website created may carry no Steam id
      // of its own; borrowing its siblings' lets the running game find it.
      const steamAppId = g.steam_appid ?? library.find(r => r.steam_appid != null && sameGame(r, g))?.steam_appid ?? null
      return {
        id: g.id,
        title: g.title,
        steamAppId,
        hours: g.hours_played ?? 0,
        linked: linkedIds.has(g.id) || steamAppId != null,
        platform: g.platform,
      }
    }),
    executables,
    ignoredExecutables: ignored.map(i => i.exe_name),
    displayName: profile?.display_name ?? profile?.username ?? null,
    theme: profile?.theme_preference ?? 'system',
    accentColour: accent,
    // The eleven brand stops, computed by the same function the website uses
    // (lib/accent.ts), so the desktop app's own screens are in exactly the
    // user's colour rather than an approximation of it.
    palette: Object.fromEntries((accentPalette(accent) ?? []).map(([stop, rgb]) => [stop, rgb])),
    // The agent reads its cadence from here, so it can be tuned without
    // shipping a new build to everyone.
    // 10s rather than 30: a process scan costs ~8ms, so this is still
    // roughly 0.1% of one core, and 30 seconds of a game being open with
    // the app saying nothing reads as broken.
    pollSeconds: 10,
    checkpointMinutes: 15,
  })
}
