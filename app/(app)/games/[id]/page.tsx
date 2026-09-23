import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import { getRawgScreenshots, getRawgAchievements, getGameExtras, getDeveloperGames, providerIdOf, EMPTY_GAME_EXTRAS } from '@/lib/rawg'
import type { RawgScreenshot, RawgAchievement, DeveloperGamesInfo } from '@/lib/rawg'
import GameAbout from '@/components/games/GameAbout'
import { getSteamReviewSummary, steamReviewBadge } from '@/lib/steam'
import DeveloperGames from '@/components/games/DeveloperGames'
import StatusBadge from '@/components/games/StatusBadge'
import DeleteGameButton from '@/components/games/DeleteGameButton'
import MarkCompletedButton from '@/components/games/MarkCompletedButton'
import MarkDnfButton from '@/components/games/MarkDnfButton'
import AchievementGrid from '@/components/games/AchievementGrid'
import AddToBacklogButton from '@/components/users/AddToBacklogButton'
import GameVideos from '@/components/games/GameVideos'
import PlayedByCard from '@/components/games/PlayedByCard'
import { mapGameVideos } from '@/lib/youtube'

export default async function GameDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', params.id)
    .single() as { data: Game | null }

  if (!game) notFound()

  const isOwner = game.user_id === user?.id

  const { data: ownerProfile } = !isOwner
    ? await supabase
        .from('profiles')
        .select('display_name, username, accent_colour')
        .eq('id', game.user_id)
        .single() as { data: { display_name: string | null; username: string; accent_colour: string | null } | null }
    : { data: null }

  const dlcEntries = (((game as any).dlc ?? []) as { name: string; rawg_id: number | null; owned: boolean; removed?: boolean }[])
    .filter(d => !d.removed)

  const [{ data: sameGames }, screenshots, achievements, extras, developerGames, { data: otherPlayers }] = await Promise.all([
    supabase
      .from('games')
      .select('id, created_at')
      .eq('user_id', game.user_id)
      .ilike('title', game.title)
      .order('created_at', { ascending: true }) as unknown as Promise<{ data: { id: string; created_at: string }[] | null }>,
    providerIdOf(game) ? getRawgScreenshots(providerIdOf(game)!) : Promise.resolve([] as RawgScreenshot[]),
    providerIdOf(game) ? getRawgAchievements(providerIdOf(game)!) : Promise.resolve([] as RawgAchievement[]),
    providerIdOf(game) ? getGameExtras(providerIdOf(game)!) : Promise.resolve(EMPTY_GAME_EXTRAS),
    providerIdOf(game) ? getDeveloperGames(providerIdOf(game)!) : Promise.resolve(null as DeveloperGamesInfo),
    // Other people who have this same game completed or in progress.
    supabase
      .from('games')
      .select('user_id, status')
      .neq('user_id', game.user_id)
      .in('status', ['completed', 'playing'])
      .ilike('title', game.title) as unknown as Promise<{ data: { user_id: string; status: 'completed' | 'playing' }[] | null }>,
  ])

  const totalPlaythroughs = sameGames?.length ?? 1
  const playthroughNumber = (sameGames?.findIndex(g => g.id === game.id) ?? 0) + 1

  const gameVideos = mapGameVideos(game.youtube_videos ?? [])

  const startDate = (game as any).start_date as string | null
  const completionDate = game.completion_date as string | null
  const showStartDate = Boolean(startDate) && game.status !== 'backlog'
  const showCompletionDate = Boolean(completionDate)
  const daysToComplete =
    game.status === 'completed' && startDate && completionDate && game.completion_date_precision === 'full'
      ? daysBetween(startDate, completionDate)
      : null

  // "Also played by" — dedupe to one entry per user (currently playing wins over
  // completed), then attach each user's profile for the display.
  const playerInfo = new Map<string, { completed: boolean; playing: boolean }>()
  for (const r of otherPlayers ?? []) {
    const cur = playerInfo.get(r.user_id) ?? { completed: false, playing: false }
    if (r.status === 'completed') cur.completed = true
    if (r.status === 'playing') cur.playing = true
    playerInfo.set(r.user_id, cur)
  }
  const playerIds = Array.from(playerInfo.keys())
  const { data: playerProfiles } = playerIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, username, accent_colour')
        .in('id', playerIds) as { data: { id: string; display_name: string | null; username: string; accent_colour: string | null }[] | null }
    : { data: [] }
  const playedBy = (playerProfiles ?? [])
    .map(pr => ({
      id: pr.id,
      username: pr.username,
      displayName: pr.display_name,
      accentColour: pr.accent_colour,
      status: (playerInfo.get(pr.id)?.playing ? 'playing' : 'completed') as 'playing' | 'completed',
    }))
    // Currently-playing users first, then alphabetical by display name.
    .sort((a, b) =>
      a.status === b.status
        ? (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username)
        : a.status === 'playing' ? -1 : 1,
    )
  // Steam's review verdict. Sequential rather than part of the Promise.all
  // above because the app id it needs arrives with `extras` — but it's a
  // keyless HTTP GET cached for a day, not another throttled IGDB call.
  const steamReview = steamReviewBadge(await getSteamReviewSummary(extras.steamAppId))

  const hasAboutExtras =
    extras.companies.length > 0 || extras.gameModes.length > 0 || extras.playerPerspectives.length > 0 ||
    extras.themes.length > 0 || Boolean(extras.franchise) || extras.engines.length > 0 ||
    extras.criticRating != null || extras.userRating != null || steamReview != null
  const hasAbout = Boolean(game.description) || hasAboutExtras
  const hasSidebar = hasAbout || playedBy.length > 0

  return (
    <div className="w-[min(70rem,calc(100vw-2rem))] space-y-6">
      {/* Owner attribution */}
      {!isOwner && ownerProfile && (
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          <div
            className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: ownerProfile.accent_colour ?? '#7c3aed' }}
          >
            {(ownerProfile.display_name ?? ownerProfile.username).split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()}
          </div>
          <span>
            From{' '}
            <Link
              href={`/users/${encodeURIComponent(ownerProfile.username)}`}
              className="font-medium text-fg-base hover:underline"
            >
              {ownerProfile.display_name ?? ownerProfile.username}
            </Link>
            's library
          </span>
        </div>
      )}

      {/* Hero — clean artwork banner (falls back to the screenshot) with the
          game info in a block below it, so most of the banner stays visible */}
      {(() => {
        const banner = game.artwork_url ?? game.image_url

        const meta = (
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-fg-base">{game.title}</h1>
              {game.is_favourite && (
                <span className="text-amber-400 text-xl leading-none" title="Favourite">★</span>
              )}
              <StatusBadge status={game.status} />
              {game.is_replay && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                  ↩ Replay
                </span>
              )}
              {game.is_sequel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-800">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg> Sequel
                </span>
              )}
            </div>
            {([game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).length > 0 || game.steam_deck) && (
              <p className="text-fg-muted text-sm flex items-center gap-1.5 flex-wrap">
                <span>{[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).join(' · ')}</span>
                {game.steam_deck && (
                  <>
                    {[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).length > 0 && (
                      <span aria-hidden>·</span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/steam-deck.png" alt="Steam Deck" title="Playing on Steam Deck" className="h-4 w-auto" />
                  </>
                )}
              </p>
            )}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {game.genres.map(genre => (
                  <span
                    key={genre}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface-active text-fg-secondary border border-edge-base"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
            {totalPlaythroughs > 1 && (
              <p className="text-xs text-fg-subtle mt-1">
                Playthrough {playthroughNumber} of {totalPlaythroughs}
              </p>
            )}
          </div>
        )

        // White version of the meta, overlaid on the banner.
        const overlayMeta = (
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-2xl font-bold text-white leading-tight drop-shadow">{game.title}</h1>
              {game.is_favourite && <span className="text-amber-400 text-xl leading-none" title="Favourite">★</span>}
              <StatusBadge status={game.status} />
              {game.is_replay && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white border border-white/25">
                  <span className="text-orange-400">↩</span> Replay
                </span>
              )}
              {game.is_sequel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white border border-white/25">
                  <svg className="w-3.5 h-3.5 text-violet-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg> Sequel
                </span>
              )}
            </div>
            {([game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).length > 0 || game.steam_deck) && (
              <p className="text-white/80 text-sm drop-shadow flex items-center gap-1.5 flex-wrap">
                <span>{[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).join(' · ')}</span>
                {game.steam_deck && (
                  <>
                    {[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).length > 0 && (
                      <span aria-hidden>·</span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/steam-deck.png" alt="Steam Deck" title="Playing on Steam Deck" className="h-4 w-auto drop-shadow" />
                  </>
                )}
              </p>
            )}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {game.genres.map(genre => (
                  <span key={genre} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white/90 border border-white/20">
                    {genre}
                  </span>
                ))}
              </div>
            )}
            {totalPlaythroughs > 1 && (
              <p className="text-xs text-white/60 mt-1.5 drop-shadow">
                Playthrough {playthroughNumber} of {totalPlaythroughs}
              </p>
            )}
          </div>
        )

        // Overlay actions (on the banner) — glass styling.
        const overlayActions = isOwner ? (
          <>
            {game.status === 'playing' && <MarkCompletedButton gameId={game.id} variant="detail" initialFavourite={game.is_favourite} />}
            {game.status === 'playing' && <MarkDnfButton gameId={game.id} />}
            <Link
              href={`/games/${game.id}/edit`}
              className="px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-black/60 transition-colors"
            >
              Edit
            </Link>
            <DeleteGameButton id={game.id} variant="overlay" />
          </>
        ) : (
          <AddToBacklogButton
            game={{ title: game.title, developer: game.developer, image_url: game.image_url, genres: game.genres, rawg_id: providerIdOf(game), release_date: game.release_date }}
            variant="glass"
          />
        )

        // Off-image actions (no banner) — normal styling.
        const inlineActions = isOwner ? (
          <>
            {game.status === 'playing' && <MarkCompletedButton gameId={game.id} variant="detail" initialFavourite={game.is_favourite} />}
            {game.status === 'playing' && <MarkDnfButton gameId={game.id} />}
            <Link
              href={`/games/${game.id}/edit`}
              className="px-3 py-1.5 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors"
            >
              Edit
            </Link>
            <DeleteGameButton id={game.id} />
          </>
        ) : (
          <AddToBacklogButton
            game={{ title: game.title, developer: game.developer, image_url: game.image_url, genres: game.genres, rawg_id: providerIdOf(game), release_date: game.release_date }}
            variant="outline"
          />
        )

        if (banner) {
          return (
            /* Break the banner out of the max-w-2xl column to fill the main
               content area (max-w-6xl = 72rem, minus the layout's px-4). */
            <div className="relative w-[min(70rem,calc(100vw-2rem))] aspect-[21/9] rounded-xl overflow-hidden shadow-md">
              <img src={banner} alt={game.title} className="w-full h-full object-cover object-center" />
              {/* Gradient: strong at the bottom for the overlaid info, clear up top */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />
              <div className="absolute top-3 right-3 flex items-center gap-2">{overlayActions}</div>
              <div className="absolute bottom-0 left-0 right-0 p-5">{overlayMeta}</div>
            </div>
          )
        }

        return (
          <div className="flex items-start justify-between gap-4">
            {meta}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">{inlineActions}</div>
          </div>
        )
      })()}

      {/* Body — main content on the left, About + "also played by" in a right sidebar */}
      <div className={hasSidebar ? 'grid grid-cols-1 lg:grid-cols-3 gap-6 items-start' : ''}>
      <div className={hasSidebar ? 'lg:col-span-2 space-y-6' : 'max-w-2xl space-y-6'}>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Hours Played" value={game.hours_played != null ? `${game.hours_played}h` : '—'} />
        <RatingStat rating={game.rating} />
        <AchievementStat progress={game.achievement_progress} />
      </div>

      {/* Dates — side by side when both are present, full width when only one is */}
      {(showStartDate || showCompletionDate) && (
        <div className={`grid gap-3 ${showStartDate && showCompletionDate ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
          {showStartDate && startDate && (
            <div className="bg-surface-base border border-edge-base rounded-xl p-4">
              <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-1">Date Started</p>
              <p className="text-fg-base text-sm">{formatDate(startDate, 'full')}</p>
            </div>
          )}

          {completionDate && (
            <div className="bg-surface-base border border-edge-base rounded-xl p-4">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">
                  {game.status === 'dnf' ? 'Date Dropped' : 'Completed'}
                </p>
                {daysToComplete != null && (
                  <p
                    className="text-xs text-fg-muted shrink-0"
                    title={`Took ${daysToComplete} ${daysToComplete === 1 ? 'day' : 'days'} to complete`}
                  >
                    Took <span className="text-brand-500 font-medium">{daysToComplete}</span> {daysToComplete === 1 ? 'day' : 'days'}
                  </p>
                )}
              </div>
              <p className="text-fg-base text-sm">
                {formatDate(completionDate, game.completion_date_precision)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* About + "also played by" (small screens) — shown right under Dates; the
          sidebar copies take over at lg+ */}
      {hasAbout && (
        <div className="lg:hidden">
          <GameAbout description={game.description} extras={extras} steamReview={steamReview} />
        </div>
      )}
      {playedBy.length > 0 && (
        <div className="lg:hidden">
          <PlayedByCard players={playedBy} />
        </div>
      )}

      {/* Review */}
      {game.review && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">
            {game.status === 'dnf' ? 'Reason' : 'Review'}
          </p>
          <p className="text-fg-secondary text-sm leading-relaxed whitespace-pre-wrap">{game.review}</p>
        </div>
      )}

      {/* Notes — public to everyone, private only to owner */}
      {game.notes && ((game as any).notes_public || isOwner) && (
        <div className="bg-surface-sunken border border-edge-base rounded-xl p-4">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">
            Notes <span className="normal-case font-normal">({(game as any).notes_public ? 'public' : 'private'})</span>
          </p>
          <p className="text-fg-secondary text-sm leading-relaxed whitespace-pre-wrap">{game.notes}</p>
        </div>
      )}

      {/* YouTube media — carousel / single card / legacy embed (reusable) */}
      <GameVideos videos={gameVideos} playlistUrl={game.youtube_playlist_url} />

      {/* Achievements — fetched live from RAWG */}
      {achievements.length > 0 && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Achievements</p>
            <span className="text-xs text-fg-subtle">{achievements.length} total</span>
          </div>
          <AchievementGrid achievements={achievements} />
        </div>
      )}

      {/* DLC & Expansions — stored on the game record */}
      {dlcEntries.length > 0 && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">DLC &amp; Expansions</p>
            <span className="text-xs text-fg-subtle">
              {dlcEntries.filter(d => d.owned).length} / {dlcEntries.length} owned
            </span>
          </div>
          <div className="space-y-1">
            {dlcEntries.map((dlc, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  dlc.owned
                    ? 'border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/20'
                    : 'border-edge-base bg-surface-sunken opacity-60'
                }`}
              >
                <span className={`text-sm shrink-0 ${dlc.owned ? 'text-brand-600 dark:text-brand-400' : 'text-fg-subtle'}`}>
                  {dlc.owned ? '✓' : '○'}
                </span>
                <span className={`text-sm flex-1 min-w-0 truncate ${dlc.owned ? 'font-medium text-fg-base' : 'text-fg-muted'}`}>
                  {dlc.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* More mainline games by the same developer (IGDB) */}
      {developerGames && <DeveloperGames data={developerGames} />}

      {/* Screenshots — fetched live from RAWG */}
      {screenshots.length > 0 && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-3">Screenshots</p>
          <div className="grid grid-cols-2 gap-2">
            {screenshots.map((shot: RawgScreenshot) => (
              <div key={shot.id} className="relative aspect-video rounded-lg overflow-hidden bg-surface-active">
                <Image
                  src={shot.image}
                  alt="Screenshot"
                  fill
                  sizes="(max-width: 640px) 50vw, 280px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      </div>{/* /main column */}

      {/* Sidebar (lg+ only) — About, then "also played by" beneath it */}
      {hasSidebar && (
        <aside className="hidden lg:block space-y-6 lg:sticky lg:top-24">
          {hasAbout && <GameAbout description={game.description} extras={extras} steamReview={steamReview} />}
          {playedBy.length > 0 && <PlayedByCard players={playedBy} />}
        </aside>
      )}
      </div>{/* /body grid */}

      {isOwner ? (
        <Link href="/games" className="inline-block text-sm text-fg-subtle hover:text-fg-secondary transition-colors">
          ← Back to My Games
        </Link>
      ) : ownerProfile ? (
        <Link href={`/users/${encodeURIComponent(ownerProfile.username)}`} className="inline-block text-sm text-fg-subtle hover:text-fg-secondary transition-colors">
          ← Back to {ownerProfile.display_name ?? ownerProfile.username}'s profile
        </Link>
      ) : null}
    </div>
  )
}

function formatDate(date: string | null, precision: 'full' | 'year' = 'full'): string | null {
  if (!date) return null
  if (precision === 'year') return date.slice(0, 4)
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysBetween(start: string, end: string): number | null {
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null
  const diff = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
  return diff < 0 ? null : diff
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-lg font-bold text-fg-base">{value}</p>
    </div>
  )
}

function colorGradient(value: number, max: number): string {
  const pct = (value / max) * 100
  if (pct === 100) return 'bg-gradient-to-br from-emerald-400 to-teal-500'
  if (pct >= 75)   return 'bg-gradient-to-br from-green-400 to-emerald-500'
  if (pct >= 50)   return 'bg-gradient-to-br from-amber-400 to-orange-400'
  if (pct >= 20)   return 'bg-gradient-to-br from-orange-400 to-red-400'
  return                  'bg-gradient-to-br from-red-500 to-rose-600'
}

function RatingStat({ rating }: { rating: number | null }) {
  if (rating == null) {
    return (
      <div className="bg-surface-base border border-edge-base rounded-xl p-4">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Rating</p>
        <p className="mt-1 text-lg font-bold text-fg-base">—</p>
      </div>
    )
  }

  return (
    <div className={`${colorGradient(rating, 5)} rounded-xl p-4`}>
      <p className="text-xs text-white/80 font-medium uppercase tracking-wider">Rating</p>
      <p className="mt-1 text-lg font-bold text-white">{rating}/5</p>
    </div>
  )
}

function AchievementStat({ progress }: { progress: number | null }) {
  if (progress == null) {
    return (
      <div className="bg-surface-base border border-edge-base rounded-xl p-4">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Achievements</p>
        <p className="mt-1 text-lg font-bold text-fg-base">—</p>
      </div>
    )
  }

  const is100 = progress === 100

  return (
    <div className="relative">
      {is100 && (
        <>
          <span className="absolute -top-3 left-0 text-yellow-300 text-base leading-none select-none">✦</span>
          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-yellow-200 text-xs leading-none select-none">✦</span>
          <span className="absolute -top-3 right-0 text-yellow-300 text-base leading-none select-none">✦</span>
          <span className="absolute -bottom-3 left-0 text-yellow-300 text-sm leading-none select-none">✦</span>
          <span className="absolute -bottom-3 right-0 text-yellow-300 text-sm leading-none select-none">✦</span>
        </>
      )}
      <div className={`${colorGradient(progress, 100)} rounded-xl p-4 ${is100 ? 'ring-2 ring-emerald-300 ring-offset-1 dark:ring-offset-zinc-900' : ''}`}>
        <p className="text-xs text-white/80 font-medium uppercase tracking-wider">Achievements</p>
        <p className="mt-1 text-lg font-bold text-white">{Math.round(progress)}%</p>
        {is100 && <p className="text-xs text-white/80 mt-0.5">Complete ✓</p>}
      </div>
    </div>
  )
}
