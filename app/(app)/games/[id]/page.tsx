import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import type { Game } from '@/lib/types'
import { getRawgScreenshots, getRawgAchievements } from '@/lib/rawg'
import type { RawgScreenshot, RawgAchievement } from '@/lib/rawg'
import StatusBadge from '@/components/games/StatusBadge'
import DeleteGameButton from '@/components/games/DeleteGameButton'
import MarkCompletedButton from '@/components/games/MarkCompletedButton'
import AchievementGrid from '@/components/games/AchievementGrid'
import AddToBacklogButton from '@/components/users/AddToBacklogButton'
import GameVideos from '@/components/games/GameVideos'
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

  const [{ data: sameGames }, screenshots, achievements] = await Promise.all([
    supabase
      .from('games')
      .select('id, created_at')
      .eq('user_id', game.user_id)
      .ilike('title', game.title)
      .order('created_at', { ascending: true }) as unknown as Promise<{ data: { id: string; created_at: string }[] | null }>,
    game.rawg_id ? getRawgScreenshots(game.rawg_id) : Promise.resolve([] as RawgScreenshot[]),
    game.rawg_id ? getRawgAchievements(game.rawg_id) : Promise.resolve([] as RawgAchievement[]),
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

  return (
    <div className="max-w-2xl space-y-6">
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

      {/* Hero — banner with overlay when image exists, plain header otherwise */}
      {game.image_url ? (
        <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-md">
          <img
            src={game.image_url}
            alt={game.title}
            className="w-full h-full object-cover object-center"
          />
          {/* Strong gradient so text is always readable */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

          {/* Actions — top right */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            {isOwner ? (
              <>
                {game.status === 'playing' && (
                  <MarkCompletedButton gameId={game.id} variant="detail" />
                )}
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
                game={{ title: game.title, developer: game.developer, image_url: game.image_url, genres: game.genres, rawg_id: game.rawg_id, release_date: game.release_date }}
                variant="glass"
              />
            )}
          </div>

          {/* Title and metadata — bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-2xl font-bold text-white leading-tight">{game.title}</h1>
              {game.is_favourite && (
                <span className="text-amber-400 text-xl leading-none" title="Favourite">★</span>
              )}
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
            {[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).length > 0 && (
              <p className="text-white/70 text-sm mb-2">
                {[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).join(' · ')}
              </p>
            )}
            {game.genres && game.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {game.genres.map(genre => (
                  <span
                    key={genre}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/15 text-white/90 border border-white/20"
                  >
                    {genre}
                  </span>
                ))}
              </div>
            )}
            {totalPlaythroughs > 1 && (
              <p className="text-xs text-white/50 mt-1.5">
                Playthrough {playthroughNumber} of {totalPlaythroughs}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Fallback plain header for games without an image */
        <div className="flex items-start justify-between gap-4">
          <div>
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
            <p className="text-fg-muted text-sm">
              {[game.developer, formatDate(game.release_date, game.release_date_precision), game.platform].filter(Boolean).join(' · ')}
            </p>
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
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {isOwner ? (
              <>
                {game.status === 'playing' && (
                  <MarkCompletedButton gameId={game.id} variant="detail" />
                )}
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
                game={{ title: game.title, developer: game.developer, image_url: game.image_url, genres: game.genres, rawg_id: game.rawg_id, release_date: game.release_date }}
                variant="outline"
              />
            )}
          </div>
        </div>
      )}

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

      {/* About — from RAWG description stored at save time */}
      {game.description && (
        <div className="bg-surface-base border border-edge-base rounded-xl p-4">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider mb-2">About</p>
          <p className="text-fg-secondary text-sm leading-relaxed line-clamp-6">{game.description}</p>
        </div>
      )}

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
