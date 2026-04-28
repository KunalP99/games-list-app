import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getRawgGameDetail } from '@/lib/rawg'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const rawgId = Number(params.id)
  if (!rawgId) return NextResponse.json(null, { status: 400 })

  const detail = await getRawgGameDetail(rawgId)
  return NextResponse.json(detail)
}
