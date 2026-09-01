'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import type { RelatedGame } from '@/lib/rawg'
import ReviewGameModal from '@/components/wheel/ReviewGameModal'
import { addRecommendationToBacklog } from '@/app/(app)/games/actions'

// Most-anticipated games as a big-banner carousel (one game at a time). The
// user switches games via arrows/dots; each banner has an "Add to backlog"
// button that opens the review modal (details + required platform).
export default function AnticipatedGames({ games }: { games: RelatedGame[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 10000, stopOnInteraction: false, stopOnMouseEnter: true })])
  const [selectedIndex, setSelectedIndex] = useState(0)

  const [pendingAdd, setPendingAdd] = useState<{ id: number; name: string } | null>(null)
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const onSelect = useCallback(() => {
    if (emblaApi) setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    onSelect()
    return () => { emblaApi.off('select', onSelect) }
  }, [emblaApi, onSelect])

  function confirm(platform: string, image: string | null, steamDeck: boolean) {
    if (!pendingAdd) return
    const game = pendingAdd
    startTransition(async () => {
      const fd = new FormData()
      fd.set('title', game.name)
      fd.set('rawg_id', String(game.id))
      fd.set('platform', platform)
      if (image) fd.set('chosen_image', image)
      if (steamDeck) fd.set('steam_deck', 'on')
      const res = await addRecommendationToBacklog(fd)
      if (res.success) {
        setAddedIds(prev => new Set(prev).add(game.id))
        setPendingAdd(null)
        setError('')
      } else {
        setError(res.error ?? 'Failed to add to backlog')
      }
    })
  }

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-xl shadow-md" ref={emblaRef}>
        <div className="flex">
          {games.map(g => {
            const added = addedIds.has(g.id)
            const banner = g.bannerUrl ?? g.coverUrl
            return (
              <div key={g.id} className="flex-[0_0_100%] min-w-0 relative aspect-[16/9] bg-zinc-900">
                {banner ? (
                  // Whole banner shown (object-contain); any letterbox area is a clean dark fill.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={banner} alt={g.name} className="absolute inset-0 w-full h-full object-contain" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-5xl">🎮</div>
                )}
                {/* Gradients for text/button legibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

                {/* Title + release year */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg sm:text-2xl font-bold text-white leading-tight drop-shadow line-clamp-2">{g.name}</h3>
                    <p className="text-xs sm:text-sm text-white/75 mt-1 drop-shadow">{g.released ? new Date(g.released).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Release date TBD'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setError(''); setPendingAdd({ id: g.id, name: g.name }) }}
                    disabled={added}
                    className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium backdrop-blur-sm transition-colors disabled:opacity-100 ${
                      added ? 'bg-emerald-600/85 text-white' : 'bg-white/15 hover:bg-white/25 text-white border border-white/25'
                    }`}
                  >
                    {added ? '✓ Added' : '+ Backlog'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Prev / next arrows */}
      <button
        type="button"
        aria-label="Previous"
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
      >
        ›
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {games.map((_, j) => (
          <button
            key={j}
            type="button"
            aria-label={`Go to slide ${j + 1}`}
            onClick={() => emblaApi?.scrollTo(j)}
            className={`rounded-full transition-all duration-300 ${
              j === selectedIndex ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
      </div>

      {pendingAdd && (
        <ReviewGameModal
          game={pendingAdd}
          isPending={isPending}
          error={error}
          heading="Add to your backlog"
          confirmLabel="Add to backlog"
          showSteamDeck
          onConfirm={confirm}
          onCancel={() => { setPendingAdd(null); setError('') }}
        />
      )}
    </div>
  )
}
