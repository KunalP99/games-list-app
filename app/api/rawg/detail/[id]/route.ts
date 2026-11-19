import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRawgGameDetail } from '@/lib/rawg'
import { allowRequest, tooManyRequests, IGDB_LOOKUP } from '@/lib/rate-limit'

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const rawgId = Number(params.id)
  if (!rawgId) return NextResponse.json(null, { status: 400 })

  // Spends the shared IGDB quota; cap it per account.
  if (!(await allowRequest(user.id, IGDB_LOOKUP))) return tooManyRequests(IGDB_LOOKUP, null)

  const detail = await getRawgGameDetail(rawgId)
  return NextResponse.json(detail)
}
