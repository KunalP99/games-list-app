'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { markAsCompleted } from '@/app/(app)/games/actions'
import { CompleteGameModal, type CompletionDetails } from '@/components/games/MarkCompletedButton'

/**
 * The hero's buttons. A Playing game gets "Mark as completed" (the same form
 * and ticket rules as everywhere else) plus Open; an Ambient game never
 * completes, so it gets Open alone, promoted to the main button.
 */
export default function HeroActions({
  gameId,
  canComplete,
  initialFavourite,
}: {
  gameId: string
  canComplete: boolean
  initialFavourite: boolean
}) {
  const router = useRouter()
  const [completing, setCompleting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function confirm(details: CompletionDetails) {
    setCompleting(false)
    setError(null)
    startTransition(async () => {
      const result = await markAsCompleted(gameId, details)
      if (result && 'error' in result && result.error) setError(result.error)
      else router.refresh()
    })
  }

  const primary = 'inline-flex items-center h-11 px-4 rounded-lg bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 transition-colors disabled:opacity-60'
  const secondary = 'inline-flex items-center h-11 px-4 rounded-lg bg-white/15 text-white text-sm font-medium hover:bg-white/25 transition-colors'

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {canComplete && (
          <button type="button" onClick={() => setCompleting(true)} disabled={pending} className={primary}>
            {pending ? 'Saving…' : 'Mark as completed'}
          </button>
        )}
        <Link href={`/games/${gameId}`} className={canComplete ? secondary : primary}>Open</Link>
      </div>
      {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
      {completing && (
        <CompleteGameModal
          initialFavourite={initialFavourite}
          onCancel={() => setCompleting(false)}
          onConfirm={confirm}
        />
      )}
    </div>
  )
}
