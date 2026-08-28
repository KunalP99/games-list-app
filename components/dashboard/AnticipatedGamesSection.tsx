import { unstable_cache } from 'next/cache'
import { getAnticipatedGames } from '@/lib/rawg'
import AnticipatedGames from '@/components/games/AnticipatedGames'

// Cache the IGDB call so the dashboard doesn't hit the API on every load. Hype
// and dates come straight from IGDB, so the list updates on its own each hour.
const getCached = unstable_cache(() => getAnticipatedGames(12), ['anticipated-games-v1'], { revalidate: 3600 })

export async function AnticipatedGamesSection() {
  const games = await getCached()
  if (games.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">Most Anticipated</h2>
      <AnticipatedGames games={games} />
    </div>
  )
}

export function AnticipatedGamesSkeleton() {
  return (
    <div>
      <div className="h-3 w-32 bg-surface-active rounded mb-3 animate-pulse" />
      <div className="aspect-[16/9] bg-surface-base border border-edge-base rounded-xl animate-pulse" />
    </div>
  )
}
