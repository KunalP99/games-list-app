import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateDevice } from '@/lib/agent-auth'
import { searchRawgGames } from '@/lib/rawg'

export const dynamic = 'force-dynamic'

/**
 * Game search for the desktop agent's own "add it as a new game" panel —
 * the device-token-authenticated equivalent of `/api/rawg/search`, which the
 * website's add-game box uses but which requires a Supabase session cookie
 * the agent doesn't have. Returns a list of candidates for a human to pick
 * from, unlike `/api/agent/identify`'s `titleGuess`, which only ever trusts
 * (and returns) a single exact match.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const sb = createAdminClient()
  const identity = await authenticateDevice(sb as any, request.headers.get('authorization'))
  if (!identity) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const results = await searchRawgGames(q)
  return NextResponse.json({ results })
}
