import Link from 'next/link'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getLiveSessions } from '@/lib/presence'
import { ilikeAnyFilter } from '@/lib/query-escape'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'

export type GamesSearch = { status?: string; sort?: string; view?: string; q?: string }

/**
 * A person's games list, under the cards on their profile (public edition):
 * the same list, filters and views as My Games, driven by the page's own
 * `?status`, `?sort`, `?view` and `?q`.
 */
export default async function ProfileGames({
  userId,
  name,
  isOwner,
  allowed,
  privateTo,
  searchParams,
}: {
  userId: string
  name: string
  isOwner: boolean
  /** Whether the viewer may see their games (Settings → Privacy). */
  allowed: boolean
  /** Who may, for the message when the viewer can't. */
  privateTo: string | null | undefined
  searchParams: GamesSearch
}) {
  if (!allowed) {
    return (
      <section aria-label="Games" className="rounded-2xl border border-edge-base bg-surface-base px-6 py-10 text-center">
        <p className="font-medium text-fg-secondary">{name}’s games list is private</p>
        <p className="mt-1 text-sm text-fg-muted">
          {privateTo === 'friends' ? 'Only their friends can see it.' : 'Only they can see it.'}
        </p>
      </section>
    )
  }

  const supabase = await createClient()
  // Defaults to Completed in place rather than redirecting, as on My Games.
  const selectedStatus = searchParams.status ?? 'completed'
  const status = selectedStatus === 'all' ? undefined : selectedStatus
  const sort = searchParams.sort ?? (status === 'backlog' ? 'created_at' : 'completion_date')

  let gamesQuery = supabase
    .from('games')
    .select('*')
    .eq('user_id', userId)
    .order(sort, { ascending: sort === 'title', nullsFirst: false })
  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf' | 'ambient')
  if (searchParams.q?.trim()) gamesQuery = (gamesQuery as any).or(ilikeAnyFilter(['title', 'developer'], searchParams.q.trim()))

  const [gamesRes, liveSessions] = await Promise.all([gamesQuery, getLiveSessions(supabase, [userId])])
  const games = gamesRes.data as Game[] | null

  const rawView = searchParams.view ?? (await cookies()).get('gameView')?.value
  // Box Art (portrait) is the default view; explicit grid/table choices are honoured.
  const view: 'grid' | 'table' | 'cover' = rawView === 'grid' || rawView === 'table' ? rawView : 'cover'

  return (
    <section aria-labelledby="profile-games" className="space-y-4 pt-4">
      {/* Your own list is "My Games", with + Add Game (the public edition has
          no separate My Games page); someone else's is just "Games". */}
      <div className="flex items-center justify-between gap-3">
        <h2 id="profile-games" className="text-xl font-bold text-fg-base">{isOwner ? 'My Games' : 'Games'}</h2>
        {isOwner && (
          <Link
            href={`/games/new?status=${selectedStatus}`}
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            + Add Game
          </Link>
        )}
      </div>
      <Suspense>
        <GameFilters />
      </Suspense>
      {games && games.length > 0 ? (
        <GameListView games={games} status={selectedStatus} isOwner={isOwner} view={view} liveSessions={liveSessions} />
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎮</p>
          <p className="font-medium text-fg-secondary">No games found</p>
          <p className="text-sm mt-1">
            {status ? `${name} has no ${status} games` : `${name} hasn’t added any games yet`}
          </p>
        </div>
      )}
    </section>
  )
}
