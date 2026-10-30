import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeUserStats } from '@/lib/user-stats'
import { resolveBannerImage } from '@/lib/hero-banner'
import { buildActivityItems, type RawAchievementUnlock } from '@/lib/activity'
import { ACHIEVEMENTS } from '@/lib/achievements'
import type { Game, Profile } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameFilters from '@/components/games/GameFilters'
import ProfileHero from '@/components/profile/ProfileHero'
import ProfileStatCards from '@/components/profile/ProfileStatCards'
import NowPlayingGrid from '@/components/profile/NowPlayingGrid'
import RecentlyPlayed from '@/components/games/RecentlyPlayed'
import { getRecentlyPlayed } from '@/lib/recently-played'
import { getLiveSessions } from '@/lib/presence'
import { Suspense } from 'react'

export default async function UserProfilePage({
  params,
  searchParams,
}: {
  params: { username: string }
  searchParams: { status?: string; sort?: string; view?: string; q?: string }
}) {


  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, username, ticket_balance, accent_colour, wheel_turn, wheel_enabled')
    .eq('username', params.username)
    .single() as { data: Profile | null }

  if (!profile) notFound()

  const isOwner = user?.id === profile.id

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
    // Matches My Games: Playing and Ambient each have their own section, so
    // the list below is everything else. Without this, the untabbed "All"
    // view here would quietly differ from the owner's own page.
    .not('status', 'in', '("playing","ambient")')
    .order(sort, { ascending: sortAsc, nullsFirst: false })

  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf' | 'ambient')
  if (searchParams.q?.trim()) gamesQuery = (gamesQuery as any).or(`title.ilike.%${searchParams.q.trim()}%,developer.ilike.%${searchParams.q.trim()}%`)

  const [gamesRes, playingGamesRes, recentGamesRes, recentSpinsRes, recentUnlocksRes, stats, recentlyPlayed, liveSessions] = await Promise.all([
    gamesQuery,
    supabase
      .from('games')
      .select('*')
      .eq('user_id', profile.id)
      .eq('status', 'playing')
      // Most recently picked up first. `start_date` is what actually records
      // when a game became "playing" (the wheel stamps it on assignment, and
      // the form asks for it), so it leads; `created_at` breaks ties and covers
      // games with no start date, which sort last.
      .order('start_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    // For the Recent Activity card — same shape lib/activity.ts's shared
    // buildActivityItems() expects, mirroring app/(app)/activity/page.tsx.
    supabase
      .from('games')
      .select('id, user_id, title, status, image_url, cover_image_url, completion_date, created_at, updated_at, hours_played, achievement_progress')
      .eq('user_id', profile.id)
      .order('updated_at', { ascending: false })
      .limit(20),
    supabase
      .from('wheel_spins')
      .select('id, user_id, spin_type, result_name, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(10),
    (supabase.from('user_achievements') as any)
      .select('achievement_id, unlocked_at')
      .eq('user_id', profile.id)
      .order('unlocked_at', { ascending: false })
      .limit(10),
    computeUserStats(supabase, profile.id),
    getRecentlyPlayed(supabase, profile.id),
    getLiveSessions(supabase, [profile.id]),
  ])

  const games = gamesRes.data as Game[] | null
  const playingGames = (playingGamesRes.data ?? []) as Game[]

  type RecentGameRow = { id: string; user_id: string; title: string; status: string; image_url: string | null; cover_image_url: string | null; completion_date: string | null; created_at: string; updated_at: string; hours_played: number | null; achievement_progress: number | null }
  const recentGames = (recentGamesRes.data ?? []) as RecentGameRow[]
  const completedIds = recentGames.filter(g => g.status === 'completed').map(g => g.id)

  // Depends on stats.heroGame and completedIds, so this second wave can't join
  // the Promise.all above — bannerImage may fetch the game's screenshots live
  // (lib/hero-banner.ts), bounded by that call's own timeout.
  const [bannerImage, ticketRowsRes] = await Promise.all([
    stats.heroGame ? resolveBannerImage(stats.heroGame) : Promise.resolve(null),
    completedIds.length > 0
      ? supabase.from('ticket_transactions').select('game_id, amount').in('game_id', completedIds).gt('amount', 0)
      : Promise.resolve({ data: [] as { game_id: string; amount: number }[] }),
  ])

  const ticketsByGame = ((ticketRowsRes.data ?? []) as { game_id: string; amount: number }[]).reduce<Record<string, number>>((acc, r) => {
    acc[r.game_id] = (acc[r.game_id] ?? 0) + r.amount
    return acc
  }, {})

  const achievementLookup = new Map(ACHIEVEMENTS.map(a => [a.id, a]))
  const recentUnlocks = (recentUnlocksRes.data ?? []) as { achievement_id: string; unlocked_at: string }[]
  const achievementUnlocks: RawAchievementUnlock[] = recentUnlocks.flatMap(r => {
    const ach = achievementLookup.get(r.achievement_id)
    if (!ach) return []
    return [{ user_id: profile.id, achievement_id: r.achievement_id, achievement_name: ach.name, achievement_icon: ach.icon, xp: ach.xp, unlocked_at: r.unlocked_at }]
  })

  const profileMap = new Map([[profile.id, {
    displayName: profile.display_name ?? profile.username,
    username: profile.username,
    accentColour: profile.accent_colour ?? null,
  }]])
  type RecentSpinRow = { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }
  const recentSpins = (recentSpinsRes.data ?? []) as RecentSpinRow[]
  // A generous buffer — ProfileStatCards decides how many are actually
  // shown (currently 4, to sit level with the genre card next to it).
  const activityItems = buildActivityItems(recentGames, recentSpins, profileMap, ticketsByGame, user?.id ?? '', achievementUnlocks).slice(0, 12)

  const rawView = searchParams.view ?? cookies().get('gameView')?.value
  // Box Art (portrait) is the default view; explicit grid/table choices are honoured.
  const view: 'grid' | 'table' | 'cover' = rawView === 'grid' || rawView === 'table' ? rawView : 'cover'

  // Only letters/digits start an initial — a display name like "Alex (test)"
  // would otherwise render as "A(".
  const initials = (profile.display_name ?? profile.username)
    .split(/[\s_-]+/)
    // Strip leading punctuation so a word like "(test)" contributes "t", not "(".
    // No \p{…} escapes here — the TS target predates the `u` flag.
    .map((w: string) => w.replace(/^[^0-9A-Za-zÀ-ɏ]+/, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  // Their accent, never the viewer's — `brand-*` classes resolve to whoever is
  // logged in, so the friend's colour is always passed down as a value.
  const accent = profile.accent_colour ?? '#7c3aed'

  // Someone who's opted out of wheel turns in Settings doesn't advertise one.
  // Accounts predating the column read as opted in.
  const wheelTurnBadge = (profile.wheel_enabled ?? true) ? (profile.wheel_turn ?? null) : null

  return (
    <div className="space-y-6">
      <ProfileHero
        stats={stats}
        bannerImage={bannerImage}
        initials={initials}
        accent={accent}
        wheelTurn={wheelTurnBadge}
      />

      {/* Everything runs full width in a single column. An earlier version put
          the stat cards in a right-hand rail, but the grid row was then as tall
          as the rail, leaving a large gap above the games list whenever the
          content beside it was shorter. */}
      <NowPlayingGrid games={playingGames} isOwner={isOwner} liveSessions={liveSessions} />

      <RecentlyPlayed games={recentlyPlayed} isOwner={isOwner} liveSessions={liveSessions} />

      <ProfileStatCards genreData={stats.genreData} accent={accent} activityItems={activityItems} />

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
    </div>
  )
}
