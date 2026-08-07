import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseYouTubeUrl, youtubeCanonicalUrl } from '@/lib/youtube'
import { fetchPlaylistItemCounts, fetchYouTubePlaylistItems } from '@/lib/youtube-api'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Auto-syncs every playlist that was imported from YouTube with its source.
// Triggered by Vercel Cron (see vercel.json). Two surfaces:
//   • In-site playlists (playlists + videos tables) whose `youtube_url` is a
//     YouTube playlist — the child `videos` rows are mirrored to match.
//   • Game media (games.youtube_videos JSONB) whose `youtube_playlist_url` is a
//     YouTube playlist — the stored videos are mirrored to match.
// Quota-friendly: one batched playlists.list per 50 playlists reads their video
// counts; only playlists whose count changed since last run are re-fetched.
type Target =
  | { kind: 'playlist'; id: string; userId: string; ytId: string; lastCount: number | null }
  | { kind: 'game'; id: string; ytId: string; lastCount: number | null }

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()

  // 1. Gather sync targets from both surfaces.
  const [{ data: playlists }, { data: games }] = await Promise.all([
    sb.from('playlists').select('id, user_id, youtube_url, youtube_item_count'),
    sb.from('games').select('id, youtube_playlist_url, youtube_item_count').not('youtube_playlist_url', 'is', null),
  ])

  const targets: Target[] = []
  for (const p of playlists ?? []) {
    const parsed = p.youtube_url ? parseYouTubeUrl(p.youtube_url) : null
    if (parsed?.kind === 'playlist') {
      targets.push({ kind: 'playlist', id: p.id, userId: p.user_id, ytId: parsed.id, lastCount: p.youtube_item_count ?? null })
    }
  }
  for (const g of games ?? []) {
    const parsed = g.youtube_playlist_url ? parseYouTubeUrl(g.youtube_playlist_url) : null
    if (parsed?.kind === 'playlist') {
      targets.push({ kind: 'game', id: g.id, ytId: parsed.id, lastCount: g.youtube_item_count ?? null })
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

    if (t.kind === 'game') {
      const videos = items.map(it => ({
        youtube_id: it.videoId, title: it.title, author_name: it.author, thumbnail_url: it.thumbnail,
      }))
      await sb.from('games').update({ youtube_videos: videos, youtube_item_count: count }).eq('id', t.id)
    } else {
      // Full mirror: replace the playlist's video rows with the current items.
      await sb.from('videos').delete().eq('playlist_id', t.id)
      if (items.length > 0) {
        const rows = items.map((it, i) => ({
          user_id: t.userId,
          url: youtubeCanonicalUrl('video', it.videoId),
          kind: 'video',
          youtube_id: it.videoId,
          title: it.title,
          author_name: it.author,
          thumbnail_url: it.thumbnail,
          playlist_id: t.id,
          position: i,
        }))
        await sb.from('videos').insert(rows)
      }
      await sb.from('playlists').update({ youtube_item_count: count, synced_at: new Date().toISOString() }).eq('id', t.id)
    }
    synced++
  }

  return NextResponse.json({ ok: true, targets: targets.length, synced, skipped, gone })
}
