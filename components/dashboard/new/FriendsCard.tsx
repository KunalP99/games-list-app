'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import type { PlayingNowEntry } from '@/lib/presence'

/** How often the live list is re-read, so friends starting or stopping show up. */
const REFRESH_MS = 60_000

export type FriendSummary = {
  id: string
  displayName: string
  username: string
  accentColour: string | null
  completed: number
  playing: number
}

function initials(name: string): string {
  // Letters and digits only, so "Alex (test)" is "AT", not "A(".
  return name
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z0-9À-ɏ]/g, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?'
}

/**
 * Friends, with anyone the tracker sees in a game right now pinned to the top
 * in a green row: the game, a ticking timer, and a link to it. The live list
 * re-reads /api/playing-now once a minute while the tab is visible — the same
 * feed and liveness rule as the classic dashboard's "Playing now".
 */
export default function FriendsCard({ friends, initialLive }: { friends: FriendSummary[]; initialLive: PlayingNowEntry[] }) {
  const [players, setPlayers] = useState(initialLive)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      if (document.visibilityState !== 'visible') return
      try {
        const res = await fetch('/api/playing-now', { cache: 'no-store' })
        if (!res.ok) return
        const body = await res.json() as { players: PlayingNowEntry[] }
        if (!cancelled) setPlayers(body.players)
      } catch {
        // A missed refresh keeps the last list; the next one tries again.
      }
    }
    const id = setInterval(refresh, REFRESH_MS)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (friends.length === 0) return null

  const live = players.filter(p => !p.isSelf)
  const liveIds = new Set(live.map(p => p.userId))
  const rest = friends.filter(f => !liveIds.has(f.id))

  return (
    <div className="rounded-2xl bg-surface-base border border-edge-base p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold text-fg-base">Friends</h2>
        {live.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {live.length} playing now
          </span>
        )}
      </div>

      {live.map(p => (
        <Link
          key={p.userId}
          href={`/games/${p.gameId}`}
          className="-mx-2.5 mb-2 flex items-center gap-3 rounded-xl bg-emerald-50 p-2.5 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15 transition-colors"
        >
          <span className="relative shrink-0">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: p.accentColour ?? '#7c3aed' }}
            >
              {initials(p.displayName)}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface-base bg-emerald-500" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg-base truncate">{p.displayName}</span>
            <span className="block text-xs text-fg-secondary truncate">Playing <strong className="font-semibold">{p.gameTitle}</strong></span>
            <LiveIndicator startedAt={p.startedAt} prefix="Live" />
          </span>
          {p.gameImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.gameImage} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
          )}
        </Link>
      ))}

      <ul className="space-y-1">
        {rest.map(f => (
          <li key={f.id}>
            <Link href={`/users/${encodeURIComponent(f.username)}`} className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-colors">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: f.accentColour ?? '#7c3aed' }}
              >
                {initials(f.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg-base truncate">{f.displayName}</span>
                <span className="block text-xs text-fg-muted truncate">
                  {f.completed} completed{f.playing > 0 ? ` · ${f.playing} playing` : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
