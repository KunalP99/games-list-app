import 'server-only'
import { PROVIDER_ID_COLUMN, getRawgGameDetail } from './rawg'

/**
 * Adds a game the desktop tracker recognised to someone's library, with the
 * same metadata any other add gets, so it doesn't sit there as a bare title.
 * Shared by `/api/agent/identify` (a recognised game, filed as Ambient) and
 * `/api/agent/emulator-choice` (an emulated game, filed as Playing).
 */
export async function fileTrackerGame(
  sb: any,
  opts: {
    userId: string
    igdbId: number
    fallbackTitle: string
    status: string
    platform: string
    steamAppId?: number | null
    isEmulated?: boolean
  },
): Promise<{ id: string; title: string } | { error: string }> {
  const detail = await getRawgGameDetail(opts.igdbId)
  const { data, error } = await (sb.from('games') as any)
    .insert({
      user_id: opts.userId,
      title: detail?.name ?? opts.fallbackTitle,
      developer: detail?.developers?.[0]?.name ?? null,
      status: opts.status,
      platform: opts.platform,
      start_date: new Date().toISOString().slice(0, 10),
      steam_appid: opts.steamAppId ?? null,
      is_emulated: opts.isEmulated ?? false,
      [PROVIDER_ID_COLUMN]: opts.igdbId,
      image_url: detail?.background_image ?? null,
      cover_image_url: detail?.cover_image ?? null,
      artwork_url: detail?.artwork_image ?? null,
      genres: detail?.genres?.map(g => g.name) ?? null,
      description: detail?.description_raw ?? null,
      release_date: detail?.released ?? null,
      release_date_precision: detail?.released ? 'full' : 'year',
      completion_date_precision: 'year',
      dominant_color: detail?.saturated_color ?? detail?.dominant_color ?? null,
    })
    .select('id, title')
    .single()
  if (error) return { error: error.message }
  return data as { id: string; title: string }
}
