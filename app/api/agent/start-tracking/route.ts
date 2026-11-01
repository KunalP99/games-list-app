import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'

export const dynamic = 'force-dynamic'

/**
 * Move a game to Playing after the user accepts the agent's prompt.
 *
 * Writes status and start_date only — never hours, never anything else. A
 * completed game is refused outright: un-completing one reverses its ticket
 * ledger, which is not something a background program should be able to do.
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

  const { data: game } = await (sb.from('games') as any)
    .select('id, title, status, start_date')
    .eq('id', body.gameId)
    .eq('user_id', identity.userId)
    .maybeSingle()
  if (!game) return NextResponse.json({ error: 'game not found' }, { status: 404 })

  if (game.status === 'completed' || game.status === 'dnf') {
    return NextResponse.json(
      { error: 'refusing to reopen a finished game from the agent', status: game.status },
      { status: 409 },
    )
  }
  if (game.status === 'playing') {
    return NextResponse.json({ ok: true, gameId: game.id, title: game.title, alreadyPlaying: true })
  }
  // Ambient games are already tracked, and moving one to Playing would quietly
  // enrol it in the wheel's world — a turn's worth of meaning the agent has no
  // business assigning. Only the user may promote one, from the site.
  if (game.status === 'ambient') {
    return NextResponse.json({ ok: true, gameId: game.id, title: game.title, alreadyTracked: true })
  }

  const update: Record<string, unknown> = { status: 'playing' }
  if (!game.start_date) update.start_date = new Date().toISOString().slice(0, 10)

  const { error } = await (sb.from('games') as any)
    .update(update)
    .eq('id', game.id)
    .eq('user_id', identity.userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, gameId: game.id, title: game.title })
}
