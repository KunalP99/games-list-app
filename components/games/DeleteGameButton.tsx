'use client'

import { useState } from 'react'
import { deleteGame } from '@/app/(app)/games/actions'

export default function DeleteGameButton({ id, variant = 'default' }: { id: string; variant?: 'default' | 'overlay' }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    await deleteGame(id)
  }

  const isOverlay = variant === 'overlay'

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs ${isOverlay ? 'text-white/70' : 'text-fg-muted'}`}>Are you sure?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className={isOverlay
            ? 'px-2.5 py-1 bg-red-900/60 backdrop-blur-sm border border-red-400/30 text-white text-xs font-medium rounded-lg hover:bg-red-900/80 transition-colors disabled:opacity-50'
            : 'px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50'}
        >
          {loading ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className={isOverlay
            ? 'px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-black/60 transition-colors'
            : 'px-3 py-1.5 border border-edge-base text-fg-secondary text-sm font-medium rounded-lg hover:bg-surface-hover transition-colors'}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={isOverlay
        ? 'px-2.5 py-1 bg-red-900/50 backdrop-blur-sm border border-red-400/30 text-white text-xs font-medium rounded-lg hover:bg-red-900/70 transition-colors'
        : 'px-3 py-1.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors dark:border-red-800 dark:hover:bg-red-900/30'}
    >
      Delete
    </button>
  )
}
