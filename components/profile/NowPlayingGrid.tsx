import GameCard from '@/components/games/GameCard'
import DragScroller from '@/components/games/DragScroller'
import type { Game } from '@/lib/types'

// Uses the shared GameCard, whose banner variant paints the game's artwork
// across the whole card at a fixed height — so every card is the same size and
// the artwork is the background, rather than a thumbnail beside text.
// Shared by My Games and profiles (friends edition).

/** Up to this many fill a normal grid; past it they go on one row that scrolls sideways. */
export const NOW_PLAYING_GRID_MAX = 3

export default function NowPlayingGrid({
  games,
  isOwner,
  liveSessions = new Map(),
}: {
  games: Game[]
  isOwner: boolean
  liveSessions?: Map<string, string>
}) {
  if (games.length === 0) return null

  const cards = games.map(game => (
    <GameCard key={game.id} game={game} isOwner={isOwner} liveSince={liveSessions.get(game.id) ?? null} />
  ))

  return (
    <div>
      <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wider mb-3">
        Now Playing{games.length > 1 && ` · ${games.length}`}
      </h2>

      {games.length <= NOW_PLAYING_GRID_MAX ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{cards}</div>
      ) : (
        // One row, scrolled sideways (drag with the mouse, swipe on touch).
        // Each card is a little narrower than a third, so the next one peeks
        // in at the edge and shows there's more.
        <DragScroller className="no-scrollbar overflow-x-auto cursor-grab active:cursor-grabbing select-none">

          <div className="grid grid-flow-col auto-cols-[85%] sm:auto-cols-[calc((100%-1rem)/2.2)] lg:auto-cols-[calc((100%-2rem)/3.25)] gap-4">
            {cards}
          </div>
        </DragScroller>
      )}
    </div>
  )
}
