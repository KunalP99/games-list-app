'use client'

import { useRouter } from 'next/navigation'

type FriendOption = {
  id: string
  display_name: string | null
  username: string
}

export default function FriendPicker({
  friends,
  currentCompare,
}: {
  friends: FriendOption[]
  currentCompare: string | null
}) {
  const router = useRouter()

  return (
    <select
      value={currentCompare ?? ''}
      onChange={e => {
        if (e.target.value === '') router.push('/stats')
        else router.push(`/stats?compare=${encodeURIComponent(e.target.value)}`)
      }}
      className="px-3 py-1.5 border border-edge-base rounded-lg text-sm bg-surface-base text-fg-secondary focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <option value="">Compare with a friend...</option>
      {friends.map(f => (
        <option key={f.id} value={f.username}>
          {f.display_name ?? f.username} (@{f.username})
        </option>
      ))}
    </select>
  )
}
