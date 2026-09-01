'use client'

import { useState, useTransition } from 'react'
import { addRecommendationToBacklog } from '@/app/(app)/games/actions'
import ReviewGameModal from '@/components/wheel/ReviewGameModal'

type Game = {
  title: string
  developer: string | null
  image_url: string | null
  genres: string[] | null
  rawg_id: number | null
  release_date: string | null
}

export default function AddToBacklogButton({ game, variant = 'overlay' }: { game: Game; variant?: 'overlay' | 'outline' | 'glass' | 'expand' }) {
  const [added, setAdded] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function doAdd(platform: string | null, image: string | null, steamDeck = false) {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('title', game.title)
      formData.set('developer', game.developer ?? '')
      formData.set('image_url', game.image_url ?? '')
      formData.set('genres', JSON.stringify(game.genres ?? []))
      formData.set('rawg_id', game.rawg_id != null ? String(game.rawg_id) : '')
      formData.set('release_date', game.release_date ?? '')
      if (platform) formData.set('platform', platform)
      if (image) formData.set('chosen_image', image)
      if (steamDeck) formData.set('steam_deck', 'on')
      const result = await addRecommendationToBacklog(formData)
      if (result.success) { setAdded(true); setShowModal(false); setError('') }
      else setError(result.error ?? 'Failed to add to backlog')
    })
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Review (details + image + required platform) when we have a game to look
    // up; free-text games with no provider id are added directly.
    if (game.rawg_id != null) setShowModal(true)
    else doAdd(null, null)
  }

  const modal = showModal ? (
    <ReviewGameModal
      game={{ id: game.rawg_id!, name: game.title }}
      isPending={isPending}
      error={error}
      heading="Add to your backlog"
      confirmLabel="Add to backlog"
      showSteamDeck
      onConfirm={(platform, image, steamDeck) => doAdd(platform, image, steamDeck)}
      onCancel={() => { setShowModal(false); setError('') }}
    />
  ) : null

  let button: React.ReactNode

  // Pill that shows just an icon and expands on hover to reveal the label.
  if (variant === 'expand') {
    const icon = added ? '✓' : isPending ? '…' : '+'
    const label = added ? 'Added' : 'Backlog'
    button = (
      <button
        onClick={handleClick}
        disabled={isPending || added}
        aria-label="Add to backlog"
        className={`group flex items-center rounded-full backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 shadow transition-colors disabled:opacity-100 ${
          added ? 'bg-emerald-600/85' : 'bg-black/50 hover:bg-black/70'
        }`}
      >
        <span className="leading-none">{icon}</span>
        <span className="overflow-hidden whitespace-nowrap transition-all duration-300 ml-1 max-w-[68px] opacity-100 sm:ml-0 sm:max-w-0 sm:opacity-0 sm:group-hover:ml-1 sm:group-hover:max-w-[68px] sm:group-hover:opacity-100">
          {label}
        </span>
      </button>
    )
  } else if (added) {
    button = variant === 'outline'
      ? <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">✓ Added to backlog</span>
      : <span className="text-xs font-semibold text-emerald-400">✓ Added</span>
  } else if (variant === 'outline') {
    button = (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-3 py-1.5 text-sm font-medium border border-edge-base text-fg-secondary rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40"
      >
        {isPending ? 'Adding…' : '+ Add to Backlog'}
      </button>
    )
  } else if (variant === 'glass') {
    button = (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-black/60 transition-colors disabled:opacity-40 shrink-0"
      >
        {isPending ? '…' : '+ Backlog'}
      </button>
    )
  } else {
    button = (
      <button
        onClick={handleClick}
        disabled={isPending}
        className="text-[10px] font-semibold text-white bg-white/20 hover:bg-white/35 backdrop-blur-sm rounded-full px-2 py-0.5 transition-colors disabled:opacity-40 shrink-0"
      >
        {isPending ? '...' : '+ Backlog'}
      </button>
    )
  }

  return <>{button}{modal}</>
}
