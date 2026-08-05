import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGameImages } from '@/lib/rawg'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const id = Number(params.id)
  if (!id) return NextResponse.json([], { status: 400 })

  const images = await getGameImages(id)
  return NextResponse.json(images)
}
