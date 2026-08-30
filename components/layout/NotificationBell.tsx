'use client'

import Link from 'next/link'
import { useState, useEffect, useRef, useTransition } from 'react'
import { formatActivityDate } from '@/lib/activity'
import { markNotificationsRead, fetchNotifications } from '@/app/(app)/notifications/actions'
import type { NotificationWithGame } from '@/lib/notifications'

export default function NotificationBell({
  notifications,
  unreadCount,
  totalCount,
  accentColour,
}: {
  notifications: NotificationWithGame[]
  unreadCount: number
  totalCount: number
  accentColour: string
}) {
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(unreadCount)
  const [items, setItems] = useState<NotificationWithGame[]>(notifications)
  // Once the panel has been closed, treat these as seen (dots hidden). Reset when
  // genuinely new server data arrives (a navigation refetch).
  const [viewed, setViewed] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setUnread(unreadCount) }, [unreadCount])
  useEffect(() => { setItems(notifications); setViewed(false) }, [notifications])

  const hasMore = items.length < totalCount

  function close() {
    setOpen(false)
    setViewed(true)
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function toggle() {
    if (open) { close(); return }
    setOpen(true)
    // Opening clears the badge and marks everything read in the DB; the unread
    // dots stay visible until the panel is closed.
    if (unread > 0) {
      setUnread(0)
      startTransition(() => { markNotificationsRead() })
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    const next = await fetchNotifications(items.length)
    setItems(prev => [...prev, ...next])
    setLoadingMore(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        className="relative p-1.5 rounded-full text-fg-muted hover:text-fg-base hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition-colors"
      >
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-80 max-w-[calc(100vw-2rem)] bg-surface-base border border-edge-base rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-edge-subtle">
            <p className="text-xs font-semibold text-fg-muted uppercase tracking-wider">Notifications</p>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-fg-subtle">You&apos;re all caught up.</div>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto divide-y divide-edge-subtle">
              {items.map(n => {
                const cover = n.game?.cover_image_url ?? null
                const showDot = !n.read && !viewed
                const inner = (
                  <div className="px-4 py-3 flex gap-2.5 items-center">
                    {/* Unread dot (accent colour) — reserved slot keeps covers aligned */}
                    <div className="w-1 flex-shrink-0 flex items-center justify-center">
                      {showDot && <span className="w-1 h-1 rounded-full" style={{ backgroundColor: accentColour }} />}
                    </div>
                    {/* Game portrait cover — events show text only, no tile */}
                    {n.type !== 'event_live' && (
                      cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover} alt="" className="w-12 h-16 rounded-md object-cover flex-shrink-0 bg-surface-active" />
                      ) : (
                        <div className="w-12 h-16 rounded-md bg-surface-active flex items-center justify-center text-xl flex-shrink-0">🎮</div>
                      )
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg-base leading-tight">{n.title}</p>
                      {n.body && <p className="text-xs text-fg-muted mt-0.5 leading-snug">{n.body}</p>}
                      <p className="text-[11px] text-fg-subtle mt-1">{formatActivityDate(n.created_at)}</p>
                    </div>
                  </div>
                )
                return n.game_id ? (
                  <Link key={n.id} href={`/games/${n.game_id}`} onClick={close} className="block hover:bg-surface-hover transition-colors">
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                )
              })}
              {hasMore && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full px-4 py-2.5 text-xs font-medium text-brand-600 hover:text-brand-800 hover:bg-surface-hover transition-colors disabled:opacity-50 dark:text-brand-400"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
