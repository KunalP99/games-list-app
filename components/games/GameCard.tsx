import Link from 'next/link'
import StatusBadge from './StatusBadge'
import MarkCompletedButton from './MarkCompletedButton'
import type { Game } from '@/lib/types'

export default function GameCard({ game, isOwner = true }: { game: Game; isOwner?: boolean }) {
  if (game.image_url) {
    return (
      <Link
        href={`/games/${game.id}`}
        className="group relative block rounded-xl overflow-hidden min-h-[140px] hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
      >
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundImage: `url(${game.image_url})` }}
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative z-10 p-4 flex flex-col justify-between min-h-[140px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-semibold text-white truncate">{game.title}</h3>
                {game.is_favourite && <span className="text-amber-400 shrink-0 leading-none">★</span>}
              </div>
              {game.developer && (
                <p className="text-sm text-white/70 truncate mt-0.5">{game.developer}</p>
              )}
              {game.platform && (
                <p className="text-xs text-white/50 truncate mt-0.5">{game.platform}</p>
              )}
            </div>
            <StatusBadge status={game.status} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-4 text-xs text-white/60">
              {game.hours_played != null && (
                <span>{game.hours_played}h played</span>
              )}
              {game.is_replay && <span className="text-base text-orange-400 leading-none" title="Replay">↩</span>}
              {game.is_sequel && (
                <span className="text-violet-400" title="Sequel">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </span>
              )}
              {game.rating != null && (
                <span className="flex items-center gap-1">
                  <span className="text-amber-300">★</span>
                  {game.rating}/5
                </span>
              )}
              {game.achievement_progress != null && (
                game.achievement_progress === 100
                  ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100% achievements</span>
                  : <span>{Math.round(game.achievement_progress)}% achievements</span>
              )}
            </div>
            {game.status === 'playing' && isOwner && <MarkCompletedButton gameId={game.id} />}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/games/${game.id}`}
      className="flex flex-col justify-between bg-surface-base border border-edge-base rounded-xl p-4 min-h-[140px] hover:border-brand-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 dark:hover:border-brand-600"
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
          {game.platform && (
            <p className="text-xs text-fg-subtle truncate mt-0.5">{game.platform}</p>
          )}
        </div>
        <StatusBadge status={game.status} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-xs text-fg-subtle">
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
        {game.status === 'playing' && isOwner && <MarkCompletedButton gameId={game.id} />}
      </div>
    </Link>
  )
}
