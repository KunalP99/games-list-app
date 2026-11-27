'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { trackHoursHere } from '@/app/(app)/games/actions'

/**
 * On a game page with another Playing copy of the same game (the Main Game
 * and its multiplayer, say): moves the desktop app's tracked hours to this
 * copy (trackHoursHere). The Main Game gets them unless its owner chooses.
 */
export default function TrackHoursHereButton({ gameId }: { gameId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await trackHoursHere(gameId)
          if ('error' in res && res.error) setError(res.error)
          else router.refresh()
        })}
        className="rounded-lg border border-edge-base px-3 py-1.5 text-xs font-medium text-fg-secondary hover:bg-surface-hover disabled:opacity-60 transition-colors"
      >
        {pending ? 'Moving…' : 'Count tracked hours here'}
      </button>
      {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
    </span>
  )
}
