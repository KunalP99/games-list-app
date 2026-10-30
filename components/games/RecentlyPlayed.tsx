import GameCard from '@/components/games/GameCard'
import type { Game } from '@/lib/types'

/**
 * The last few Ambient games played, in the spirit of a Steam profile.
 *
 * Separate from Now Playing on purpose: that section is the games someone
 * chose, usually through the wheel, and this one is what they have actually
 * been running. Mixing them would blur the line Ambient exists to draw.
 */
export default function RecentlyPlayed({
  games,
  isOwner,
  heading = 'Recently Played',
}: {
  games: Game[]
  isOwner: boolean
  heading?: string
}) {
  if (games.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
        {heading}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {games.map(game => (
          <GameCard key={game.id} game={game} isOwner={isOwner} />
        ))}
      </div>
    </div>
  )
}
