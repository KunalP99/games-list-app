'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LiveIndicator from '@/components/games/LiveIndicator'
import type { PlayingNowEntry } from '@/lib/presence'
import type { PersonSummary } from '@/lib/data/friends'
import AddFriendModal from '@/components/friends/AddFriendModal'
import RelationButton from '@/components/friends/RelationButton'
import PersonAvatar, { initials } from '@/components/friends/PersonAvatar'
import FriendActions from '@/components/friends/FriendActions'

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

/**
 * Friends, with anyone the tracker sees in a game right now pinned to the top
 * in a green row: the game, a ticking timer, and a link to it. The live list
 * re-reads /api/playing-now once a minute while the tab is visible — the same
 * feed and liveness rule as the badges on game cards (`isSessionLive`).
 *
 * `friendSystem` (public edition, FEATURES.friendSystem): a "+" that opens
 * the Add a friend search, requests waiting for you at the top with Accept /
 * Decline, and an empty state instead of no card. The friends edition (where
 * everyone signed up is a friend) passes neither and keeps the plain card.
 */
export default function FriendsCard({
  friends,
  initialLive,
  friendSystem = false,
  incoming = [],
}: {
  friends: FriendSummary[]
  initialLive: PlayingNowEntry[]
  friendSystem?: boolean
  incoming?: PersonSummary[]
}) {
  const router = useRouter()
  const [players, setPlayers] = useState(initialLive)
  const [adding, setAdding] = useState(false)

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

  if (friends.length === 0 && !friendSystem) return null

  const live = players.filter(p => !p.isSelf)
  const liveIds = new Set(live.map(p => p.userId))
  const rest = friends.filter(f => !liveIds.has(f.id))

  return (
    <div className="rounded-2xl bg-surface-base border border-edge-base p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-fg-base">Friends</h2>
        <div className="flex items-center gap-2">
          {live.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {live.length} playing now
            </span>
          )}
          {friendSystem && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add a friend"
              title="Add a friend"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge-base text-fg-secondary hover:bg-surface-hover hover:text-fg-base transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
            </button>
          )}
        </div>
      </div>

      {friendSystem && incoming.length > 0 && (
        <div className="mb-3 rounded-xl border border-edge-base bg-surface-sunken p-2.5">
          <p className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
            {incoming.length === 1 ? 'Friend request' : `Friend requests (${incoming.length})`}
          </p>
          <ul className="space-y-1.5">
            {incoming.map(p => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                <PersonAvatar name={p.displayName} accentColour={p.accentColour} size={32} />
                {/* Grows to fill the row; the buttons wrap underneath rather than squeeze the name. */}
                <Link href={`/users/${encodeURIComponent(p.username)}`} className="min-w-[110px] flex-[1_1_110px]">
                  <span className="block text-sm font-semibold text-fg-base truncate">{p.displayName}</span>
                  <span className="block text-xs text-fg-muted truncate">@{p.username}</span>
                </Link>
                <RelationButton personId={p.id} username={p.username} relation="incoming" onChange={() => router.refresh()} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {friendSystem && friends.length === 0 && (
        <div className="py-4 text-center">
          <p className="text-sm font-semibold text-fg-base">No friends yet</p>
          <p className="mt-1 text-xs text-fg-muted">Tap + to find people by their username or name.</p>
        </div>
      )}

      {live.map(p => (
        <WithActions key={p.userId} on={friendSystem} person={{ id: p.userId, username: p.username, displayName: p.displayName }} className="-mx-2.5 mb-2">
        <Link
          href={`/games/${p.gameId}`}
          className={`flex items-center gap-3 rounded-xl bg-emerald-50 p-2.5 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15 transition-colors ${friendSystem ? 'pr-10' : ''}`}
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
            <img src={p.gameImage} alt="" className="h-12 w-9 shrink-0 rounded-md object-cover" />
          )}
        </Link>
        </WithActions>
      ))}

      <ul className="space-y-1">
        {rest.map(f => (
          <li key={f.id}>
            <WithActions on={friendSystem} person={{ id: f.id, username: f.username, displayName: f.displayName }} className="-mx-2">
            <Link href={`/users/${encodeURIComponent(f.username)}`} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-hover transition-colors ${friendSystem ? 'pr-10' : ''}`}>
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
            </WithActions>
          </li>
        ))}
      </ul>

      {adding && <AddFriendModal onClose={() => setAdding(false)} onChanged={() => router.refresh()} />}
    </div>
  )
}

/**
 * Public edition: a friend's row gets the right-click / "⋯" menu (View
 * profile, Remove friend). The friends edition, where everyone is a friend
 * and can't be removed, keeps the plain row.
 */
function WithActions({ on, person, className, children }: {
  on: boolean
  person: { id: string; username: string; displayName: string }
  className: string
  children: React.ReactNode
}) {
  if (!on) return <div className={className}>{children}</div>
  return <FriendActions person={person} className={className}>{children}</FriendActions>
}
