'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LiveIndicator from '@/components/games/LiveIndicator'
import type { PlayingNowEntry } from '@/lib/presence'

/** How often the list is re-read, so people starting or stopping show up. */
const REFRESH_MS = 60_000

/**
 * "Playing Now" on the dashboard: everyone — you and your friends — who is in
 * a game right now, with how long they've been in it. The timer ticks on its
 * own from the session's start (LiveIndicator); the list itself is re-read
 * once a minute from /api/playing-now, and only while the tab is visible.
 * Renders nothing when nobody is playing.
 */
export default function PlayingNowSection({ initial }: { initial: PlayingNowEntry[] }) {
  const [players, setPlayers] = useState(initial)

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
        // A missed refresh just keeps the last list; the next one tries again.
      }
    }
    const id = setInterval(refresh, REFRESH_MS)
    // Coming back to the tab: catch up straight away rather than on the next tick.
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (players.length === 0) return null

  return (
    <div>
      <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">
        Playing Now <span className="font-normal normal-case text-fg-subtle ml-1">({players.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map(p => (
          <PlayerCard key={p.userId} player={p} />
        ))}
      </div>
    </div>
  )
}

function PlayerCard({ player }: { player: PlayingNowEntry }) {
  const accent = player.accentColour ?? '#7c3aed'
  // Letters and digits only, so "Alex (test)" is "AT", not "A(".
  const initials = player.displayName
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z0-9À-ɏ]/g, ''))
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || '?'

  return (
    <Link
      href={`/games/${player.gameId}`}
      // A dark base whatever the theme: the text is white, and a game with no
      // artwork would otherwise fade to the page colour behind it.
      className="group relative block h-28 rounded-xl overflow-hidden bg-zinc-900 border border-edge-base hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
      {player.gameImage && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-105"
          style={{ backgroundImage: `url(${player.gameImage})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
      <div className="relative h-full flex items-center gap-3 p-4">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ring-2 ring-white/20"
          style={{ backgroundColor: accent }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70 truncate">{player.isSelf ? 'You' : player.displayName}</p>
          <p className="font-semibold text-white truncate drop-shadow">{player.gameTitle}</p>
          <div className="mt-1">
            <LiveIndicator startedAt={player.startedAt} dark prefix="In game" />
          </div>
        </div>
      </div>
    </Link>
  )
}
