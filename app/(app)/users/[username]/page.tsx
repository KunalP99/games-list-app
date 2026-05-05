import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Game, Profile } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import GameCard from '@/components/games/GameCard'
import { Suspense } from 'react'

type RawRecommendation = {
  title: string
  genres: string[] | null
  rating: number | null
  image_url: string | null
  developer: string | null
}

function computeRecommendations(
  friendGames: RawRecommendation[],
  myTitles: Set<string>,
  myGenreCounts: Record<string, number>,
): (RawRecommendation & { score: number })[] {
  return friendGames
    .filter(g => !myTitles.has(g.title.trim().toLowerCase()))
    .filter(g => g.rating == null || g.rating >= 3)
    .map(g => {
      const base = g.rating ?? 3
      const bonus = (g.genres ?? []).reduce((s, genre) => s + (myGenreCounts[genre] ?? 0) * 0.5, 0)
      return { ...g, score: base + bonus }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

function RecommendationCard({ game }: { game: RawRecommendation }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden flex flex-col">
      {game.image_url
        ? <img src={game.image_url} alt={game.title} className="w-full h-28 object-cover" />
        : <div className="w-full h-28 bg-surface-active flex items-center justify-center text-2xl">🎮</div>
      }
      <div className="p-3 space-y-0.5">
        <p className="text-sm font-semibold text-fg-base leading-tight">{game.title}</p>
        {game.developer && <p className="text-xs text-fg-muted">{game.developer}</p>}
        <div className="flex items-center justify-between pt-1 flex-wrap gap-1">
          {game.rating != null && <span className="text-xs text-fg-subtle">⭐ {game.rating}/5</span>}
          {game.genres?.[0] && <span className="text-xs text-fg-subtle">{game.genres[0]}</span>}
        </div>
      </div>
    </div>
  )
}

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
  searchParams: { status?: string; sort?: string; view?: string }
}) {
  if (!searchParams.status) redirect(`/users/${encodeURIComponent(params.username)}?status=completed`)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, username, ticket_balance, accent_colour')
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

  if (status) query = query.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf')

  const { data: games } = await query as { data: Game[] | null }

  const { data: allGames } = await supabase
    .from('games')
    .select('status, hours_played')
    .eq('user_id', profile.id) as { data: { status: string; hours_played: number | null }[] | null }

  const { data: playingGames } = await supabase
    .from('games')
    .select('*')
    .eq('user_id', profile.id)
    .eq('status', 'playing')
    .order('created_at', { ascending: false })
    .limit(2) as { data: Game[] | null }

  const [friendCompletedRes, myGamesRes] = !isOwner
    ? await Promise.all([
        supabase
          .from('games')
          .select('title, genres, rating, image_url, developer')
          .eq('user_id', profile.id)
          .eq('status', 'completed'),
        supabase
          .from('games')
          .select('title, genres, status')
          .eq('user_id', user!.id),
      ])
    : [null, null]

  const myTitles = new Set((myGamesRes?.data ?? []).map((g: { title: string }) => g.title.trim().toLowerCase()))
  const myGenreCounts: Record<string, number> = {}
  for (const g of myGamesRes?.data ?? []) {
    if ((g as { status: string }).status !== 'completed') continue
    for (const genre of (g as { genres: string[] | null }).genres ?? []) {
      myGenreCounts[genre] = (myGenreCounts[genre] ?? 0) + 1
    }
  }
  const recommendations = isOwner ? [] : computeRecommendations(friendCompletedRes?.data ?? [], myTitles, myGenreCounts)

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

      {recommendations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider">
            Games you might like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {recommendations.map((g, i) => (
              <RecommendationCard key={i} game={g} />
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
