'use client'

import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import { useCallback, useEffect, useState } from 'react'

type Recommendation = {
  title: string
  genres: string[] | null
  rating: number | null
  image_url: string | null
  developer: string | null
}

export default function RecommendationsCarousel({ games }: { games: Recommendation[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, align: 'center', containScroll: false },
    [Autoplay({ delay: 3500, stopOnInteraction: false })],
  )
  const [selectedIndex, setSelectedIndex] = useState(0)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    onSelect()
    return () => { emblaApi.off('select', onSelect) }
  }, [emblaApi, onSelect])

  return (
    <div className="space-y-3">
      {/* Outer wrapper clips the peeking slides */}
      <div className="overflow-hidden">
        {/* Embla viewport — intentionally wider than its container via negative margin so adjacent slides peek in */}
        <div ref={emblaRef}>
          <div className="flex gap-3">
            {games.map((game, i) => {
              const isActive = i === selectedIndex
              return (
                <div
                  key={i}
                  className={`flex-[0_0_78%] min-w-0 relative rounded-xl overflow-hidden transition-opacity duration-500 cursor-pointer ${
                    isActive ? 'opacity-100' : 'opacity-40 hover:opacity-60'
                  }`}
                  onClick={() => emblaApi?.scrollTo(i)}
                >
                  <div className="relative w-full h-64 bg-surface-active">
                    {game.image_url
                      ? <img src={game.image_url} alt={game.title} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-5xl">🎮</div>
                    }
                    {/* Gradient overlay — only on active */}
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    )}
                    {/* Text — only on active */}
                    {isActive && (
                      <div className="absolute bottom-0 left-0 right-0 p-4">
                        <p className="text-base font-bold text-white leading-tight">{game.title}</p>
                        {game.developer && (
                          <p className="text-sm text-white/70 mt-0.5">{game.developer}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          {game.rating != null && (
                            <span className="text-xs text-white/80">⭐ {game.rating}/5</span>
                          )}
                          {game.genres?.[0] && (
                            <span className="text-xs text-white/60">{game.genres[0]}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5">
        {games.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`rounded-full transition-all duration-300 ${
              i === selectedIndex
                ? 'w-4 h-1.5 bg-fg-base'
                : 'w-1.5 h-1.5 bg-fg-subtle hover:bg-fg-muted'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
