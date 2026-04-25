import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import GameCard from '@/components/games/GameCard'
import GameFilters from '@/components/games/GameFilters'
import { Suspense } from 'react'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string }
}) {
  if (!searchParams.status) redirect('/games?status=completed')

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const status = searchParams.status === 'all' ? undefined : searchParams.status
  const sort = searchParams.sort ?? 'created_at'
  const sortAsc = sort === 'title'

  let query = supabase
    .from('games')
    .select('*')
    .eq('user_id', user!.id)
    .order(sort, { ascending: sortAsc, nullsFirst: false })

  if (status) query = query.eq('status', status)

  const { data: games } = await query as { data: Game[] | null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">My Games</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{games?.length ?? 0} games</p>
        </div>
        <Link
          href="/games/new"
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          + Add Game
        </Link>
      </div>

      <Suspense>
        <GameFilters />
      </Suspense>

      {games && games.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <div className="text-center py-16 text-zinc-400">
          <p className="text-4xl mb-3">🎮</p>
          <p className="font-medium text-zinc-600">No games yet</p>
          <p className="text-sm mt-1">
            {status ? `No games with status "${status}"` : 'Add your first game to get started'}
          </p>
          {!status && (
            <Link
              href="/games/new"
              className="inline-block mt-4 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
            >
              Add a Game
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
