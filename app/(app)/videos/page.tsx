import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Video, Playlist } from '@/lib/types'
import { mapGameVideos, type GameVideo } from '@/lib/youtube'
import VideoRow from '@/components/videos/VideoRow'
import VideoCard, { type VideoCardData } from '@/components/videos/VideoCard'
import VideosFilters from '@/components/videos/VideosFilters'
import AddVideoForm from '@/components/videos/AddVideoForm'

type GameMedia = { id: string; title: string; youtube_videos: GameVideo[] | null; youtube_playlist_url: string | null; updated_at: string }

// One individual video from any source, with a date + searchable text.
type FlatVideo = { card: VideoCardData; date: string; haystack: string }

export default async function VideosPage({ searchParams }: { searchParams: { q?: string; sort?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [videosRes, playlistsRes, gamesRes, profileRes] = await Promise.all([
    supabase.from('videos').select('*').order('position', { ascending: true }),
    supabase.from('playlists').select('*').order('created_at', { ascending: false }),
    supabase.from('games').select('id, title, youtube_videos, youtube_playlist_url, updated_at').order('updated_at', { ascending: false }),
    supabase.from('profiles').select('is_admin').eq('id', user.id).single(),
  ])

  const allVideos = (videosRes.data ?? []) as Video[]
  const playlists = (playlistsRes.data ?? []) as Playlist[]
  const gameMedia = ((gamesRes.data ?? []) as GameMedia[]).filter(g => (g.youtube_videos?.length ?? 0) > 0)
  const isAdmin = Boolean((profileRes.data as { is_admin: boolean } | null)?.is_admin)

  const q = (searchParams.q ?? '').trim().toLowerCase()
  const sort = searchParams.sort === 'oldest' ? 'oldest' : 'newest'
  const byDate = (a: string, b: string) => (sort === 'oldest' ? a.localeCompare(b) : b.localeCompare(a))

  // Standalone videos vs playlist videos.
  const videosByPlaylist = new Map<string, Video[]>()
  const standalone: Video[] = []
  for (const v of allVideos) {
    if (v.playlist_id) {
      const arr = videosByPlaylist.get(v.playlist_id) ?? []
      arr.push(v)
      videosByPlaylist.set(v.playlist_id, arr)
    } else {
      standalone.push(v)
    }
  }

  const hasContent = standalone.length > 0 || playlists.length > 0 || gameMedia.length > 0

  // ── Search mode: flat grid of every matching video across all sources ──
  if (q) {
    const flat: FlatVideo[] = []
    const hay = (...parts: (string | null)[]) => parts.filter(Boolean).join(' ').toLowerCase()

    for (const v of standalone) {
      flat.push({ card: v, date: v.created_at, haystack: hay(v.title, v.author_name) })
    }
    for (const pl of playlists) {
      for (const v of videosByPlaylist.get(pl.id) ?? []) {
        flat.push({ card: v, date: v.created_at, haystack: hay(v.title, v.author_name, pl.title) })
      }
    }
    for (const g of gameMedia) {
      for (const card of mapGameVideos(g.youtube_videos ?? [])) {
        flat.push({ card, date: g.updated_at, haystack: hay(card.title, card.author_name, g.title) })
      }
    }

    const matches = flat.filter(f => f.haystack.includes(q)).sort((a, b) => byDate(a.date, b.date))

    return (
      <div className="space-y-6">
        <Header isAdmin={isAdmin} />
        <VideosFilters />
        {matches.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
            {matches.map((m, i) => (
              <VideoCard key={`${m.card.id}-${i}`} video={m.card} isAdmin={false} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-subtle py-10 text-center">No videos match “{searchParams.q}”.</p>
        )}
      </div>
    )
  }

  // ── Browse mode: carousel rows ──
  const standaloneSorted = [...standalone].sort((a, b) => byDate(a.created_at, b.created_at))

  const rows: { key: string; date: string; node: React.ReactNode }[] = [
    ...playlists.map(pl => ({
      key: `pl-${pl.id}`,
      date: pl.created_at,
      node: (
        <VideoRow
          title={pl.title}
          videos={videosByPlaylist.get(pl.id) ?? []}
          isAdmin={isAdmin}
          youtubeUrl={pl.youtube_url}
          playlistId={pl.id}
        />
      ),
    })),
    ...gameMedia.map(g => ({
      key: `game-${g.id}`,
      date: g.updated_at,
      node: (
        <VideoRow
          title={g.title}
          titleHref={`/games/${g.id}`}
          videos={mapGameVideos(g.youtube_videos ?? [])}
          isAdmin={false}
          youtubeUrl={g.youtube_playlist_url}
        />
      ),
    })),
  ].sort((a, b) => byDate(a.date, b.date))

  return (
    <div className="space-y-8">
      <Header isAdmin={isAdmin} />
      {hasContent && <VideosFilters />}
      {hasContent ? (
        <>
          <VideoRow title="Videos" videos={standaloneSorted} isAdmin={isAdmin} />
          {rows.map(r => <div key={r.key}>{r.node}</div>)}
        </>
      ) : (
        <div className="text-center py-16 text-fg-subtle">
          <p className="text-4xl mb-3">🎬</p>
          <p className="font-medium text-fg-secondary">No videos yet</p>
          <p className="text-sm mt-1">
            {isAdmin ? 'Add a YouTube video or build a playlist to get started.' : 'Check back soon.'}
          </p>
        </div>
      )}
    </div>
  )
}

function Header({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Videos</h1>
        <p className="text-sm text-fg-muted mt-0.5">Videos and playlists from you and your friends</p>
      </div>
      {isAdmin && <AddVideoForm />}
    </div>
  )
}
