'use client'

import { useState } from 'react'
import { youtubeEmbedUrl, youtubeThumbnail } from '@/lib/youtube'

type Item =
  | { kind: 'video'; name: string; youtubeId: string; thumb: string }
  | { kind: 'image'; src: string }

/**
 * The store page's media: one big viewer and a strip of thumbnails under it,
 * trailers first (lib/store-page.ts `orderVideos`), then screenshots. A
 * trailer shows its thumbnail with a play button until clicked, then plays in
 * place (YouTube, allowed by the CSP in lib/csp.ts).
 */
export default function StoreMedia({ name, videos, screenshots }: {
  name: string
  videos: { name: string; youtubeId: string }[]
  screenshots: string[]
}) {
  const items: Item[] = [
    ...videos.map(v => ({ kind: 'video' as const, name: v.name, youtubeId: v.youtubeId, thumb: youtubeThumbnail('video', v.youtubeId)! })),
    ...screenshots.map(src => ({ kind: 'image' as const, src })),
  ]
  const [selected, setSelected] = useState(0)
  const [playing, setPlaying] = useState(false)
  const current = items[selected]

  if (!current) {
    return (
      <div className="aspect-video w-full rounded-2xl bg-surface-sunken border border-edge-base flex items-center justify-center text-sm text-fg-muted">
        No trailer or screenshots yet
      </div>
    )
  }

  function pick(i: number) {
    setSelected(i)
    setPlaying(false)
  }

  return (
    <div className="flex flex-col gap-2.5 min-w-0">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-900">
        {current.kind === 'video' && playing ? (
          <iframe
            src={youtubeEmbedUrl('video', current.youtubeId)}
            title={`${name}: ${current.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            className="absolute inset-0 h-full w-full"
          />
        ) : current.kind === 'video' ? (
          <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${current.name}`} className="group absolute inset-0">
            <img src={current.thumb} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 bg-black/25 group-hover:bg-black/35 transition-colors" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 border border-white/25 group-hover:scale-110 transition-transform">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
              </span>
            </span>
            <span className="absolute left-4 bottom-3 text-sm text-white/85 drop-shadow">{current.name}</span>
          </button>
        ) : (
          <img src={current.src} alt={`${name} screenshot`} className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" role="list" aria-label="Trailers and screenshots">
          {items.map((item, i) => (
            <button
              key={item.kind === 'video' ? item.youtubeId : item.src}
              type="button"
              role="listitem"
              onClick={() => pick(i)}
              aria-label={item.kind === 'video' ? item.name : `Screenshot ${i - videos.length + 1}`}
              aria-current={i === selected}
              className={`relative w-28 sm:w-32 shrink-0 aspect-video overflow-hidden rounded-lg border-2 transition-colors ${i === selected ? 'border-brand-600' : 'border-transparent hover:border-edge-input'}`}
            >
              <img src={item.kind === 'video' ? item.thumb : item.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {item.kind === 'video' && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
