import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'
import { cleanSubmittedSuffix } from '@/lib/detectable'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Forget that an executable is a game.
 *
 * The counterpart to /api/agent/link, and not optional: linking the wrong
 * program (a browser, say) otherwise keeps logging that program as play time
 * with no way to stop it short of editing the database.
 *
 * Hours already written are left alone — they are a record of what happened,
 * and correcting them is the user's call on the game itself.
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

  const exeName = normaliseExeName(body.exeName)
  // With a folder, only that link goes — an exe can have one per folder (WoW
  // Retail and Forever are both Wow.exe). Without one, every link for the
  // exe, as before.
  const pathSuffix = cleanSubmittedSuffix(body?.pathSuffix)
  let query = (sb.from('game_executables') as any)
    .delete()
    .eq('user_id', identity.userId)
    .eq('exe_name', exeName)
  if (pathSuffix) query = query.eq('path_suffix', pathSuffix)
  // Only this game's link, when given: changing one game's program must not
  // take away another game's link to an exe of the same name (WoW Retail and
  // Forever are both Wow.exe). Trackers before v0.3.0 never send it.
  const gameId = typeof body?.gameId === 'string' && UUID.test(body.gameId) ? body.gameId : null
  if (body?.gameId != null && !gameId) return NextResponse.json({ error: 'gameId must be a game id' }, { status: 400 })
  if (gameId) query = query.eq('game_id', gameId)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, exeName })
}
