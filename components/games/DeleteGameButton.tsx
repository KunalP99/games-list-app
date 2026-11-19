'use client'

import { useState } from 'react'
import { deleteGame } from '@/app/(app)/games/actions'
import type { Game } from '@/lib/types'
import { ConfirmDialog, openDeleteConfirm, type Confirm } from './GameActionsMenu'

// The game page's Delete button. Confirms in the same dialog as the games
// list's quick-actions menu, which says exactly how many tickets the delete
// takes (or, for a DNF game, gives back) and the balance afterwards.
export default function DeleteGameButton({
  game,
  variant = 'default',
}: {
  game: Pick<Game, 'id' | 'title' | 'status'>
  variant?: 'default' | 'overlay'
}) {
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOverlay = variant === 'overlay'

  return (
    <>
      <button
        type="button"
        disabled={deleting}
        onClick={() => {
          setError(null)
          openDeleteConfirm(game, setConfirm, () => deleteGame(game.id))
        }}
        className={`${isOverlay
          ? 'px-2.5 py-1 bg-red-900/50 backdrop-blur-sm border border-red-400/30 text-white text-xs font-medium rounded-lg hover:bg-red-900/70 transition-colors'
          : 'px-3 py-1.5 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors dark:border-red-800 dark:hover:bg-red-900/30'} disabled:opacity-50`}
      >
        {deleting ? 'Deleting…' : 'Delete'}
      </button>
      {error && <span role="alert" className="text-xs text-red-500">{error}</span>}

      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirm
            setConfirm(null)
            setDeleting(true)
            // Redirects to /games on success; only a failure comes back.
            const result = await c.run()
            if (result && 'error' in result && result.error) {
              setError(result.error)
              setDeleting(false)
            }
          }}
        />
      )}
    </>
  )
}
