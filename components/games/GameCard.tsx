import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { Game } from '@/lib/types'

export default function GameCard({ game }: { game: Game }) {
  if (game.image_url) {
    return (
      <Link
        href={`/games/${game.id}`}
        className="relative block rounded-xl overflow-hidden min-h-[140px] hover:shadow-md transition-all"
        style={{ backgroundImage: `url(${game.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
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
          <div className="mt-3 flex items-center gap-4 text-xs text-white/60">
            {game.hours_played != null && (
              <span>{game.hours_played}h played</span>
            )}
            {game.is_replay && <span className="text-brand-300">↩ Replay</span>}
            {game.rating != null && (
              <span className="flex items-center gap-1">
                <span className="text-amber-300">★</span>
                {game.rating}/10
              </span>
            )}
            {game.achievement_progress != null && (
              game.achievement_progress === 100
                ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100% achievements</span>
                : <span>{Math.round(game.achievement_progress)}% achievements</span>
            )}
          </div>
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={`/games/${game.id}`}
      className="flex flex-col justify-between bg-white border border-zinc-200 rounded-xl p-4 min-h-[140px] hover:border-brand-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-semibold text-zinc-900 truncate">{game.title}</h3>
            {game.is_favourite && <span className="text-amber-400 shrink-0 leading-none">★</span>}
          </div>
          {game.developer && (
            <p className="text-sm text-zinc-500 truncate mt-0.5">{game.developer}</p>
          )}
          {game.platform && (
            <p className="text-xs text-zinc-400 truncate mt-0.5">{game.platform}</p>
          )}
        </div>
        <StatusBadge status={game.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-400">
        {game.is_replay && <span className="text-brand-500">↩ Replay</span>}
        {game.hours_played != null && (
          <span>{game.hours_played}h played</span>
        )}
        {game.rating != null && (
          <span className="flex items-center gap-1">
            <span className="text-amber-400">★</span>
            {game.rating}/10
          </span>
        )}
        {game.achievement_progress != null && (
          game.achievement_progress === 100
            ? <span className="font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">100% achievements</span>
            : <span>{Math.round(game.achievement_progress)}% achievements</span>
        )}
      </div>
    </Link>
  )
}
