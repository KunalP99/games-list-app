// Server-only YouTube Data API v3 access (needs YOUTUBE_API_KEY). Mirrors the
// safe-fallback pattern in lib/rawg.ts. Used to enumerate the videos inside a
// playlist — something the keyless oEmbed endpoint can't do.

const API_BASE = 'https://www.googleapis.com/youtube/v3'

// Keyless oEmbed lookup — title/author/thumbnail for a single video or playlist.
export async function fetchYouTubeOEmbed(canonicalUrl: string): Promise<{ title?: string; author_name?: string; thumbnail_url?: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export type YouTubePlaylistItem = {
  videoId: string
  title: string
  author: string | null
  thumbnail: string | null
}

type RawItem = {
  snippet?: {
    title?: string
    videoOwnerChannelTitle?: string
    resourceId?: { videoId?: string }
    thumbnails?: Record<string, { url?: string }>
  }
}

const UNAVAILABLE = new Set(['Deleted video', 'Private video'])

// Fetches every available video in a public/unlisted playlist, following
// pagination. Returns [] on missing key or any error.
export async function fetchYouTubePlaylistItems(playlistId: string): Promise<YouTubePlaylistItem[]> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) return []

  const items: YouTubePlaylistItem[] = []
  let pageToken = ''
  try {
    // Cap pages defensively (100 pages × 50 = 5000 videos) to avoid runaway loops.
    for (let page = 0; page < 100; page++) {
      const url = `${API_BASE}/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(playlistId)}&key=${key}${pageToken ? `&pageToken=${pageToken}` : ''}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) break
      const data = await res.json() as { items?: RawItem[]; nextPageToken?: string }

      for (const it of data.items ?? []) {
        const videoId = it.snippet?.resourceId?.videoId
        const title = it.snippet?.title ?? ''
        if (!videoId || UNAVAILABLE.has(title)) continue // deleted/private entries
        const thumbs = it.snippet?.thumbnails ?? {}
        items.push({
          videoId,
          title: title || 'YouTube video',
          author: it.snippet?.videoOwnerChannelTitle ?? null,
          thumbnail: thumbs.medium?.url ?? thumbs.default?.url ?? null,
        })
      }

      if (!data.nextPageToken) break
      pageToken = data.nextPageToken
    }
  } catch {
    return items
  }
  return items
}
