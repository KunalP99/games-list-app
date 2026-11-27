import { getBannerImages, providerIdOf } from '@/lib/rawg'
import { dailyPick } from '@/lib/igdb-artworks'
import { londonDay } from '@/lib/activity'

export type HeroGameImage = {
  rawg_id: number | null
  igdb_id: number | null
  artwork_url: string | null
  cover_image_url: string | null
}

// Resolves the actual image shown on the profile / My Games banner for this
// week's hero game (lib/weekly-banner.ts picks which game). Prefers the game's
// official landscape artwork, then a screenshot (getBannerImages: only real
// pictures, never a logo, lib/igdb-artworks.ts), rotating daily within the
// best category the game has. Artwork used to come after screenshots
// for fear of a baked-in logo under the name, but the Cinematic banner keeps
// the name on the darkened left, and the first screenshot IGDB returns was
// often a dull one.
//
// Falls back to whatever's stored when the game has no provider id (a
// free-text add) or the fetch comes back empty/fails (getBannerImages returns
// [] on failure). The fallback always has something: every candidate this is
// called with was selected because it has artwork_url or cover_image_url (see
// lib/user-stats.ts's `hasArt` filter).
export async function resolveBannerImage(game: HeroGameImage, now: Date = new Date()): Promise<string | null> {
  const id = providerIdOf(game)
  if (id != null) {
    // A different picture each day when the game's best category has more
    // than one (all its key art without a logo, else its artwork, else its
    // screenshots); just that one when it has one.
    const pick = dailyPick(await getBannerImages(id), londonDay(now.toISOString()))
    if (pick) return pick
  }
  return game.artwork_url ?? game.cover_image_url ?? null
}
