import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchRawgGames, SEARCH_PAGE_SIZE } from '@/lib/rawg'
import { allowRequest, tooManyRequests, IGDB_SEARCH } from '@/lib/rate-limit'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ results: [], hasMore: false }, { status: 401 })

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [], hasMore: false })

  // Every search spends the shared IGDB quota; cap it per account.
  if (!(await allowRequest(user.id, IGDB_SEARCH))) {
    return tooManyRequests(IGDB_SEARCH, { results: [], hasMore: false, error: 'Too many searches. Wait a moment and try again.' })
  }

  const page = Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1)
  const results = await searchRawgGames(q, page)
  // A full page implies there may be more; a short page means we've reached the end.
  return NextResponse.json({ results, hasMore: results.length >= SEARCH_PAGE_SIZE })
}
