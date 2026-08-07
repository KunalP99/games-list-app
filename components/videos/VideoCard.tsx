'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { youtubeEmbedUrl } from '@/lib/youtube'
import DeleteVideoButton from './DeleteVideoButton'

// Minimal shape a card needs — the full `Video` row satisfies it structurally,
// and game pages can pass lightweight objects built from `games.youtube_videos`.
export type VideoCardData = {
  id: string
  kind: 'video' | 'playlist'
  youtube_id: string
  title: string
  author_name: string | null
  thumbnail_url: string | null
}

export default function VideoCard({ video, isAdmin }: { video: VideoCardData; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden flex flex-col">
      <div className="relative w-full aspect-video bg-surface-sunken">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group absolute inset-0 w-full h-full"
          aria-label={`Play ${video.title}`}
        >
          {video.thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={video.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-5xl">🎬</div>
          )}
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center justify-center w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-white translate-x-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
          {video.kind === 'playlist' && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm border border-white/20 text-white text-[11px] font-semibold">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h11M4 12h11M4 18h7M17 12l4 3-4 3v-6z" />
              </svg>
              Playlist
            </span>
          )}
        </button>

        {isAdmin && (
          <div className="absolute top-2 right-2 z-10" onClick={e => e.stopPropagation()}>
            <DeleteVideoButton id={video.id} />
          </div>
        )}
      </div>

      {/* Meta — fixed height (2-line title + 1 author line) so every card is the
          same size; long titles clamp with an ellipsis. */}
      <div className="px-4 py-3">
        <p className="text-sm font-semibold text-fg-base truncate">{video.title}</p>
        <p className="text-xs text-fg-muted mt-0.5 truncate min-h-[1rem]">
          {video.author_name && `by ${video.author_name}`}
        </p>
      </div>

      {/* Lightbox player */}
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-5xl">
            <div className="flex items-center justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-white truncate">{video.title}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors"
                aria-label="Close"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={youtubeEmbedUrl(video.kind, video.youtube_id)}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
