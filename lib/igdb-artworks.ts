// Pure: which IGDB artworks are pictures (lib/igdb.ts uses it for banners,
// card and store images and the form's image chooser).

// IGDB labels every artwork (`artwork_type`, the `artwork_types` endpoint).
// Only these are pictures; the rest are logos (5 white, 6 black, 7 colour,
// 13 historical), key art with the logo printed on it (3), covers (9, 10,
// 11), icons (12, 14) and infographics (8). Logos made a banner of nothing but
// the game's title text (Cyberpunk 2077's is an 8,334px-wide white logo, so
// "largest" picked it). Best first: key art without a logo (2), then plain
// artwork (1), historical artwork (15), concept art (4). Older artworks with
// no type count as plain artwork.
const PICTURE_ARTWORK_RANK: Record<number, number> = { 2: 0, 1: 1, 15: 2, 4: 3 }

export type IgdbArtwork = { image_id?: string; width?: number; height?: number; artwork_type?: number; alpha_channel?: boolean }
/** The artwork fields the picture filter needs, for a games query (`artworks.<field>`). */
export const ARTWORK_FIELDS = 'artworks.image_id, artworks.width, artworks.height, artworks.artwork_type, artworks.alpha_channel'

/**
 * A game's artworks that are actual pictures, within an aspect range, best
 * type first and then the largest: no logos, covers, icons or infographics,
 * and nothing with a transparent background (logos and cut-outs). Pure.
 */
export function pictureArtworks<T extends IgdbArtwork>(artworks: T[] | undefined, minRatio = 1.3, maxRatio = Infinity): T[] {
  const rank = (a: T) => PICTURE_ARTWORK_RANK[a.artwork_type ?? 1]
  return (artworks ?? [])
    .filter(a => a.image_id && a.width && a.height && !a.alpha_channel && rank(a) !== undefined)
    .filter(a => a.width! / a.height! >= minRatio && a.width! / a.height! <= maxRatio)
    .sort((a, b) => rank(a) - rank(b) || (b.width! * b.height!) - (a.width! * a.height!))
}
