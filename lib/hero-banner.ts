import { getGameImages, providerIdOf } from '@/lib/rawg'

export type HeroGameImage = {
  rawg_id: number | null
  igdb_id: number | null
  artwork_url: string | null
  cover_image_url: string | null
}

// Resolves the actual image shown on the profile / My Games banner for this
// week's hero game (lib/weekly-banner.ts picks which game). Prefers the game's
// official landscape artwork (key art, wallpapers: the largest one that's
// landscape), then a screenshot: getGameImages lists them in that order, the
// same rule as the game page's banner. Artwork used to come after screenshots
// for fear of a baked-in logo under the name, but the Cinematic banner keeps
// the name on the darkened left, and the first screenshot IGDB returns was
// often a dull one.
//
// Falls back to whatever's stored when the game has no provider id (a
// free-text add) or the fetch comes back empty/fails (getGameImages returns
// [] on failure). The fallback always has something: every candidate this is
// called with was selected because it has artwork_url or cover_image_url (see
// lib/user-stats.ts's `hasArt` filter).
export async function resolveBannerImage(game: HeroGameImage): Promise<string | null> {
  const id = providerIdOf(game)
  if (id != null) {
    const images = await getGameImages(id)
    if (images[0]) return images[0]
  }
  return game.artwork_url ?? game.cover_image_url ?? null
}
