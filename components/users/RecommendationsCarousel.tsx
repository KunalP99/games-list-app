'use client'

import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import Fade from 'embla-carousel-fade'
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
    { loop: true },
    [Autoplay({ delay: 3500, stopOnInteraction: false }), Fade()],
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
      {/* Viewport */}
      <div ref={emblaRef} className="overflow-hidden rounded-xl">
        <div className="flex">
          {games.map((game, i) => (
            <div key={i} className="flex-[0_0_100%] min-w-0 relative">
              {/* Cover image */}
              <div className="relative w-full h-64 bg-surface-active">
                {game.image_url
                  ? <img src={game.image_url} alt={game.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-5xl">🎮</div>
                }
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                {/* Text over image */}
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
              </div>
            </div>
          ))}
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
