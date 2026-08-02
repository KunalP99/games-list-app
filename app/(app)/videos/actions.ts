'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseYouTubeUrl, youtubeThumbnail, youtubeCanonicalUrl } from '@/lib/youtube'
import { fetchYouTubeOEmbed } from '@/lib/youtube-api'

type Result = { success: true } | { success: false; error: string }

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single() as { data: { is_admin: boolean } | null }
  return profile?.is_admin ? user : null
}

// Run an async mapper over items with a bounded number in flight, preserving
// input order in the results.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

// Shared keyless oEmbed lookup (title/author/thumbnail).
const fetchOEmbed = fetchYouTubeOEmbed

export async function createVideo(formData: FormData): Promise<Result> {
  const supabase = createClient()
  const user = await requireAdmin(supabase)
  if (!user) return { success: false, error: 'Only the curator can add videos.' }

  const rawUrl = (formData.get('url') as string)?.trim() ?? ''
  const customTitle = (formData.get('title') as string)?.trim() || null

  const parsed = parseYouTubeUrl(rawUrl)
  if (!parsed) return { success: false, error: 'Enter a valid YouTube video URL.' }
  if (parsed.kind === 'playlist') {
    return { success: false, error: 'To add a playlist, turn on “Make a playlist” and add its videos.' }
  }

  const canonical = youtubeCanonicalUrl(parsed.kind, parsed.id)
  const oembed = await fetchOEmbed(canonical)

  const title = customTitle ?? oembed?.title ?? 'YouTube video'
  const thumbnail_url = oembed?.thumbnail_url ?? youtubeThumbnail('video', parsed.id)

  const { error } = await supabase.from('videos').insert({
    user_id: user.id,
    url: canonical,
    kind: parsed.kind,
    youtube_id: parsed.id,
    title,
    author_name: oembed?.author_name ?? null,
    thumbnail_url,
  })

  if (error) return { success: false, error: error.message }
  revalidatePath('/videos')
  return { success: true }
}

export async function deleteVideo(id: string): Promise<Result> {
  const supabase = createClient()
  const user = await requireAdmin(supabase)
  if (!user) return { success: false, error: 'Only the curator can remove videos.' }

  const { error } = await supabase.from('videos').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/videos')
  return { success: true }
}

// Create an in-site playlist: a titled collection of individual videos, with an
// optional YouTube playlist link for viewers who'd rather watch it on YouTube.
export async function createPlaylist(formData: FormData): Promise<Result> {
  const supabase = createClient()
  const user = await requireAdmin(supabase)
  if (!user) return { success: false, error: 'Only the curator can add playlists.' }

  const title = (formData.get('title') as string)?.trim()
  if (!title) return { success: false, error: 'Give the playlist a title.' }

  // Optional "watch on YouTube" link — must be an actual YouTube playlist.
  const rawYt = (formData.get('youtube_url') as string)?.trim() || ''
  let youtubeUrl: string | null = null
  if (rawYt) {
    const p = parseYouTubeUrl(rawYt)
    if (!p || p.kind !== 'playlist') {
      return { success: false, error: 'The “watch on YouTube” link must be a YouTube playlist URL.' }
    }
    youtubeUrl = youtubeCanonicalUrl('playlist', p.id)
  }

  // Validate every video URL up front so we never create a half-empty playlist.
  const rawUrls = formData.getAll('url').map(u => String(u).trim()).filter(Boolean)
  if (rawUrls.length === 0) return { success: false, error: 'Add at least one video to the playlist.' }

  const parsedVideos = []
  for (const raw of rawUrls) {
    const parsed = parseYouTubeUrl(raw)
    if (!parsed || parsed.kind !== 'video') {
      return { success: false, error: `Not a valid YouTube video URL: ${raw}` }
    }
    parsedVideos.push(parsed)
  }

  const { data: playlist, error: plErr } = await supabase
    .from('playlists')
    .insert({ user_id: user.id, title, youtube_url: youtubeUrl })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }
  if (plErr || !playlist) return { success: false, error: plErr?.message ?? 'Could not create playlist.' }

  // Enrich each video (oEmbed) with a few in flight at once, then batch-insert.
  const rows = await mapWithConcurrency(parsedVideos, 5, async (v, i) => {
    const canonical = youtubeCanonicalUrl('video', v.id)
    const oembed = await fetchOEmbed(canonical)
    return {
      user_id: user.id,
      url: canonical,
      kind: 'video' as const,
      youtube_id: v.id,
      title: oembed?.title ?? 'YouTube video',
      author_name: oembed?.author_name ?? null,
      thumbnail_url: oembed?.thumbnail_url ?? youtubeThumbnail('video', v.id),
      playlist_id: playlist.id,
      position: i,
    }
  })

  const { error: vErr } = await supabase.from('videos').insert(rows)
  if (vErr) {
    // Roll back the whole playlist so we don't leave a partial one behind.
    await supabase.from('playlists').delete().eq('id', playlist.id)
    return { success: false, error: vErr.message }
  }

  revalidatePath('/videos')
  return { success: true }
}

// Fetch a YouTube playlist's videos for the import preview — returns the list so
// the client can pre-fill the form (title + link + editable video rows).
export async function fetchPlaylistForImport(playlistUrl: string): Promise<
  | { success: true; title: string; youtubeUrl: string; videos: { url: string; title: string }[] }
  | { success: false; error: string }
> {
  const supabase = createClient()
  const user = await requireAdmin(supabase)
  if (!user) return { success: false, error: 'Only the curator can import playlists.' }

  const parsed = parseYouTubeUrl((playlistUrl ?? '').trim())
  if (!parsed || parsed.kind !== 'playlist') {
    return { success: false, error: 'Enter a YouTube playlist URL.' }
  }
  const canonical = youtubeCanonicalUrl('playlist', parsed.id)

  const { fetchYouTubePlaylistItems } = await import('@/lib/youtube-api')
  const items = await fetchYouTubePlaylistItems(parsed.id)
  if (items.length === 0) {
    return { success: false, error: 'No videos found — check the playlist is public/unlisted and that YOUTUBE_API_KEY is set.' }
  }

  const oembed = await fetchOEmbed(canonical)
  return {
    success: true,
    title: oembed?.title ?? 'Imported playlist',
    youtubeUrl: canonical,
    videos: items.map(it => ({ url: youtubeCanonicalUrl('video', it.videoId), title: it.title })),
  }
}

export async function deletePlaylist(id: string): Promise<Result> {
  const supabase = createClient()
  const user = await requireAdmin(supabase)
  if (!user) return { success: false, error: 'Only the curator can remove playlists.' }

  // Child videos cascade via the FK.
  const { error } = await supabase.from('playlists').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/videos')
  return { success: true }
}
