import { cookies } from 'next/headers'
import { getProfileForPage } from '@/lib/data/profile-page'
import ProfileOverview from '@/components/profile/v2/ProfileOverview'
import ProfileGames from '@/components/profile/v2/ProfileGames'
import { computeUserStats } from '@/lib/user-stats'
import { resolveBannerImage } from '@/lib/hero-banner'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import ProfileHero from '@/components/profile/ProfileHero'
import { getCurrentStreak } from '@/lib/data/current-streak'
import NowPlayingGrid from '@/components/profile/NowPlayingGrid'
import RecentlyPlayed from '@/components/games/RecentlyPlayed'
import { getPlayingStrips } from '@/lib/recently-played'
import { getLiveSessions } from '@/lib/presence'
import { Suspense } from 'react'
import { FEATURES } from '@/lib/edition'
import { ilikeAnyFilter } from '@/lib/query-escape'
import FriendButton from '@/components/friends/FriendButton'
import PrivateProfile from '@/components/friends/PrivateProfile'

export default async function UserProfilePage(
  props: {
    params: Promise<{ username: string }>
    searchParams: Promise<{ status?: string; sort?: string; view?: string; q?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { supabase, user, profile, isOwner, relation, allows, name, initials, accent } = await getProfileForPage(params.username)
  const friendButton = FEATURES.friendSystem && user && !isOwner
    ? <FriendButton personId={profile.id} username={profile.username} name={name} relation={relation} />
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

  // Public edition: the profile you make your own (cards), then the games list.
  if (FEATURES.newProfile) {
    return (
      <div className="space-y-5">
      <ProfileOverview
        profile={{ id: profile.id, username: profile.username, xp: profile.xp ?? 0, bio: profile.bio ?? null, profile_layout: profile.profile_layout }}
        name={name}
        initials={initials}
        accent={accent}
        isOwner={isOwner}
        allows={allows}
        friendButton={friendButton && <FriendButton personId={profile.id} username={profile.username} name={name} relation={relation} onDark />}
      />
      <ProfileGames
        userId={profile.id}
        name={name}
        isOwner={isOwner}
        allowed={allows('privacy_games')}
        privateTo={profile.privacy_games}
        searchParams={searchParams}
      />
      </div>
    )
  }

  // Defaults to Completed in place rather than redirecting — see the same
  // change on app/(app)/games/page.tsx for why.
  const selectedStatus = searchParams.status ?? 'completed'
  const status = selectedStatus === 'all' ? undefined : selectedStatus
  const sort = searchParams.sort ?? (status === 'backlog' ? 'created_at' : 'completion_date')
  const sortAsc = sort === 'title'

  let gamesQuery = supabase
    .from('games')
    .select('*')
    .eq('user_id', profile.id)
    .order(sort, { ascending: sortAsc, nullsFirst: false })

  if (status) {
    gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf' | 'ambient')
  } else {
    // Matches My Games: Playing and Ambient each have their own section, so
    // the untabbed list is everything else. Only for "All" — AND-ing this
    // onto an explicit `status=ambient` tab contradicts the eq() above and
    // always returns nothing, which is what was making that tab empty.
    // Without Ambient there's no Now Playing either, so "All" is everything.
    if (FEATURES.ambient) gamesQuery = gamesQuery.not('status', 'in', '("playing","ambient")')
  }
  if (searchParams.q?.trim()) gamesQuery = (gamesQuery as any).or(ilikeAnyFilter(['title', 'developer'], searchParams.q.trim()))

  const [gamesRes, stats, strips, liveSessions, streak] = await Promise.all([
    gamesQuery,
    computeUserStats(supabase, profile.id),
    getPlayingStrips(supabase, profile.id),
    getLiveSessions(supabase, [profile.id]),
    // The banner's streak flame: the Cinematic banner only, and only when
    // their play activity is visible (always, in the friends edition).
    FEATURES.cinematicBanner && allows('privacy_activity') ? getCurrentStreak(supabase, profile.id) : Promise.resolve(0),
  ])

  const games = gamesRes.data as Game[] | null

  // Depends on stats.heroGame, so it can't join the Promise.all above; it may
  // fetch the game's screenshots live (lib/hero-banner.ts), bounded by that
  // call's own timeout.
  const bannerImage = stats.heroGame ? await resolveBannerImage(stats.heroGame) : null

  const rawView = searchParams.view ?? (await cookies()).get('gameView')?.value
  // Box Art (portrait) is the default view; explicit grid/table choices are honoured.
  const view: 'grid' | 'table' | 'cover' = rawView === 'grid' || rawView === 'table' ? rawView : 'cover'


  return (
    <div className="space-y-6">
      {friendButton && <div className="flex justify-end -mb-3">{friendButton}</div>}
      <ProfileHero
        stats={stats}
        bannerImage={bannerImage}
        initials={initials}
        accent={accent}
        wheelTurn={null}
        showTickets={allows('privacy_tickets')}
        streak={streak}
      />

      {/* Everything runs full width in a single column. An earlier version put
          the stat cards in a right-hand rail, but the grid row was then as tall
          as the rail, leaving a large gap above the games list whenever the
          content beside it was shorter. */}
      {/* No Now Playing in the public edition: Recently played covers it (lib/edition.ts). */}
      {/* Friends edition: the Main Game, the Playing games the wheel picked. */}
      {FEATURES.mainGame && <NowPlayingGrid heading="Main Game" games={strips.mainGames} isOwner={isOwner} liveSessions={liveSessions} />}

      {allows('privacy_activity') && (
        <RecentlyPlayed heading={FEATURES.mainGame ? 'Playing' : undefined} games={strips.playing} liveSessions={liveSessions} isOwner={isOwner} />
      )}

      {!allows('privacy_games') ? (
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
                {status
                  ? `${profile.display_name ?? profile.username} has no ${status} games`
                  : `${profile.display_name ?? profile.username} hasn't added any games yet`}
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
