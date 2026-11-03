import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'
import { cleanSubmittedSuffix } from '@/lib/detectable'

export const dynamic = 'force-dynamic'

/**
 * Remember that an executable is a particular game ("SplitFiction.exe is
 * Split Fiction"). Stored against the user, not the device, so linking once
 * covers every machine they pair.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (typeof body?.exeName !== 'string' || body.exeName.trim().length === 0) {
    return NextResponse.json({ error: 'exeName is required' }, { status: 400 })
  }
  if (typeof body?.gameId !== 'string' || body.gameId.length === 0) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }
  const exeName = normaliseExeName(body.exeName)
  // The exe plus its nearest telling folder ("tunic/tunic.exe"), for the
  // admin queue on /admin/exe-links. Optional, and dropped rather than
  // refused when it doesn't look like a short ending.
  const pathSuffix = cleanSubmittedSuffix(body?.pathSuffix)

  // The game must be theirs — a device token is not a licence to touch anyone
  // else's library.
  const { data: game } = await (sb.from('games') as any)
    .select('id, title')
    .eq('id', body.gameId)
    .eq('user_id', identity.userId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 })

  const { error } = await (sb.from('game_executables') as any).upsert({
    user_id: identity.userId,
    game_id: game.id,
    exe_name: exeName,
    ...(pathSuffix ? { path_suffix: pathSuffix } : {}),
  }, { onConflict: 'user_id,exe_name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, exeName, gameId: game.id, title: game.title })
}
