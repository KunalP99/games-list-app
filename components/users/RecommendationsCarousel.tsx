'use client'

import useEmblaCarousel from 'embla-carousel-react'
import Autoplay from 'embla-carousel-autoplay'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import AddToBacklogButton from '@/components/users/AddToBacklogButton'

type Recommendation = {
  id: string
  title: string
  genres: string[] | null
  rating: number | null
  image_url: string | null
  developer: string | null
  recommendedBy: string
}

export default function RecommendationsCarousel({ games }: { games: Recommendation[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true },
    [Autoplay({ delay: 8000, stopOnInteraction: false })],
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
    <div className="flex-1 min-h-0 relative">
      <div ref={emblaRef} className="overflow-hidden rounded-xl h-full">
        <div className="flex h-full">
          {games.map((game, i) => (
            <Link
              key={i}
              href={`/games/${game.id}`}
              className="flex-[0_0_100%] min-w-0 relative block"
            >
              <div className="relative w-full h-full min-h-36 bg-surface-active">
                {game.image_url
                  ? <img src={game.image_url} alt={game.title} className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 flex items-center justify-center text-5xl">🎮</div>
                }

                {/* Gradient overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent" />

                {/* Bottom content */}
                <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white leading-tight line-clamp-1">{game.title}</p>
                    <p className="text-[11px] text-white/60 mt-0.5">
                      from <span className="text-white/80 font-medium">{game.recommendedBy}</span>
                      {game.rating != null && <span className="ml-2">⭐ {game.rating}/5</span>}
                    </p>
                  </div>
                  <div onClick={(e) => e.preventDefault()}>
                    <AddToBacklogButton game={game} variant="glass" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Title — rendered once, outside the slides */}
      <p className="absolute top-0 left-0 right-0 px-3 pt-2.5 text-xs font-semibold text-white uppercase tracking-wider pointer-events-none">
        Recommended by your friends
      </p>

      {/* Dot indicators — rendered once, outside the slides */}
      <div className="absolute top-2.5 right-3 flex gap-1.5">
        {games.map((_, j) => (
          <button
            key={j}
            onClick={() => emblaApi?.scrollTo(j)}
            className={`rounded-full transition-all duration-300 ${
              j === selectedIndex
                ? 'w-4 h-1.5 bg-white'
                : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
            }`}
            aria-label={`Go to slide ${j + 1}`}
          />
        ))}
      </div>
    </div>
  )
}
