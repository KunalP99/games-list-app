'use client'

import { useState, useTransition } from 'react'
import { deleteVideo } from '@/app/(app)/videos/actions'

export default function DeleteVideoButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteVideo(id)
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="px-2.5 py-1 bg-red-900/60 backdrop-blur-sm border border-red-400/30 text-white text-xs font-medium rounded-lg hover:bg-red-900/80 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-black/60 transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-2.5 py-1 bg-black/40 backdrop-blur-sm border border-white/20 text-white text-xs font-medium rounded-lg hover:bg-red-900/70 transition-colors"
      aria-label="Remove video"
    >
      Remove
    </button>
  )
}
