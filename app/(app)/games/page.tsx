import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameCard from '@/components/games/GameCard'
import GameFilters from '@/components/games/GameFilters'
import { Suspense } from 'react'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; q?: string }
}) {
  if (!searchParams.status) redirect('/games?status=completed')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const status = searchParams.status === 'all' ? undefined : searchParams.status
  const sort = searchParams.sort ?? 'created_at'
  const sortAsc = sort === 'title'
  const q = searchParams.q?.trim()

  const STATUS_ORDER: Record<string, number> = { backlog: 0, completed: 1, dnf: 2 }

  // Playing games always fetched separately for the Now Playing strip
  const { data: playingGames } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', user!.id)
    .eq('status', 'playing')
    .order('created_at', { ascending: false }) as { data: Game[] | null }

  let query = supabase
    .from('games')
    .select('*')
    .eq('user_id', user!.id)
    .neq('status', 'playing')
    .order(sort === 'status' ? 'created_at' : sort, { ascending: sortAsc, nullsFirst: false })

  if (status) query = query.eq('status', status)
  if (q) query = query.or(`title.ilike.%${q}%,developer.ilike.%${q}%`)

  let { data: games } = await query as { data: Game[] | null }

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
        <Link
          href="/games/new"
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Add Game
        </Link>
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
        <GameListView games={games} status={searchParams.status} isOwner={true} />
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
