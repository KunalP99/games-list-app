import type { DeveloperGamesInfo } from '@/lib/rawg'
import AddToBacklogButton from '@/components/users/AddToBacklogButton'

// "More from <developer>" — a cover grid of the other mainline games by the
// game's developer (excludes the current game, DLC, and editions).
export default function DeveloperGames({ data }: { data: NonNullable<DeveloperGamesInfo> }) {
  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">More from {data.developer}</p>
        <span className="text-xs text-fg-subtle">{data.games.length} game{data.games.length !== 1 ? 's' : ''}</span>
      </div>
      {/* Single row — scroll sideways to see more games */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {data.games.map(g => (
          <div key={g.id} className="w-28 flex-shrink-0">
            <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-surface-active mb-1.5">
              {g.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.coverUrl} alt={g.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-2xl">🎮</div>
              )}
              <div className="absolute top-2 right-2">
                <AddToBacklogButton
                  game={{ title: g.name, developer: data.developer, image_url: g.coverUrl, genres: null, rawg_id: g.id, release_date: g.released }}
                  variant="expand"
                />
              </div>
            </div>
            <p className="text-xs font-medium text-fg-base truncate">{g.name}</p>
            <p className="text-[11px] text-fg-subtle mt-0.5">{g.released ? g.released.slice(0, 4) : 'TBD'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
