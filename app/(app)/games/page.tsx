import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameCard from '@/components/games/GameCard'
import GameFilters from '@/components/games/GameFilters'
import { Suspense } from 'react'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; q?: string; view?: string }
}) {
  if (!searchParams.status) redirect('/games?status=completed&sort=completion_date')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const status = searchParams.status === 'all' ? undefined : searchParams.status
  const sort = searchParams.sort ?? 'completion_date'
  const sortAsc = sort === 'title'
  const sortDesc = sort === 'completion_date' || sort === 'created_at' || sort === 'rating' || sort === 'hours_played'
  const q = searchParams.q?.trim()

  const STATUS_ORDER: Record<string, number> = { backlog: 0, completed: 1, dnf: 2 }

  let gamesQuery = supabase
    .from('games')
    .select('*')
    .eq('user_id', user!.id)
    .neq('status', 'playing')
    .order(sort === 'status' ? 'created_at' : sort, { ascending: !sortDesc, nullsFirst: false })

  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf')
  if (q) gamesQuery = gamesQuery.or(`title.ilike.%${q}%,developer.ilike.%${q}%`)

  // Playing games always fetched separately for the Now Playing strip — run both in parallel
  const [playingGamesRes, gamesRes] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('user_id', user!.id)
      .eq('status', 'playing')
      .order('created_at', { ascending: false }),
    gamesQuery,
  ])

  const playingGames = playingGamesRes.data as Game[] | null
  let games = gamesRes.data as Game[] | null

  if (sort === 'status' && games) {
    games = [...games].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg-base">My Games</h1>
          <p className="text-sm text-fg-muted mt-0.5">{games?.length ?? 0} games</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/import"
            className="px-3 py-2 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
          >
            Import
          </Link>
          <Link
            href={`/games/new${searchParams.status ? `?status=${searchParams.status}` : ''}`}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            + Add Game
          </Link>
        </div>
      </div>

      {/* Now Playing strip — always visible if any games are in progress */}
      {playingGames && playingGames.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
            Now Playing · {playingGames.length}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playingGames.map(game => (
              <GameCard key={game.id} game={game} isOwner={true} />
            ))}
          </div>
        </div>
      )}

      <Suspense>
        <GameFilters />
      </Suspense>

      {games && games.length > 0 ? (
        <GameListView games={games} status={searchParams.status} isOwner={true} view={(searchParams.view ?? cookies().get('gameView')?.value) === 'table' ? 'table' : 'grid'} />
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎮</p>
          <p className="font-medium text-fg-secondary">No games here</p>
          <p className="text-sm mt-1">
            {q ? `No games matching "${q}"${status ? ` in ${status}` : ''}` : status ? `No ${status} games yet` : 'No games in your library yet'}
          </p>
        </div>
      )}
    </div>
  )
}
