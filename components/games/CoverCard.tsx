import Link from 'next/link'
import StatusBadge from './StatusBadge'
import MarkCompletedButton from './MarkCompletedButton'
import type { Game } from '@/lib/types'

// Formatted release date, respecting year-only precision. Null when no date.
function formatRelease(game: Game): string | null {
  const d = game.release_date
  if (!d) return null
  if (game.release_date_precision === 'year') return d.slice(0, 4)
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Portrait box-art card. Cover on top, the same info GameCard shows beneath.
export default function CoverCard({ game, isOwner = true, showReleaseDate = false }: { game: Game; isOwner?: boolean; showReleaseDate?: boolean }) {
  const cover = (game as { cover_image_url?: string | null }).cover_image_url ?? null
  const releaseLabel = showReleaseDate ? formatRelease(game) : null

  return (
    <Link
      href={`/games/${game.id}`}
      className="group flex flex-col bg-surface-base border border-edge-base rounded-xl overflow-hidden hover:border-brand-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 dark:hover:border-brand-600"
    >
      {/* Cover (portrait) or placeholder */}
      <div className="relative w-full aspect-[3/4] bg-surface-sunken overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={game.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
            <span className="text-3xl opacity-60">🎮</span>
            <span className="text-xs font-medium text-fg-muted line-clamp-3">{game.title}</span>
          </div>
        )}
        <div className="absolute top-2 right-2">
          <StatusBadge status={game.status} />
        </div>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold text-fg-base truncate">{game.title}</h3>
          {game.is_favourite && <span className="text-amber-400 shrink-0 leading-none">★</span>}
        </div>
        {game.developer && <p className="text-xs text-fg-muted truncate -mt-0.5">{game.developer}</p>}
        {releaseLabel && <p className="text-xs font-medium text-fg-muted truncate">📅 Releases {releaseLabel}</p>}

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs text-fg-subtle min-w-0 flex-wrap">
            {game.is_replay && <span className="text-orange-400" title="Replay">↩</span>}
            {game.is_sequel && (
              <span className="text-violet-500" title="Sequel">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
              </span>
            )}
            {game.hours_played != null && <span>{game.hours_played}h</span>}
            {game.rating != null && (
              <span className="flex items-center gap-0.5"><span className="text-amber-400">★</span>{game.rating}</span>
            )}
            {game.achievement_progress != null && (
              game.achievement_progress === 100
                ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100%</span>
                : <span>{Math.round(game.achievement_progress)}%</span>
            )}
            {game.steam_deck && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/steam-deck.png" alt="Steam Deck" title="Playing on Steam Deck" className="h-3.5 w-auto shrink-0" />
            )}
          </div>
          {game.status === 'playing' && isOwner && <MarkCompletedButton gameId={game.id} initialFavourite={game.is_favourite} />}
        </div>
      </div>
    </Link>
  )
}
