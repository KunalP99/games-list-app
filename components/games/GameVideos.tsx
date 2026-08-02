import { parseYouTubeUrl } from '@/lib/youtube'
import type { GameVideoCard } from '@/lib/youtube'
import VideoRow from '@/components/videos/VideoRow'
import VideoCard from '@/components/videos/VideoCard'

// A game's media block, reused on the game detail page:
//   2+ videos → carousel row; 1 video → a single large player card;
//   no videos but a legacy playlist URL → the classic playlist embed.
export default function GameVideos({
  videos,
  playlistUrl,
}: {
  videos: GameVideoCard[]
  playlistUrl: string | null
}) {
  if (videos.length >= 2) {
    return <VideoRow title="Playlist" videos={videos} isAdmin={false} youtubeUrl={playlistUrl} />
  }

  if (videos.length === 1) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Video</p>
        <div className="max-w-2xl">
          <VideoCard video={videos[0]} isAdmin={false} />
        </div>
      </div>
    )
  }

  const parsedPlaylist = playlistUrl ? parseYouTubeUrl(playlistUrl) : null
  const playlistId = parsedPlaylist?.kind === 'playlist' ? parsedPlaylist.id : null
  if (playlistUrl && playlistId) {
    return (
      <div className="bg-surface-base border border-edge-base rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Playlist</p>
          <a
            href={playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-brand-500 hover:text-brand-400 transition-colors"
          >
            View full playlist ↗
          </a>
        </div>
        <div className="relative w-full aspect-video rounded-lg overflow-hidden">
          <iframe
            src={`https://www.youtube.com/embed/videoseries?list=${playlistId}&listType=playlist`}
            title="Playlist"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    )
  }

  return null
}
