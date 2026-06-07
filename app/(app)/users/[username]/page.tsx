import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Game, Profile } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import GameCard from '@/components/games/GameCard'
import { Suspense } from 'react'


function StatPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1 bg-surface-elevated border border-edge-base rounded-full text-sm text-fg-secondary">
      {children}
    </span>
  )
}

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: { username: string }
  searchParams: { status?: string; sort?: string; view?: string; q?: string }
}) {
  if (!searchParams.status) redirect(`/users/${encodeURIComponent(params.username)}?status=completed`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, username, ticket_balance, accent_colour, wheel_turn')
    .eq('username', params.username)
    .single() as { data: Profile | null }

  if (!profile) notFound()

  const isOwner = user?.id === profile.id

  const status = searchParams.status === 'all' ? undefined : searchParams.status
  const sort = searchParams.sort ?? 'completion_date'
  const sortAsc = sort === 'title'

  let gamesQuery = supabase
    .from('games')
    .select('*')
    .eq('user_id', profile.id)
    .order(sort, { ascending: sortAsc, nullsFirst: false })

  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf')
  if (searchParams.q?.trim()) gamesQuery = (gamesQuery as any).or(`title.ilike.%${searchParams.q.trim()}%,developer.ilike.%${searchParams.q.trim()}%`)

  const [gamesRes, allGamesRes, playingGamesRes] = await Promise.all([
    gamesQuery,
    supabase
      .from('games')
      .select('status, hours_played')
      .eq('user_id', profile.id),
    supabase
      .from('games')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'playing')
      .order('created_at', { ascending: false })
      .limit(2),
  ])

  const games = gamesRes.data as Game[] | null
  const allGames = allGamesRes.data as { status: string; hours_played: number | null }[] | null
  const playingGames = playingGamesRes.data as Game[] | null

  const totalCompleted = allGames?.filter(g => g.status === 'completed').length ?? 0
  const totalPlaying   = allGames?.filter(g => g.status === 'playing').length ?? 0
  const totalBacklog   = allGames?.filter(g => g.status === 'backlog').length ?? 0
  const totalHours     = allGames?.reduce((sum, g) => sum + (g.hours_played ?? 0), 0) ?? 0

  const initials = (profile.display_name ?? profile.username)
    .split(' ')
    .slice(0, 2)
    .map((w: string) => w[0])
    .join('')
    .toUpperCase()

  const accentColour = profile.accent_colour ?? '#7c3aed'
  const bannerStyle = {
    background: `linear-gradient(135deg, ${accentColour}cc 0%, ${accentColour}44 100%)`,
  }

  return (
    <div className="space-y-6">
      {/* Hero card */}
      <div className="bg-surface-base border border-edge-base rounded-xl overflow-visible">
        {/* Banner */}
        <div className="h-36 rounded-t-xl" style={bannerStyle} />

        {/* Avatar — overlaps banner with negative margin */}
        <div className="px-6">
          <div
            className="w-24 h-24 rounded-full border-4 border-surface-base flex items-center justify-center text-3xl font-bold text-white -mt-12 select-none"
            style={{ backgroundColor: accentColour }}
          >
            {initials}
          </div>
        </div>

        {/* Name + stats */}
        <div className="px-6 pt-3 pb-6">
          <h1 className="text-2xl font-bold text-fg-base">
            {profile.display_name ?? profile.username}
          </h1>
          <p className="text-sm text-fg-muted mt-0.5">@{profile.username}</p>

          <div className="flex flex-wrap gap-2 mt-4">
            <StatPill>🎟️ {profile.ticket_balance}</StatPill>
            <StatPill>{totalCompleted} completed</StatPill>
            {totalPlaying > 0 && <StatPill>{totalPlaying} playing</StatPill>}
            {totalBacklog > 0 && <StatPill>{totalBacklog} in backlog</StatPill>}
            {totalHours > 0 && <StatPill>{totalHours.toLocaleString()}h played</StatPill>}
            {profile.wheel_turn && (
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${
                profile.wheel_turn === 'spin'        ? 'bg-brand-100 text-brand-700 border-brand-200 dark:bg-brand-900/40 dark:text-brand-300 dark:border-brand-700' :
                profile.wheel_turn === 'spin_reroll' ? 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' :
                                                       'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700'
              }`}>
                🎡 {profile.wheel_turn === 'spin' ? 'Spin turn' : profile.wheel_turn === 'spin_reroll' ? 'Spin + Reroll turn' : 'Choose turn'}
              </span>
            )}
          </div>
        </div>
      </div>

      {playingGames && playingGames.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
            Now Playing · {playingGames.length}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {playingGames.map(game => (
              <GameCard key={game.id} game={game} isOwner={isOwner} />
            ))}
          </div>
        </div>
      )}

      <Suspense>
        <GameFilters />
      </Suspense>

      {games && games.length > 0 ? (
        <GameListView games={games} status={searchParams.status} isOwner={isOwner} view={(searchParams.view ?? cookies().get('gameView')?.value) === 'table' ? 'table' : 'grid'} />
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎮</p>
          <p className="font-medium text-fg-secondary">No games found</p>
          <p className="text-sm mt-1">
            {status
              ? `${profile.display_name ?? profile.username} has no ${status} games`
              : `${profile.display_name ?? profile.username} hasn't added any games yet`}
          </p>
        </div>
      )}
    </div>
  )
}
