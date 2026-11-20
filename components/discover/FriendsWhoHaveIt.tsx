'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import PersonAvatar from '@/components/friends/PersonAvatar'

export type FriendCopy = {
  userId: string
  username: string
  displayName: string
  accentColour: string | null
  status: string
  hours: number | null
}

const STATUS: Record<string, string> = { playing: 'Playing', completed: 'Completed', backlog: 'Backlog', dnf: 'Dropped', ambient: 'Playing' }

/**
 * "3 friends have this", minimal under the tags; click for who, with their
 * status and hours, each linking to their profile. Only friends whose games
 * the database lets the viewer see (their Games privacy setting) are passed in.
 */
export default function FriendsWhoHaveIt({ friends }: { friends: FriendCopy[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  if (friends.length === 0) return null
  const label = friends.length === 1 ? '1 friend' : `${friends.length} friends`

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-2.5 text-sm text-fg-secondary hover:text-fg-base">
        <span className="flex">
          {friends.slice(0, 3).map((f, i) => (
            <span key={f.userId} className={`rounded-full ring-2 ring-surface-page ${i > 0 ? '-ml-2' : ''}`}>
              <PersonAvatar name={f.displayName} accentColour={f.accentColour} size={24} />
            </span>
          ))}
        </span>
        <span><strong className="font-semibold text-fg-base">{label}</strong> {friends.length === 1 ? 'has' : 'have'} this</span>
      </button>
      {open && (
        <ul className="absolute left-0 top-9 z-20 w-72 rounded-xl border border-edge-base bg-surface-base p-1.5 shadow-xl">
          {friends.map(f => (
            <li key={f.userId}>
              <Link href={`/users/${encodeURIComponent(f.username)}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover">
                <PersonAvatar name={f.displayName} accentColour={f.accentColour} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-base">{f.displayName}</span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {STATUS[f.status] ?? f.status}{f.hours ? ` · ${Math.round(f.hours)}h` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
