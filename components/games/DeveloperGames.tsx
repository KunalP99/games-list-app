import type { DeveloperGamesInfo } from '@/lib/rawg'
import AddToBacklogButton from '@/components/users/AddToBacklogButton'
import DragScroller from '@/components/games/DragScroller'

// "More from <developer>" — a cover grid of the other mainline games by the
// game's developer (excludes the current game, DLC, and editions).
export default function DeveloperGames({ data }: { data: NonNullable<DeveloperGamesInfo> }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">More from {data.developer}</p>
        <span className="text-xs text-fg-subtle">{data.games.length} game{data.games.length !== 1 ? 's' : ''}</span>
      </div>
      {/* Single row — drag or swipe sideways to see more games */}
      <DragScroller className="no-scrollbar flex gap-3 overflow-x-auto -mx-1 px-1 py-1 cursor-grab active:cursor-grabbing select-none">
        {data.games.map(g => (
          <div key={g.id} className="group/card relative w-24 flex-shrink-0 aspect-[3/4] rounded-lg overflow-hidden bg-surface-active">
            {g.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={g.coverUrl} alt={g.name} draggable={false} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl">🎮</div>
            )}
            <div className="absolute top-2 right-2">
              <AddToBacklogButton
                game={{ title: g.name, developer: data.developer, image_url: g.coverUrl, genres: null, rawg_id: g.id, release_date: g.released }}
                variant="expand"
              />
            </div>
            {/* Title + year popup — appears on hover (always shown on mobile) */}
            <div className="pointer-events-none absolute inset-x-1 bottom-1 rounded-md bg-black/75 backdrop-blur-sm px-2 py-1.5 transition-all duration-200 opacity-100 translate-y-0 sm:opacity-0 sm:translate-y-1 sm:group-hover/card:opacity-100 sm:group-hover/card:translate-y-0">
              <p className="text-[11px] font-semibold text-white leading-tight line-clamp-2">{g.name}</p>
              <p className="text-[10px] text-white/70 mt-0.5">{g.released ? g.released.slice(0, 4) : 'TBD'}</p>
            </div>
          </div>
        ))}
      </DragScroller>
    </div>
  )
}
