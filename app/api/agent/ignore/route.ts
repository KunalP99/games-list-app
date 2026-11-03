import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'

export const dynamic = 'force-dynamic'

/**
 * Record that an executable should never be tracked as a game — the toast's
 * "Not a game" answer. Mirrored here (alongside the agent's own local
 * asked.json, which stays as an instant-effect offline cache) so the entry
 * is visible and reversible from Settings, not just a local opaque file.
 *
 * Also removes any current `game_executables` link for it under this
 * account, so a wrongly-tracked program (a launcher misidentified as an
 * unrelated game, say) actually stops being tracked — not just un-asked.
 * The game row itself is left alone: only future tracking stops.
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

  await (sb.from('game_executables') as any)
    .delete()
    .eq('user_id', identity.userId)
    .eq('exe_name', exeName)

  const { error } = await (sb.from('ignored_executables') as any).upsert({
    user_id: identity.userId,
    exe_name: exeName,
  }, { onConflict: 'user_id,exe_name' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, exeName })
}
