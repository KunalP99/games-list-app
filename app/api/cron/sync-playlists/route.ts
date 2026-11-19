import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseYouTubeUrl } from '@/lib/youtube'
import { fetchPlaylistItemCounts, fetchYouTubePlaylistItems } from '@/lib/youtube-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Keeps each game's media in step with the YouTube playlist it came from.
// Triggered by Vercel Cron (see vercel.json): games whose `youtube_playlist_url`
// is a YouTube playlist have their `youtube_videos` JSONB mirrored to match.
// Quota-friendly: one batched playlists.list per 50 playlists reads their video
// counts; only playlists whose count changed since last run are re-fetched.
type Target = { id: string; ytId: string; lastCount: number | null }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // Fail closed: a missing CRON_SECRET must lock these service-role jobs, not open them.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()

  // 1. Gather the games linked to a YouTube playlist.
  const { data: games } = await sb.from('games')
    .select('id, youtube_playlist_url, youtube_item_count')
    .not('youtube_playlist_url', 'is', null)

  const targets: Target[] = []
  for (const g of games ?? []) {
    const parsed = g.youtube_playlist_url ? parseYouTubeUrl(g.youtube_playlist_url) : null
    if (parsed?.kind === 'playlist') {
      targets.push({ id: g.id, ytId: parsed.id, lastCount: g.youtube_item_count ?? null })
    }
  }

  if (targets.length === 0) return NextResponse.json({ ok: true, targets: 0, synced: 0, skipped: 0, gone: 0 })

  // 2. Batched count-check — one call per 50 unique playlists.
  const uniqueIds = Array.from(new Set(targets.map(t => t.ytId)))
  const counts = await fetchPlaylistItemCounts(uniqueIds)

  // 3. Re-fetch + mirror only the playlists whose count changed.
  let synced = 0, skipped = 0, gone = 0
  for (const t of targets) {
    const count = counts.get(t.ytId)
    if (count === undefined) { gone++; continue }        // private/deleted upstream — leave as-is
    if (t.lastCount === count) { skipped++; continue }   // unchanged since last run

    const items = await fetchYouTubePlaylistItems(t.ytId)
    if (items.length === 0 && count > 0) { skipped++; continue } // transient fetch failure — don't wipe

    const videos = items.map(it => ({
      youtube_id: it.videoId, title: it.title, author_name: it.author, thumbnail_url: it.thumbnail,
    }))
    await sb.from('games').update({ youtube_videos: videos, youtube_item_count: count }).eq('id', t.id)
    synced++
  }

  return NextResponse.json({ ok: true, targets: targets.length, synced, skipped, gone })
}
