import Link from 'next/link'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { computeUserStats } from '@/lib/user-stats'
import { resolveBannerImage } from '@/lib/hero-banner'
import type { Game } from '@/lib/types'
import GameListView from '@/components/games/GameListView'
import GameCard from '@/components/games/GameCard'
import GameFilters from '@/components/games/GameFilters'
import RecentlyPlayed from '@/components/games/RecentlyPlayed'
import { getRecentlyPlayed } from '@/lib/recently-played'
import ProfileHero from '@/components/profile/ProfileHero'
import { Suspense } from 'react'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { status?: string; sort?: string; q?: string; view?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Default to Completed in place rather than redirecting. /games used to bounce
  // to /games?status=completed&sort=completion_date, which cost a second server
  // round trip on the app's commonest navigation — and the loading skeleton
  // behaved unpredictably across that bounce, leaving a blank gap instead of
  // staying up until the list was ready.
  const selectedStatus = searchParams.status ?? 'completed'
  const status = selectedStatus === 'all' ? undefined : selectedStatus
  const sort = searchParams.sort ?? (status === 'backlog' ? 'created_at' : 'completion_date')
  const sortAsc = sort === 'title'
  const sortDesc = sort === 'completion_date' || sort === 'created_at' || sort === 'rating' || sort === 'hours_played'
  const q = searchParams.q?.trim()

  const STATUS_ORDER: Record<string, number> = { backlog: 0, completed: 1, dnf: 2, ambient: 3 }

  const GAME_LIST_COLS = 'id, title, status, hours_played, achievement_progress, rating, completion_date, completion_date_precision, release_date, release_date_precision, created_at, updated_at, image_url, cover_image_url, artwork_url, developer, platform, genres, rawg_id, is_favourite, is_replay, is_sequel, dominant_color, start_date, steam_deck'

  const rawView = searchParams.view ?? cookies().get('gameView')?.value
  // Box Art (portrait) is the default view; explicit grid/table choices are honoured.
  const view: 'grid' | 'table' | 'cover' = rawView === 'grid' || rawView === 'table' ? rawView : 'cover'

  let gamesQuery = supabase
    .from('games')
    .select(GAME_LIST_COLS)
    .eq('user_id', user!.id)
    // Both of these have a section of their own above the list, so "All"
    // means "everything else" rather than literally everything.
    .not('status', 'in', '("playing","ambient")')
    .order(sort === 'status' ? 'created_at' : sort, { ascending: !sortDesc, nullsFirst: false })

  if (status) gamesQuery = gamesQuery.eq('status', status as 'playing' | 'completed' | 'backlog' | 'dnf' | 'ambient')
  if (q) gamesQuery = gamesQuery.or(`title.ilike.%${q}%,developer.ilike.%${q}%`)

  // Playing games always fetched separately for the Now Playing strip — run
  // alongside the main games query and the profile-banner stats (computeUserStats
  // is the same helper the friend profile page uses — see lib/user-stats.ts).
  const [playingGamesRes, gamesRes, stats, recentlyPlayed] = await Promise.all([
    supabase
      .from('games')
      .select(GAME_LIST_COLS)
      .eq('user_id', user!.id)
      .eq('status', 'playing')
      .order('created_at', { ascending: false }),
    gamesQuery,
    computeUserStats(supabase, user!.id),
    getRecentlyPlayed(supabase, user!.id),
  ])

  const playingGames = playingGamesRes.data as Game[] | null
  let games = gamesRes.data as Game[] | null

  if (sort === 'status' && games) {
    games = [...games].sort((a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3))
  }

  // The banner image needs a live IGDB screenshot lookup, and it depends on
  // stats.heroGame so it can't join the Promise.all above. Awaiting it here
  // held up the entire page — list included — for one decorative backdrop, so
  // it now streams in behind Suspense (see HeroWithBanner at the foot of this
  // file).

  // Same initials logic as the friend profile page (app/(app)/users/[username]/page.tsx) —
  // only letters/digits start an initial, so "Alex (test)" doesn't render as "A(".
  const displayName = stats.profile.display_name ?? stats.profile.username
  const initials = displayName
    .split(/[\s_-]+/)
    .map((w: string) => w.replace(/^[^0-9A-Za-zÀ-ɏ]+/, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
  const accent = stats.profile.accent_colour ?? '#7c3aed'

  return (
    <div className="space-y-6">
      {/* Fallback is the same hero minus the backdrop, so nothing moves when
          the image arrives — only the texture behind it changes. */}
      <Suspense fallback={<ProfileHero stats={stats} bannerImage={null} initials={initials} accent={accent} wheelTurn={null} />}>
        <HeroWithBanner stats={stats} initials={initials} accent={accent} />
      </Suspense>

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
            href={`/games/new?status=${selectedStatus}`}
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
          {/* Now Playing always uses the capsule card, regardless of the list view */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {playingGames.map(game => (
              <GameCard key={game.id} game={game} isOwner={true} />
            ))}
          </div>
        </div>
      )}

      {/* Ambient games, newest session first — what has actually been running,
          as opposed to what was deliberately picked up above. */}
      <RecentlyPlayed games={recentlyPlayed} isOwner={true} />

      <Suspense>
        <GameFilters />
      </Suspense>

      {games && games.length > 0 ? (
        <GameListView games={games} status={selectedStatus} isOwner={true} view={view} />
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

/**
 * The hero with its backdrop resolved. Split out so the IGDB screenshot
 * lookup happens inside a Suspense boundary rather than blocking the page:
 * the list and everything else render immediately, and the backdrop fades in
 * when it arrives.
 */
async function HeroWithBanner({
  stats,
  initials,
  accent,
}: {
  stats: Awaited<ReturnType<typeof computeUserStats>>
  initials: string
  accent: string
}) {
  const bannerImage = stats.heroGame ? await resolveBannerImage(stats.heroGame) : null
  return <ProfileHero stats={stats} bannerImage={bannerImage} initials={initials} accent={accent} wheelTurn={null} />
}
