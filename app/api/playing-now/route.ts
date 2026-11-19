import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getPlayingNow } from '@/lib/presence'

export const dynamic = 'force-dynamic'

/**
 * The dashboard's "Playing Now" list, for its once-a-minute refresh — so
 * someone starting or stopping a game shows up without reloading the whole
 * dashboard (whose other sections hit IGDB). Signed-in users only; the
 * middleware doesn't guard /api, so this checks itself.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json({ players: await getPlayingNow(supabase, user.id) })
}
