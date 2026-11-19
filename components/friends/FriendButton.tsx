'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Relation } from '@/lib/friends'
import { removeFriend, blockUser } from '@/app/(app)/friends/actions'
import { ConfirmDialog, type Confirm } from '@/components/games/GameActionsMenu'
import RelationButton from './RelationButton'

/**
 * The friendship controls on someone's profile (public edition): the
 * relation button (Add friend / Requested / Accept / Friends / Unblock) plus a
 * "⋯" menu with Remove friend (friends only) and Block, each confirmed first.
 */
export default function FriendButton({
  personId,
  username,
  name,
  relation,
  onDark = false,
}: {
  personId: string
  username: string
  name: string
  relation: Relation
  /** Sits on the profile banner's picture: light outline styles. */
  onDark?: boolean
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false) }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const done = () => router.refresh()
  const item = 'block w-full text-left px-3 py-2 text-sm rounded-md hover:bg-surface-hover'

  return (
    <div className={`inline-flex items-start gap-1.5 rounded-xl p-1 ${onDark ? 'bg-black/40 backdrop-blur-sm' : ''}`}>
      {/* Keyed on the relation, so a change made from the menu (which refreshes
          the page) starts the button afresh rather than keeping its old state. */}
      <RelationButton key={relation} personId={personId} username={username} relation={relation} onChange={done} />

      {relation !== 'blocked' && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label={`More options for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${onDark
              ? 'border-white/30 text-white hover:bg-white/15'
              : 'border-edge-base text-fg-secondary hover:bg-surface-hover'}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-9 z-20 w-44 rounded-xl border border-edge-base bg-surface-base p-1 shadow-xl">
              {relation === 'friends' && (
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-fg-base`}
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirm({
                      title: `Remove ${name}?`,
                      body: 'You’ll stop seeing what they’ve set to friends only, and they’ll stop seeing yours. They aren’t told.',
                      confirmLabel: 'Remove friend',
                      danger: true,
                      run: () => removeFriend(personId, username),
                    })
                  }}
                >
                  Remove friend
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={`${item} text-red-600 dark:text-red-400`}
                onClick={() => {
                  setMenuOpen(false)
                  setConfirm({
                    title: `Block ${name}?`,
                    body: 'They won’t be able to find you, send you requests or see anything of yours, and you won’t see theirs. Any friendship or request between you ends. They aren’t told. You can unblock them in Settings → Privacy.',
                    confirmLabel: 'Block',
                    danger: true,
                    run: () => blockUser(personId, username),
                  })
                }}
              >
                Block
              </button>
            </div>
          )}
        </div>
      )}

      {error && <span role="alert" className="text-xs text-red-500">{error}</span>}
      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const c = confirm
            setConfirm(null)
            setError(null)
            const r = await c.run()
            if (r && 'error' in r && r.error) setError(r.error)
            else done()
          }}
        />
      )}
    </div>
  )
}
