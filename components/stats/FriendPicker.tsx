'use client'

import { useRouter } from 'next/navigation'

type FriendOption = {
  id: string
  display_name: string | null
  username: string
}

/**
 * Switches the Stats page between your own stats and a head-to-head with a
 * friend (`?compare=<username>`). The empty option reads "Compare with a
 * friend" while you're on your own, and "Just me" once you're comparing —
 * it's the way back.
 */
export default function FriendPicker({
  friends,
  currentCompare,
}: {
  friends: FriendOption[]
  currentCompare: string | null
}) {
  const router = useRouter()

  // The browser's own arrow sits hard against the right edge, so it's hidden
  // (appearance-none) and drawn here instead: the arrow is 20px in from the
  // right, the same as the text from the left, so both sides match.
  return (
    <div className="relative inline-flex">
      <select
        aria-label="Compare with a friend"
        value={currentCompare ?? ''}
        onChange={e => {
          if (e.target.value === '') router.push('/stats')
          else router.push(`/stats?compare=${encodeURIComponent(e.target.value)}`)
        }}
        className="appearance-none min-h-[44px] pl-5 pr-12 py-2 rounded-full text-sm font-medium bg-surface-base border border-edge-base text-fg-base focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
      >
        <option value="">{currentCompare ? 'Just me' : 'Compare with a friend'}</option>
        {friends.map(f => (
          <option key={f.id} value={f.username}>
            {currentCompare ? 'Comparing with ' : ''}{f.display_name ?? f.username}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-base"
      >
        <path d="M5 8l5 5 5-5" />
      </svg>
    </div>
  )
}
