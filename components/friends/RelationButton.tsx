'use client'

import { useState, useTransition } from 'react'
import type { Relation } from '@/lib/friends'
import {
  sendFriendRequest, respondToRequest, cancelRequest, unblockUser,
} from '@/app/(app)/friends/actions'

type Result = { success: true; data: { relation: Relation } } | { success: false; error: string }

const base = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50'
const primary = `${base} bg-brand-600 text-white hover:bg-brand-700`
const quiet = `${base} border border-edge-base text-fg-secondary hover:bg-surface-hover`

/**
 * The one button that fits how you stand with someone: Add friend → Requested
 * (click again to take it back) → Friends; Accept / Decline for a request to
 * you; Unblock for someone you blocked. Updates itself straight away and
 * tells the parent (`onChange`), which may refresh the page around it.
 *
 * `friendsSlot` replaces the plain "Friends" label (the profile page puts its
 * Remove friend / Block menu there).
 */
export default function RelationButton({
  personId,
  username,
  relation: initial,
  onChange,
  friendsSlot,
}: {
  personId: string
  username?: string
  relation: Relation
  onChange?: (relation: Relation) => void
  friendsSlot?: React.ReactNode
}) {
  const [relation, setRelation] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function act(run: () => Promise<Result>) {
    setError(null)
    start(async () => {
      try {
        const r = await run()
        if (r.success) { setRelation(r.data.relation); onChange?.(r.data.relation) }
        else setError(r.error)
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  let button: React.ReactNode = null
  if (relation === 'none') {
    button = (
      <button type="button" disabled={pending} className={primary} onClick={() => act(() => sendFriendRequest(personId))}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        Add friend
      </button>
    )
  } else if (relation === 'requested') {
    button = (
      <button
        type="button"
        disabled={pending}
        className={quiet}
        title="Take back your request"
        onClick={() => act(() => cancelRequest(personId))}
      >
        Requested
      </button>
    )
  } else if (relation === 'incoming') {
    button = (
      <span className="inline-flex gap-1.5">
        <button type="button" disabled={pending} className={primary} onClick={() => act(() => respondToRequest(personId, true))}>Accept</button>
        <button type="button" disabled={pending} className={quiet} onClick={() => act(() => respondToRequest(personId, false))}>Decline</button>
      </span>
    )
  } else if (relation === 'friends') {
    button = friendsSlot ?? (
      <span className="inline-flex items-center gap-1 h-8 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden><path d="M5 12l5 5L20 7" /></svg>
        Friends
      </span>
    )
  } else if (relation === 'blocked') {
    button = (
      <button type="button" disabled={pending} className={quiet} onClick={() => act(() => unblockUser(personId, username))}>Unblock</button>
    )
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      {button}
      {error && <span role="alert" className="text-[11px] text-red-600 dark:text-red-400 text-right max-w-[220px]">{error}</span>}
    </span>
  )
}
