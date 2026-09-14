import { getRawgScreenshots, providerIdOf } from '@/lib/rawg'

export type HeroGameImage = {
  rawg_id: number | null
  igdb_id: number | null
  artwork_url: string | null
  cover_image_url: string | null
}

// Resolves the actual image shown on the friend-profile banner for this
// week's hero game (lib/weekly-banner.ts picks which game). Prefers a
// live-fetched screenshot over the stored artwork_url/cover_image_url:
// screenshots don't carry the baked-in title/logo text that key art and box
// art usually do, which is the same reasoning lib/igdb.ts's heroImage() uses
// for game-page banners — reused here rather than reinvented.
//
// Falls back to whatever's stored when the game has no provider id (a
// free-text add) or the fetch comes back empty/fails — getRawgScreenshots
// already swallows fetch errors and returns []. The fallback always has
// something: every candidate this is called with was selected because it has
// artwork_url or cover_image_url (see lib/user-stats.ts's `hasArt` filter).
export async function resolveBannerImage(game: HeroGameImage): Promise<string | null> {
  const id = providerIdOf(game)
  if (id != null) {
    const shots = await getRawgScreenshots(id)
    if (shots[0]?.image) return shots[0].image
  }
  return game.artwork_url ?? game.cover_image_url ?? null
}
