import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { getProfileForPage } from '@/lib/data/profile-page'
import { computeUserStats } from '@/lib/user-stats'
import { getLiveSessions } from '@/lib/presence'
import { FEATURES } from '@/lib/edition'
import { ilikeAnyFilter } from '@/lib/query-escape'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import FriendButton from '@/components/friends/FriendButton'
import PrivateProfile from '@/components/friends/PrivateProfile'
import ProfileCard from '@/components/profile/v2/ProfileCard'
import ProfileTabs from '@/components/profile/v2/ProfileTabs'
import { profileFigures } from '@/components/profile/v2/ProfileOverview'

/**
 * A person's games list, on its own tab of their profile (public edition;
 * the friends edition keeps the list on the profile itself, so this is not
 * found there). The same list, filters and views as before.
 */
export default async function UserGamesPage(
  props: {
    params: Promise<{ username: string }>
    searchParams: Promise<{ status?: string; sort?: string; view?: string; q?: string }>
  }
) {
  if (!FEATURES.newProfile) notFound()
  const searchParams = await props.searchParams
  const params = await props.params

  const { supabase, user, profile, isOwner, relation, allows, name, initials, accent } = await getProfileForPage(params.username, '/games')
  const friendButton = FEATURES.friendSystem && user && !isOwner
    ? <FriendButton personId={profile.id} username={profile.username} name={name} relation={relation} onDark />
    : null

  if (!allows('privacy_profile')) {
    return (
      <PrivateProfile
        name={name}
        username={profile.username}
        initials={initials}
        accent={accent}
        xp={profile.xp ?? 0}
        friendButton={friendButton}
      />
    )
  }

  const seesGames = allows('privacy_games')

  // Defaults to Completed in place rather than redirecting, as on My Games.
  const selectedStatus = searchParams.status ?? 'completed'
  const status = selectedStatus === 'all' ? undefined : selectedStatus
  const sort = searchParams.sort ?? (status === 'backlog' ? 'created_at' : 'completion_date')
  const sortAsc = sort === 'title'

  let gamesQuery = supabase
    .from('games')
    .select('*')
    .eq('user_id', profile.id)
    .order(sort, { ascending: sortAsc, nullsFirst: false })
  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf' | 'ambient')
  if (searchParams.q?.trim()) gamesQuery = (gamesQuery as any).or(ilikeAnyFilter(['title', 'developer'], searchParams.q.trim()))

  const [gamesRes, stats, liveSessions] = await Promise.all([
    seesGames ? gamesQuery : Promise.resolve({ data: [] as Game[] }),
    computeUserStats(supabase, profile.id),
    getLiveSessions(supabase, [profile.id]),
  ])
  const games = gamesRes.data as Game[] | null
  const figures = seesGames ? profileFigures(stats) : null

  const rawView = searchParams.view ?? (await cookies()).get('gameView')?.value
  // Box Art (portrait) is the default view; explicit grid/table choices are honoured.
  const view: 'grid' | 'table' | 'cover' = rawView === 'grid' || rawView === 'table' ? rawView : 'cover'

  return (
    <div className="space-y-5">
      <ProfileCard
        name={name}
        username={profile.username}
        initials={initials}
        accent={accent}
        xp={profile.xp ?? 0}
        bio={profile.bio ? <p className="max-w-xl text-sm leading-relaxed text-white/90 break-words">{profile.bio}</p> : null}
        figures={figures}
        action={friendButton}
      />
      <ProfileTabs username={profile.username} active="games" gameCount={figures?.games ?? null} />

      {!seesGames ? (
        <div className="rounded-2xl border border-edge-base bg-surface-base px-6 py-10 text-center">
          <p className="font-medium text-fg-secondary">{name}’s games list is private</p>
          <p className="mt-1 text-sm text-fg-muted">
            {profile.privacy_games === 'friends' ? 'Only their friends can see it.' : 'Only they can see it.'}
          </p>
        </div>
      ) : (
        <div>
          <Suspense>
            <GameFilters />
          </Suspense>
          <div className="mt-4">
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
          </div>
        </div>
      )}
    </div>
  )
}
