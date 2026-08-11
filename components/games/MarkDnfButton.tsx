'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { markAsDnf } from '@/app/(app)/games/actions'

// "Did Not Finish" button for the game detail page (playing games only). Opens a
// simple are-you-sure confirmation before dropping the game.
export default function MarkDnfButton({ gameId }: { gameId: string }) {
  const [pending, startTransition] = useTransition()
  const [showModal, setShowModal] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  function handleConfirm() {
    setShowModal(false)
    startTransition(async () => {
      await markAsDnf(gameId)
    })
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={pending}
        className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Saving…' : '✕ Mark as DNF'}
      </button>

      {showModal && mounted && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !pending && setShowModal(false)}
          />
          <div className="relative w-full max-w-sm bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-fg-base">Mark as Did Not Finish?</h2>
              <p className="text-sm text-fg-muted mt-1">
                Are you sure? This drops the game and applies the DNF ticket penalty.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={pending}
                className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-base border border-edge-base rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pending}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Yes, mark DNF
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
