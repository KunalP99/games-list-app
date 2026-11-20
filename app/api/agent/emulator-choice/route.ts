import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { allowRequest, tooManyRequests, AGENT_IDENTIFY } from '@/lib/rate-limit'
import { parseEmulatorRequest } from '@/lib/emulators'
import { chooseEmulated } from '@/lib/agent-emulator'

export const dynamic = 'force-dynamic'

/**
 * The answer to the tracker's emulator pop-up, remembered so it's never asked
 * again for that console and disc (lib/agent-emulator.ts):
 *
 *   { emulator, igdbId, title } — this is the game: tracked if they own it
 *                                 (marked Emulated), else added as Playing.
 *   { emulator, none: true }    — "None of these": stop asking.
 *
 * "Not now" never reaches the server; the tracker just stops asking for a while.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // Adding a game reads its details from IGDB: the same limit as identify.
  if (!(await allowRequest(identity.userId, AGENT_IDENTIFY))) return tooManyRequests(AGENT_IDENTIFY)

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const req = parseEmulatorRequest(body?.emulator)
  if (typeof req === 'string') return NextResponse.json({ error: req }, { status: 400 })

  let choice: { igdbId: number; title: string } | null
  if (body?.none === true) {
    choice = null
  } else {
    const igdbId = body?.igdbId
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (typeof igdbId !== 'number' || !Number.isInteger(igdbId) || igdbId <= 0) {
      return NextResponse.json({ error: 'igdbId (a positive integer) or none: true is required' }, { status: 400 })
    }
    if (!title || title.length > 200) return NextResponse.json({ error: 'title is required alongside igdbId' }, { status: 400 })
    choice = { igdbId, title }
  }

  const answer = await chooseEmulated(sb, identity.userId, req, choice)
  if ('error' in answer) return NextResponse.json({ error: answer.error }, { status: 500 })
  return NextResponse.json(answer)
}
