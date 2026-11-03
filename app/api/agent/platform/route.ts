import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

/**
 * Confirm or correct a game's platform, from the desktop agent's
 * first-time-detected toast. Only ever touches `platform` on a game the
 * caller's device token actually owns — never anything else about it.
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
  if (typeof body?.gameId !== 'string' || body.gameId.length === 0) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  }
  if (typeof body?.platform !== 'string' || body.platform.trim().length === 0) {
    return NextResponse.json({ error: 'platform is required' }, { status: 400 })
  }
  const platform = body.platform.trim().slice(0, 100)

  const { data: game } = await (sb.from('games') as any)
    .select('id')
    .eq('id', body.gameId)
    .eq('user_id', identity.userId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 })

  const { error } = await (sb.from('games') as any)
    .update({ platform })
    .eq('id', game.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
