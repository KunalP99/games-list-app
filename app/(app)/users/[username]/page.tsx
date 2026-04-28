import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Game, Profile } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import { Suspense } from 'react'

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: { username: string }
  searchParams: { status?: string; sort?: string }
}) {
  if (!searchParams.status) redirect(`/users/${encodeURIComponent(params.username)}?status=completed`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single() as { data: Profile | null }

  if (!profile) notFound()

  const isOwner = user?.id === profile.id

  const status = searchParams.status === 'all' ? undefined : searchParams.status
  const sort = searchParams.sort ?? 'created_at'
  const sortAsc = sort === 'title'

  let query = supabase
    .from('games')
    .select('*')
    .eq('user_id', profile.id)
    .order(sort, { ascending: sortAsc, nullsFirst: false })

  if (status) query = query.eq('status', status)

  const { data: games } = await query as { data: Game[] | null }

  // Summary counts (all games regardless of filter)
  const { data: allGames } = await supabase
    .from('games')
    .select('status, hours_played')
    .eq('user_id', profile.id) as { data: { status: string; hours_played: number | null }[] | null }

  const totalCompleted = allGames?.filter(g => g.status === 'completed').length ?? 0
  const totalPlaying = allGames?.filter(g => g.status === 'playing').length ?? 0
  const totalBacklog = allGames?.filter(g => g.status === 'backlog').length ?? 0
  const totalHours = allGames?.reduce((sum, g) => sum + (g.hours_played ?? 0), 0) ?? 0

  const initials = (profile.display_name ?? profile.username)
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg flex-shrink-0 dark:bg-brand-900/40 dark:text-brand-300">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-fg-base">
              {profile.display_name ?? profile.username}
            </h1>
            <span className="flex items-center gap-1.5 text-sm font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-full px-3 py-0.5 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300">
              🎟️ {profile.ticket_balance}
            </span>
          </div>
          <p className="text-sm text-fg-subtle mt-0.5">@{profile.username}</p>

          {/* Stats row */}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-fg-muted">
            <span><span className="font-semibold text-fg-secondary">{totalCompleted}</span> completed</span>
            <span><span className="font-semibold text-fg-secondary">{totalPlaying}</span> playing</span>
            <span><span className="font-semibold text-fg-secondary">{totalBacklog}</span> backlog</span>
            {totalHours > 0 && (
              <span><span className="font-semibold text-fg-secondary">{totalHours.toLocaleString()}h</span> played</span>
            )}
          </div>
        </div>
      </div>

      <Suspense>
        <GameFilters />
      </Suspense>

      {games && games.length > 0 ? (
        <GameListView games={games} status={searchParams.status} isOwner={isOwner} />
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎮</p>
          <p className="font-medium text-fg-secondary">No games found</p>
          <p className="text-sm mt-1">
            {status
              ? `${profile.display_name ?? profile.username} has no games with status "${status}"`
              : `${profile.display_name ?? profile.username} hasn't added any games yet`}
          </p>
        </div>
      )}

      <Link href="/users" className="inline-block text-sm text-fg-subtle hover:text-fg-secondary transition-colors">
        ← Back to Friends
      </Link>
    </div>
  )
}
