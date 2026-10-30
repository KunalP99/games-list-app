import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'

export const dynamic = 'force-dynamic'

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
  const { error } = await (sb.from('game_executables') as any)
    .delete()
    .eq('user_id', identity.userId)
    .eq('exe_name', exeName)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, exeName })
}
