import GameCard from '@/components/games/GameCard'
import type { Game } from '@/lib/types'

// Uses the shared GameCard, whose banner variant paints the game's artwork
// across the whole card at a fixed height — so every card is the same size and
// the artwork is the background, rather than a thumbnail beside text.

export default function NowPlayingGrid({
  games,
  isOwner,
}: {
  games: Game[]
  isOwner: boolean
}) {
  if (games.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
        Now Playing{games.length > 1 && ` · ${games.length}`}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map(game => (
          <GameCard key={game.id} game={game} isOwner={isOwner} />
        ))}
      </div>
    </div>
  )
}
