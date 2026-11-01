'use server'

import { createClient } from '@/lib/supabase/server'
import { searchRawgGames, getRawgGameDetail, PROVIDER_ID_COLUMN } from '@/lib/rawg'

export type CompletedGameRow = {
  title: string
  release_year: string | null
  developer: string | null
  platform: string | null
  completion_date: string | null            // ISO "YYYY-MM-DD"
  completion_date_precision: 'full' | 'year'
  hours_played: number | null
  achievement_progress: number | null       // 0–100
  rating: number | null                     // 1–5
  notes: string | null
}

export type BacklogGameRow = {
  title: string
  platform: string | null
}

export type ImportResult = {
  imported: number
  failed: Array<{ title: string; reason: string }>
}

// Run fn over items with at most `concurrency` in-flight at once
async function withConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 5,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = await Promise.all(items.slice(i, i + concurrency).map(fn))
    results.push(...batch)
  }
  return results
}

type RawgData = {
  rawg_id: number
  image_url: string | null
  // Portrait box art. Was fetched but discarded — the default games-list view
  // is Box Art (CoverCard.tsx), which reads cover_image_url specifically, so
  // an imported game rendered as a blank placeholder tile regardless of how
  // good image_url (the landscape banner) was.
  cover_image_url: string | null
  release_date: string | null        // ISO "YYYY-MM-DD"
  release_date_precision: 'full' | 'year'
  developer: string | null
  genres: string[]
  description: string | null
  dominant_color: string | null
  // So an imported Steam game is recognised by the desktop agent straight
  // away, with no executable to link.
  steam_appid: number | null
}

async function fetchRawgData(title: string): Promise<RawgData | null> {
  try {
    const results = await searchRawgGames(title)
    if (!results.length) return null
    const top = results[0]
    const detail = await getRawgGameDetail(top.id)
    return {
      rawg_id: top.id,
      image_url: detail?.background_image ?? top.background_image ?? null,
      cover_image_url: detail?.cover_image ?? top.cover_image ?? null,
      release_date: detail?.released ?? top.released ?? null,
      release_date_precision: 'full',
      developer: detail?.developers?.[0]?.name ?? top.developers?.[0]?.name ?? null,
      genres: detail?.genres?.map(g => g.name) ?? [],
      description: detail?.description_raw ?? null,
      dominant_color: detail?.saturated_color ?? detail?.dominant_color ?? null,
      steam_appid: detail?.steam_app_id ?? null,
    }
  } catch {
    return null
  }
}

export async function bulkImportGames(
  completedGames: CompletedGameRow[],
  backlogGames: BacklogGameRow[],
  enrichWithRawg: boolean,
): Promise<ImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { imported: 0, failed: [] }

  const failed: ImportResult['failed'] = []
  let imported = 0

  // ── Enrich completed + backlog games with RAWG data ───────────────────────
  let rawgMap = new Map<string, RawgData | null>()
  let backlogRawgMap = new Map<string, RawgData | null>()
  if (enrichWithRawg) {
    if (completedGames.length > 0) {
      const enriched = await withConcurrency(
        completedGames,
        async (g) => ({ title: g.title, data: await fetchRawgData(g.title) }),
        4,
      )
      for (const { title, data } of enriched) rawgMap.set(title, data)
    }
    if (backlogGames.length > 0) {
      const enriched = await withConcurrency(
        backlogGames,
        async (g) => ({ title: g.title, data: await fetchRawgData(g.title) }),
        4,
      )
      for (const { title, data } of enriched) backlogRawgMap.set(title, data)
    }
  }

  // ── Insert completed games ─────────────────────────────────────────────────
  for (const g of completedGames) {
    if (!g.title) continue
    try {
      const rawg = enrichWithRawg ? rawgMap.get(g.title) : null

      const releaseDate = rawg?.release_date ?? (g.release_year ? `${g.release_year}-01-01` : null)
      const releasePrecision = rawg?.release_date ? 'full' : 'year'

      const { data: game, error } = await (supabase.from('games') as any)
        .insert({
          user_id: user.id,
          title: g.title,
          status: 'completed',
          developer: rawg?.developer ?? g.developer ?? null,
          platform: g.platform ?? null,
          hours_played: g.hours_played ?? null,
          achievement_progress: g.achievement_progress ?? null,
          rating: g.rating ?? null,
          notes: g.notes ?? null,
          completion_date: g.completion_date ?? null,
          completion_date_precision: g.completion_date_precision,
          release_date: releaseDate,
          release_date_precision: releasePrecision,
          image_url: rawg?.image_url ?? null,
          cover_image_url: rawg?.cover_image_url ?? null,
          [PROVIDER_ID_COLUMN]: rawg?.rawg_id ?? null,
          steam_appid: rawg?.steam_appid ?? null,
          genres: rawg?.genres?.length ? rawg.genres : null,
          description: rawg?.description ?? null,
          dominant_color: rawg?.dominant_color ?? null,
          is_favourite: false,
          is_replay: false,
          is_sequel: false,
        })
        .select()
        .single()

      if (error || !game) {
        failed.push({ title: g.title, reason: error?.message ?? 'Insert failed' })
        continue
      }

      imported++
    } catch (err: unknown) {
      failed.push({ title: g.title, reason: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  // ── Insert backlog games ───────────────────────────────────────────────────
  for (const g of backlogGames) {
    if (!g.title) continue
    try {
      const rawg = enrichWithRawg ? backlogRawgMap.get(g.title) : null

      const { error } = await (supabase.from('games') as any)
        .insert({
          user_id: user.id,
          title: g.title,
          status: 'backlog',
          platform: g.platform ?? null,
          developer: rawg?.developer ?? null,
          image_url: rawg?.image_url ?? null,
          cover_image_url: rawg?.cover_image_url ?? null,
          [PROVIDER_ID_COLUMN]: rawg?.rawg_id ?? null,
          steam_appid: rawg?.steam_appid ?? null,
          genres: rawg?.genres?.length ? rawg.genres : null,
          description: rawg?.description ?? null,
          dominant_color: rawg?.dominant_color ?? null,
          release_date: rawg?.release_date ?? null,
          release_date_precision: rawg?.release_date ? 'full' : 'year',
          is_favourite: false,
          is_replay: false,
          is_sequel: false,
        })

      if (error) {
        failed.push({ title: g.title, reason: error.message })
        continue
      }
      imported++
    } catch (err: unknown) {
      failed.push({ title: g.title, reason: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return { imported, failed }
}
