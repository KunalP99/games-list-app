import { unstable_cache } from 'next/cache'
import { getStoreGame, getDeveloperGames } from '@/lib/igdb'

// The store page's IGDB lookups (/discover/<id>), cached for an hour per game:
// a popular game's page then costs IGDB nothing on most visits, and the data
// (ratings, DLC lists) changes slowly. Bump the key when StoreGame's shape
// changes, so stale cached payloads are dropped rather than served.
export const getCachedStoreGame = unstable_cache(
  (id: number) => getStoreGame(id),
  ['store-game-v3'],
  { revalidate: 3600 },
)

export const getCachedDeveloperGames = unstable_cache(
  (id: number) => getDeveloperGames(id),
  ['store-developer-games-v1'],
  { revalidate: 3600 },
)
