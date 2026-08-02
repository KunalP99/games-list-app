// YouTube URL parsing + embed/thumbnail helpers for the Videos library.
// Pure functions — no network, no secrets.

export type ParsedYouTube = { kind: 'video' | 'playlist'; id: string }

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,}$/

// Extracts the video/playlist identity from any common YouTube URL form.
// Precedence: an explicit /playlist page (or a bare ?list= with no video) is a
// playlist; otherwise a video id from watch?v=, youtu.be/<id>, /shorts/<id> or
// /embed/<id>. A watch URL carrying both v= and list= is treated as a single
// video (you linked a video, not the whole list). Returns null if nothing valid.
export function parseYouTubeUrl(raw: string): ParsedYouTube | null {
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase()
  const isYouTubeHost =
    host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be'
  if (!isYouTubeHost) return null

  const parts = url.pathname.split('/').filter(Boolean)
  const list = url.searchParams.get('list')

  // Dedicated playlist page → always a playlist.
  if (parts[0] === 'playlist') {
    return list && PLAYLIST_ID.test(list) ? { kind: 'playlist', id: list } : null
  }

  // Resolve any video id present. Covers watch?v=, youtu.be/<id>, and the
  // /shorts/, /embed/, /live/, /v/ path forms.
  let videoId: string | null = null
  if (host === 'youtu.be') {
    videoId = parts[0] ?? null
  } else if (parts[0] === 'watch') {
    videoId = url.searchParams.get('v')
  } else if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live' || parts[0] === 'v') {
    videoId = parts[1] ?? null
  }

  if (videoId && VIDEO_ID.test(videoId)) return { kind: 'video', id: videoId }

  // No video id, but a playlist reference → playlist.
  if (list && PLAYLIST_ID.test(list)) return { kind: 'playlist', id: list }

  return null
}

// Player URL for click-to-play embedding.
export function youtubeEmbedUrl(kind: 'video' | 'playlist', id: string, autoplay = true): string {
  const auto = autoplay ? '?autoplay=1' : ''
  return kind === 'playlist'
    ? `https://www.youtube.com/embed/videoseries?list=${id}${autoplay ? '&autoplay=1' : ''}`
    : `https://www.youtube.com/embed/${id}${auto}`
}

// Direct thumbnail for a video id (no API needed). Playlists have no direct
// thumbnail URL, so those rely on the oEmbed thumbnail fetched at add-time.
export function youtubeThumbnail(kind: 'video' | 'playlist', id: string): string | null {
  return kind === 'video' ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
}

// Canonical watch/playlist URL for the oEmbed lookup and outbound links.
export function youtubeCanonicalUrl(kind: 'video' | 'playlist', id: string): string {
  return kind === 'playlist'
    ? `https://www.youtube.com/playlist?list=${id}`
    : `https://www.youtube.com/watch?v=${id}`
}

// A game's stored video (games.youtube_videos JSONB item).
export type GameVideo = {
  youtube_id: string
  title: string
  author_name: string | null
  thumbnail_url: string | null
}

// Shape a VideoCard/VideoRow needs (matches VideoCardData in components/videos).
export type GameVideoCard = {
  id: string
  kind: 'video'
  youtube_id: string
  title: string
  author_name: string | null
  thumbnail_url: string | null
}

// Adapt a game's stored videos to the card shape used by VideoRow/VideoCard.
export function mapGameVideos(items: GameVideo[]): GameVideoCard[] {
  return items.map(v => ({
    id: v.youtube_id,
    kind: 'video',
    youtube_id: v.youtube_id,
    title: v.title,
    author_name: v.author_name,
    thumbnail_url: v.thumbnail_url,
  }))
}
