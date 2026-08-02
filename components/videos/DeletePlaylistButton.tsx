'use client'

import { useState, useTransition } from 'react'
import { deletePlaylist } from '@/app/(app)/videos/actions'

export default function DeletePlaylistButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deletePlaylist(id)
    })
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-fg-muted">Delete whole playlist?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="px-2.5 py-1 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Deleting…' : 'Delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2.5 py-1 border border-edge-base text-fg-secondary text-xs font-medium rounded-lg hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-2.5 py-1 border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 transition-colors dark:border-red-800 dark:hover:bg-red-900/30"
    >
      Delete playlist
    </button>
  )
}
