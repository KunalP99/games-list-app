'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import useEmblaCarousel from 'embla-carousel-react'
import VideoCard, { type VideoCardData } from './VideoCard'
import DeletePlaylistButton from './DeletePlaylistButton'

// A titled horizontal carousel of videos. Used for the standalone "Videos" row
// and for each playlist (title = playlist name, with optional YouTube link +
// admin delete).
export default function VideoRow({
  title,
  titleHref,
  videos,
  isAdmin,
  youtubeUrl,
  playlistId,
}: {
  title: string
  titleHref?: string
  videos: VideoCardData[]
  isAdmin: boolean
  youtubeUrl?: string | null
  playlistId?: string
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps', dragFree: true })
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setCanPrev(emblaApi.canScrollPrev())
    setCanNext(emblaApi.canScrollNext())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on('select', onSelect).on('reInit', onSelect)
    return () => { emblaApi.off('select', onSelect).off('reInit', onSelect) }
  }, [emblaApi, onSelect])

  if (videos.length === 0) return null

  const arrow = 'flex items-center justify-center w-8 h-8 rounded-full border border-edge-base text-fg-secondary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors'

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {titleHref ? (
            <Link href={titleHref} className="text-lg font-semibold text-fg-base truncate hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
              {title}
            </Link>
          ) : (
            <h2 className="text-lg font-semibold text-fg-base truncate">{title}</h2>
          )}
          {youtubeUrl && (
            <a
              href={youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-800 dark:hover:text-brand-400 transition-colors"
            >
              Watch on YouTube ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin && playlistId && <DeletePlaylistButton id={playlistId} />}
          <button type="button" onClick={() => emblaApi?.scrollPrev()} disabled={!canPrev} className={arrow} aria-label="Scroll left">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={() => emblaApi?.scrollNext()} disabled={!canNext} className={arrow} aria-label="Scroll right">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-4">
          {videos.map(v => (
            <div key={v.id} className="shrink-0 w-72 max-w-[85vw]">
              <VideoCard video={v} isAdmin={isAdmin} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
