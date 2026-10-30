import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

/**
 * What the agent needs to know to do its job: which games are currently set to
 * Playing (and their Steam app ids), which executables have already been linked
 * to a game, and the user's theme/accent so the agent's own chrome matches the
 * site.
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
  const [profileRes, gamesRes, linksRes] = await Promise.all([
    (sb.from('profiles') as any)
      .select('theme_preference, accent_colour')
      .eq('id', identity.userId)
      .maybeSingle(),
    (sb.from('games') as any)
      .select('id, title, steam_appid, hours_played')
      .eq('user_id', identity.userId)
      .eq('status', 'playing')
      .order('updated_at', { ascending: false }),
    (sb.from('game_executables') as any)
      .select('exe_name, game_id')
      .eq('user_id', identity.userId),
  ])

  await (sb.from('device_tokens') as any)
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', identity.deviceId)

  const profile = profileRes.data as { theme_preference: string | null; accent_colour: string | null } | null
  const games = (gamesRes.data ?? []) as { id: string; title: string; steam_appid: number | null; hours_played: number | null }[]
  const links = (linksRes.data ?? []) as { exe_name: string; game_id: string }[]

  return NextResponse.json({
    playing: games.map(g => ({
      id: g.id,
      title: g.title,
      steamAppId: g.steam_appid,
      hours: g.hours_played ?? 0,
      linked: links.some(l => l.game_id === g.id) || g.steam_appid != null,
    })),
    executables: Object.fromEntries(links.map(l => [l.exe_name, l.game_id])),
    theme: profile?.theme_preference ?? 'system',
    accentColour: profile?.accent_colour ?? null,
    // The agent reads its cadence from here, so it can be tuned without
    // shipping a new build to everyone.
    pollSeconds: 30,
    checkpointMinutes: 15,
  })
}
