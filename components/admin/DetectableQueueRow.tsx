'use client'

import { useState, useTransition } from 'react'
import { addDetectable, dismissQueueItem } from '@/app/(app)/admin/exe-links/actions'

type Props = {
  /** What dismissing records: the submitted ending, or the bare exe name when there is none. */
  queueKey: string
  /** Null for a link made on the website, where no path is known. */
  pathSuffix: string | null
  exeName: string
  gameTitle: string
  igdbId: number | null
  users: string[]
}

/**
 * One thing people have linked that the master list doesn't cover. The ending
 * is editable before approving — a submitted one can carry a folder that's
 * specific to one install, and a website link has none at all.
 */
export default function DetectableQueueRow({ queueKey, pathSuffix, exeName, gameTitle, igdbId, users }: Props) {
  const [suffix, setSuffix] = useState(pathSuffix ?? exeName)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<{ success: true } | { success: false; error: string }>, label: string) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (res.success) setDone(label)
      else setError(res.error)
    })
  }

  if (done) {
    return <div className="px-4 py-3 text-sm text-fg-subtle">{done}: <code>{suffix}</code> → {gameTitle}</div>
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-fg-base truncate">
            <code className="text-fg-muted">{pathSuffix ?? exeName}</code> → <span className="font-medium">{gameTitle}</span>
          </p>
          <p className="text-xs text-fg-subtle">
            {users.length} {users.length === 1 ? 'person' : 'people'}: {users.join(', ')}
            {igdbId != null && <> · IGDB id: {igdbId}</>}
            {pathSuffix == null && <span className="text-amber-600"> · no path — enter an ending</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 min-w-0 rounded-lg border border-edge-base bg-surface-sunken px-2 py-1 text-xs font-mono text-fg-base"
          value={suffix}
          onChange={e => setSuffix(e.target.value)}
          aria-label="Path ending to approve"
        />
        <button
          type="button"
          disabled={igdbId == null || !suffix.trim() || isPending}
          title={igdbId == null ? 'This game has no IGDB id — add it with the form above instead' : undefined}
          onClick={() => run(() => addDetectable(suffix, igdbId!, gameTitle), 'Approved')}
          className="text-xs font-semibold text-brand-600 hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => dismissQueueItem(queueKey), 'Dismissed')}
          className="text-xs text-fg-muted hover:text-red-500 shrink-0"
        >
          Dismiss
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
