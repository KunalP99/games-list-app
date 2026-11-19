import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGameImages } from '@/lib/rawg'
import { allowRequest, tooManyRequests, IGDB_LOOKUP } from '@/lib/rate-limit'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const id = Number(params.id)
  if (!id) return NextResponse.json([], { status: 400 })

  // Spends the shared IGDB quota; cap it per account.
  if (!(await allowRequest(user.id, IGDB_LOOKUP))) return tooManyRequests(IGDB_LOOKUP, [])

  const images = await getGameImages(id)
  return NextResponse.json(images)
}
