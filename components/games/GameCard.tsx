import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { Game } from '@/lib/types'

export default function GameCard({ game }: { game: Game }) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="block bg-white border border-zinc-200 rounded-xl p-4 hover:border-violet-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 truncate">{game.title}</h3>
          {game.developer && (
            <p className="text-sm text-zinc-500 truncate mt-0.5">{game.developer}</p>
          )}
        </div>
        <StatusBadge status={game.status} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-zinc-400">
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
          <span>{game.achievement_progress}% achievements</span>
        )}
      </div>
    </Link>
  )
}
