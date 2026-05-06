'use client'

import { useState, useTransition } from 'react'
import { addRecommendationToBacklog } from '@/app/(app)/games/actions'

type Game = {
  title: string
  developer: string | null
  image_url: string | null
  genres: string[] | null
}

export default function AddToBacklogButton({ game, variant = 'overlay' }: { game: Game; variant?: 'overlay' | 'outline' | 'glass' }) {
  const [added, setAdded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleClick = (e: React.MouseEvent) => {
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
  }

  if (added) {
    if (variant === 'outline') {
      return <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Added to backlog</span>
    }
    return <span className="text-xs font-semibold text-emerald-400">✓ Added</span>
  }

  if (variant === 'outline') {
    return (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium border border-edge-base text-fg-secondary rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40"
      >
        {isPending ? 'Adding…' : '+ Add to Backlog'}
      </button>
    )
  }

  if (variant === 'glass') {
    return (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-black/60 transition-colors disabled:opacity-40 shrink-0"
      >
        {isPending ? '…' : '+ Backlog'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-[10px] font-semibold text-white bg-white/20 hover:bg-white/35 backdrop-blur-sm rounded-full px-2 py-0.5 transition-colors disabled:opacity-40 shrink-0"
    >
      {isPending ? '...' : '+ Backlog'}
    </button>
  )
}
