'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Menu, MenuItem, ConfirmDialog, type Confirm } from '@/components/games/GameActionsMenu'
import { removeFriend } from '@/app/(app)/friends/actions'

type Person = { id: string; username: string; displayName: string }

/**
 * A friend's row on the dashboard Friends card (public edition): right-click
 * it, or use its "⋯" (shown on hover, and always on touch screens, which have
 * no right-click), for View profile and Remove friend. The same menu as the
 * games list's cards (components/games/GameActionsMenu.tsx).
 */
export default function FriendActions({ person, className = '', children }: { person: Person; className?: string; children: React.ReactNode }) {
  const router = useRouter()
  const [menu, setMenu] = useState<{ x: number; y: number; fromButton: boolean } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const anchorRef = useRef<HTMLElement | null>(null)
  const close = useCallback(() => setMenu(null), [])

  function onContextMenu(e: React.MouseEvent<HTMLElement>) {
    // React bubbles events out of portals (the menu, the dialog); only
    // right-clicks on the row itself count. Shift + right-click: the browser's.
    if (!e.currentTarget.contains(e.target as Node) || e.shiftKey) return
    e.preventDefault()
    anchorRef.current = null
    setMenu({ x: e.clientX, y: e.clientY, fromButton: false })
  }

  function openFromButton(e: React.MouseEvent<HTMLElement>) {
    // The button sits inside the row's link.
    e.preventDefault()
    e.stopPropagation()
    if (menu) { setMenu(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    anchorRef.current = e.currentTarget
    setMenu({ x: rect.right, y: rect.bottom + 6, fromButton: true })
  }

  return (
    <div
      className={`group relative ${className} transition-opacity ${pending ? 'opacity-60 pointer-events-none' : ''}`}
      onContextMenu={onContextMenu}
      aria-busy={pending || undefined}
    >
      {children}
      <button
        type="button"
        aria-label={`Options for ${person.displayName}`}
        aria-haspopup="menu"
        aria-expanded={menu != null}
        onClick={openFromButton}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-edge-base bg-surface-base text-fg-muted hover:text-fg-base hover:bg-surface-hover transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          menu ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
        }`}
      >
        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden><circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" /></svg>
      </button>

      {menu && (
        <Menu x={menu.x} y={menu.y} alignRight={menu.fromButton} anchorRef={anchorRef} onClose={close}>
          <MenuItem
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>}
            onSelect={() => { close(); router.push(`/users/${encodeURIComponent(person.username)}`) }}
          >
            View profile
          </MenuItem>
          <MenuItem
            danger
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="10" cy="8" r="4" /><path d="M2 21a8 8 0 0 1 13.5-5.8M16 19h6" /></svg>}
            onSelect={() => {
              close()
              setConfirm({
                title: `Remove ${person.displayName}?`,
                body: `Are you sure you want to remove ${person.displayName} from your friends list?`,
                confirmLabel: 'Remove friend',
                danger: true,
                run: () => removeFriend(person.id, person.username),
              })
            }}
          >
            Remove friend…
          </MenuItem>
        </Menu>
      )}

      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm
            setConfirm(null)
            setError(null)
            start(async () => {
              try {
                const r = await c.run()
                if (r && 'error' in r && r.error) setError(r.error)
                else router.refresh()
              } catch {
                setError('Something went wrong. Please try again.')
              }
            })
          }}
        />
      )}
      {error && <p role="alert" className="mt-1 px-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
