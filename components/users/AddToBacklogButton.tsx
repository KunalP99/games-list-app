'use client'

import { useState, useTransition } from 'react'
import { addRecommendationToBacklog } from '@/app/(app)/games/actions'

type Game = {
  title: string
  developer: string | null
  image_url: string | null
  genres: string[] | null
}

export default function AddToBacklogButton({ game }: { game: Game }) {
  const [added, setAdded] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (added) {
    return <span className="text-[10px] font-semibold text-emerald-400">✓ Added</span>
  }

  return (
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        startTransition(async () => {
          const formData = new FormData()
          formData.set('title', game.title)
          formData.set('developer', game.developer ?? '')
          formData.set('image_url', game.image_url ?? '')
          formData.set('genres', JSON.stringify(game.genres ?? []))
          const result = await addRecommendationToBacklog(formData)
          if (result.success) setAdded(true)
        })
      }}
      disabled={isPending}
      className="text-[10px] font-semibold text-white bg-white/20 hover:bg-white/35 backdrop-blur-sm rounded-full px-2 py-0.5 transition-colors disabled:opacity-40 shrink-0"
    >
      {isPending ? '...' : '+ Backlog'}
    </button>
  )
}
