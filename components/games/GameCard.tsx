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

export default function GameCard({ game, isOwner = true, showReleaseDate = false }: { game: Game; isOwner?: boolean; showReleaseDate?: boolean }) {
  const banner = (game as { artwork_url?: string | null }).artwork_url ?? game.image_url
  const releaseLabel = showReleaseDate ? formatRelease(game) : null
  if (banner) {
    return (
      <Link
        href={`/games/${game.id}`}
        className="group relative block rounded-xl overflow-hidden h-[140px] hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
      >
        {/* bg-surface-active sits behind the artwork so the card reads as a
            skeleton block until the image paints. Without it the card is a
            transparent box with white text over a gradient, which looks like
            a half-loaded page for as long as the download takes. */}
        <div
          className="absolute inset-0 bg-surface-active bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundImage: `url(${banner})` }}
        />
        {/* Bottom-weighted gradient so most of the banner stays visible */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {/* Status — top right, so it doesn't cover the artwork */}
        <div className="absolute top-2 right-2">
          <StatusBadge status={game.status} />
        </div>

        {/* Info — anchored to the bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-semibold text-white truncate drop-shadow">{game.title}</h3>
            {game.is_favourite && <span className="text-amber-400 shrink-0 leading-none">★</span>}
          </div>
          {(game.developer || game.platform || game.steam_deck) && (
            <p className="text-xs text-white/70 mt-0.5 drop-shadow flex items-center gap-1.5 min-w-0">
              <span className="truncate">{[game.developer, game.platform].filter(Boolean).join(' · ')}</span>
              {game.steam_deck && (
                <>
                  {(game.developer || game.platform) && <span className="shrink-0">·</span>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/steam-deck.png" alt="Steam Deck" title="Playing on Steam Deck" className="h-3.5 w-auto shrink-0" />
                </>
              )}
            </p>
          )}
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-white/70 flex-wrap drop-shadow">
              {releaseLabel && <span className="font-medium text-white/90">📅 Releases {releaseLabel}</span>}
              {game.is_replay && <span className="text-base text-orange-400 leading-none" title="Replay">↩</span>}
              {game.is_sequel && (
                <span className="text-violet-400" title="Sequel">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </span>
              )}
              {game.hours_played != null && <span>{game.hours_played}h</span>}
              {game.rating != null && (
                <span className="flex items-center gap-1"><span className="text-amber-300">★</span>{game.rating}/5</span>
              )}
              {game.achievement_progress != null && (
                game.achievement_progress === 100
                  ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100%</span>
                  : <span>{Math.round(game.achievement_progress)}%</span>
              )}
            </div>
            {game.status === 'playing' && isOwner && <MarkCompletedButton gameId={game.id} initialFavourite={game.is_favourite} />}
          </div>
        </div>
      </Link>
    )
  }

  const tint = game.dominant_color ? `#${game.dominant_color}` : null

  return (
    <Link
      href={`/games/${game.id}`}
      className="flex flex-col justify-between bg-surface-base border border-edge-base rounded-xl p-4 min-h-[140px] hover:border-brand-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 dark:hover:border-brand-600"
      style={tint ? { background: `linear-gradient(135deg, ${tint}18 0%, transparent 55%)` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-semibold text-fg-base truncate">{game.title}</h3>
            {game.is_favourite && <span className="text-amber-400 shrink-0 leading-none">★</span>}
          </div>
          {game.developer && (
            <p className="text-sm text-fg-muted truncate mt-0.5">{game.developer}</p>
          )}
          {(game.platform || game.steam_deck) && (
            <p className="text-xs text-fg-subtle mt-0.5 flex items-center gap-1.5 min-w-0">
              {game.platform && <span className="truncate">{game.platform}</span>}
              {game.steam_deck && (
                <>
                  {game.platform && <span className="shrink-0">·</span>}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/steam-deck.png" alt="Steam Deck" title="Playing on Steam Deck" className="h-3.5 w-auto shrink-0" />
                </>
              )}
            </p>
          )}
        </div>
        <StatusBadge status={game.status} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-fg-subtle">
          {releaseLabel && <span className="font-medium text-fg-muted">📅 Releases {releaseLabel}</span>}
          {game.is_replay && <span className="text-orange-400" title="Replay">↩</span>}
          {game.is_sequel && (
            <span className="text-violet-500" title="Sequel">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </span>
          )}
          {game.hours_played != null && (
            <span>{game.hours_played}h played</span>
          )}
          {game.rating != null && (
            <span className="flex items-center gap-1">
              <span className="text-amber-400">★</span>
              {game.rating}/5
            </span>
          )}
          {game.achievement_progress != null && (
            game.achievement_progress === 100
              ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100% achievements</span>
              : <span>{Math.round(game.achievement_progress)}% achievements</span>
          )}
        </div>
        {game.status === 'playing' && isOwner && <MarkCompletedButton gameId={game.id} initialFavourite={game.is_favourite} />}
      </div>
    </Link>
  )
}
