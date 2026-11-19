'use client'

/**
 * Quick actions for a game on the games list: a "⋯" button that fades in on
 * hover (always shown on touch screens, which have no hover), and the same
 * menu on right-click anywhere on the card or table row. Shift + right-click
 * still gets the browser's own menu, for "Open in new tab".
 *
 * Everything goes through the existing server actions, so tickets work exactly
 * as they do from the edit page: Completed opens the usual Mark as Completed
 * form, and anything that costs tickets asks first (`lib/game-quick-actions`).
 *
 * Owner only — callers render it just when the viewer owns the game.
 */
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useTransition,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { Game, GameStatus } from '@/lib/types'
import { menuMoves, moveWarning, deleteWarning, type MenuMove } from '@/lib/game-quick-actions'
import { setGameStatus, setFavourite, markAsCompleted, markAsDnf, deleteGame, deleteImpact } from '@/app/(app)/games/actions'
import { CompleteGameModal, type CompletionDetails } from './MarkCompletedButton'

type ActionResult = { error?: string } | { success?: boolean } | undefined | void

export type Confirm = {
  title: string
  body: string
  confirmLabel: string
  danger: boolean
  /** Still working out what to say: the confirm button waits. */
  loading?: boolean
  run: () => Promise<ActionResult>
}

/**
 * Opens the delete confirmation for a game, then fills in exactly what it
 * does to the owner's tickets once `deleteImpact` answers (the confirm button
 * waits for that; if it fails, the general wording stays and it can go ahead).
 * Shared by the quick-actions menu and the game page's Delete button.
 */
export function openDeleteConfirm(
  game: Pick<Game, 'id' | 'title' | 'status'>,
  setConfirm: React.Dispatch<React.SetStateAction<Confirm | null>>,
  run: () => Promise<ActionResult>,
) {
  const title = `Delete ${game.title}?`
  setConfirm({ title, body: deleteWarning(game.status), confirmLabel: 'Delete', danger: true, loading: true, run })
  const settle = (body: string) =>
    setConfirm(c => (c && c.title === title ? { ...c, body, loading: false } : c))
  deleteImpact(game.id)
    .then(impact => settle(deleteWarning(game.status, impact)))
    .catch(() => settle(deleteWarning(game.status)))
}

const STATUS_DOT: Record<GameStatus, string> = {
  playing: 'bg-blue-500',
  completed: 'bg-green-500',
  backlog: 'bg-zinc-400',
  dnf: 'bg-red-500',
  ambient: 'bg-teal-500',
}

const MOVE_LABEL: Record<GameStatus, string> = {
  playing: 'Move to Playing',
  completed: 'Mark as Completed…',
  backlog: 'Move to Backlog',
  dnf: 'Mark as DNF…',
  ambient: 'Move to Ambient',
}

function moveTarget(m: MenuMove): GameStatus {
  return m.kind === 'complete' ? 'completed' : m.kind === 'dnf' ? 'dnf' : m.to
}

type Actions = ReturnType<typeof useGameActions>

export function useGameActions(game: Game) {
  const router = useRouter()
  const [menu, setMenu] = useState<{ x: number; y: number; fromButton: boolean } | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [completing, setCompleting] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => setMenu(null), [])
  const clearError = useCallback(() => setError(null), [])

  function run(fn: () => Promise<ActionResult>) {
    setError(null)
    startTransition(async () => {
      try {
        const r = await fn()
        if (r && 'error' in r && r.error) setError(r.error)
        else router.refresh()
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  function onContextMenu(e: React.MouseEvent<HTMLElement>) {
    // React bubbles events out of portals (the menu, the dialogs) to here;
    // only right-clicks on the card itself count.
    if (!e.currentTarget.contains(e.target as Node)) return
    if (e.shiftKey) return
    e.preventDefault()
    anchorRef.current = null
    setMenu({ x: e.clientX, y: e.clientY, fromButton: false })
  }

  function openFromButton(e: React.MouseEvent<HTMLElement>) {
    // The button sits inside the card's link.
    e.preventDefault()
    e.stopPropagation()
    if (menu) { setMenu(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    anchorRef.current = e.currentTarget
    setMenu({ x: rect.right, y: rect.bottom + 6, fromButton: true })
  }

  function choose(m: MenuMove) {
    close()
    const to = moveTarget(m)
    if (m.kind === 'complete') { setCompleting(true); return }
    const warning = moveWarning(game.status, to)
    const doIt = m.kind === 'dnf' ? () => markAsDnf(game.id) : () => setGameStatus(game.id, m.to)
    if (warning) {
      setConfirm({
        title: m.kind === 'dnf' ? `Mark ${game.title} as DNF?` : `Move ${game.title} to ${MOVE_LABEL[to].replace('Move to ', '')}?`,
        body: warning,
        confirmLabel: m.kind === 'dnf' ? 'Mark as DNF' : 'Move it',
        danger: true,
        run: doIt,
      })
    } else {
      run(doIt)
    }
  }

  const ui = (
    <>
      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          alignRight={menu.fromButton}
          anchorRef={anchorRef}
          onClose={close}
        >
          <MenuItem icon={<PencilIcon />} onSelect={() => { close(); router.push(`/games/${game.id}/edit`) }}>
            Edit
          </MenuItem>
          <MenuItem
            icon={<StarIcon filled={game.is_favourite} />}
            onSelect={() => { close(); run(() => setFavourite(game.id, !game.is_favourite)) }}
          >
            {game.is_favourite ? 'Remove from favourites' : 'Add to favourites'}
          </MenuItem>
          <Divider />
          {menuMoves(game.status).map(m => {
            const to = moveTarget(m)
            return (
              <MenuItem key={to} icon={<span className={`w-2 h-2 rounded-full ${STATUS_DOT[to]}`} />} onSelect={() => choose(m)}>
                {MOVE_LABEL[to]}
              </MenuItem>
            )
          })}
          <Divider />
          <MenuItem
            danger
            icon={<TrashIcon />}
            onSelect={() => {
              close()
              openDeleteConfirm(game, setConfirm, () => deleteGame(game.id, { stay: true }))
            }}
          >
            Delete…
          </MenuItem>
        </Menu>
      )}

      {completing && (
        <CompleteGameModal
          initialFavourite={game.is_favourite}
          onCancel={() => setCompleting(false)}
          onConfirm={(details: CompletionDetails) => {
            setCompleting(false)
            run(() => markAsCompleted(game.id, details))
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          {...confirm}
          onCancel={() => setConfirm(null)}
          onConfirm={() => { const c = confirm; setConfirm(null); run(c.run) }}
        />
      )}

      {error && <ErrorToast message={error} onDone={clearError} />}
    </>
  )

  return { open: menu !== null, pending, onContextMenu, openFromButton, ui }
}

const ActionsContext = createContext<Actions | null>(null)

/** Wraps a game card: right-click opens the menu, and a `GameActionsTrigger` inside opens it too. */
export default function GameActions({ game, className = '', children }: { game: Game; className?: string; children: React.ReactNode }) {
  const actions = useGameActions(game)
  return (
    <ActionsContext.Provider value={actions}>
      <div
        className={`${className} transition-opacity ${actions.pending ? 'opacity-60 pointer-events-none' : ''}`}
        onContextMenu={actions.onContextMenu}
        aria-busy={actions.pending || undefined}
      >
        {children}
      </div>
      {actions.ui}
    </ActionsContext.Provider>
  )
}

/** For a parent that already holds the actions (a table row). */
export function GameActionsProvider({ actions, children }: { actions: Actions; children: React.ReactNode }) {
  return <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
}

/** The "⋯" button. Renders nothing outside a `GameActions`, so non-owners never see it. */
export function GameActionsTrigger({ tone = 'plain', className = '' }: { tone?: 'overlay' | 'plain'; className?: string }) {
  const actions = useContext(ActionsContext)
  if (!actions) return null
  const toneClass = tone === 'overlay'
    ? 'bg-black/55 text-white backdrop-blur-sm hover:bg-black/75'
    : 'bg-surface-base text-fg-muted border border-edge-base hover:text-fg-base hover:bg-surface-hover'
  return (
    <button
      type="button"
      aria-label="Game options"
      aria-haspopup="menu"
      aria-expanded={actions.open}
      onClick={actions.openFromButton}
      className={`inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-full transition-opacity duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${toneClass} ${
        actions.open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
      } ${className}`}
    >
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        <circle cx="4" cy="10" r="1.6" /><circle cx="10" cy="10" r="1.6" /><circle cx="16" cy="10" r="1.6" />
      </svg>
    </button>
  )
}

// ── Menu ────────────────────────────────────────────────────────────────

function Menu({
  x, y, alignRight, anchorRef, onClose, children,
}: {
  x: number
  y: number
  alignRight: boolean
  anchorRef: React.MutableRefObject<HTMLElement | null>
  onClose: () => void
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Measure, then keep the menu on screen.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 8
    let left = alignRight ? x - width : x
    let top = y
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    if (top + height > window.innerHeight - margin) {
      const anchor = anchorRef.current?.getBoundingClientRect()
      top = anchor ? anchor.top - height - 6 : y - height
    }
    top = Math.max(margin, top)
    setPos({ left, top })
  }, [x, y, alignRight, anchorRef])

  // Focus the first item once placed, for the keyboard. preventScroll: a
  // focus that scrolled the page would fire the scroll listener below and
  // close the menu straight away.
  useEffect(() => {
    if (pos) ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
  }, [pos])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return // the ⋯ button toggles itself
      onClose()
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    // Scrolling closes the menu, but only scrolls that start after it opened:
    // the right-click itself focuses the card's link, and the browser may
    // scroll that into view a frame later — which would shut the menu the
    // moment it appeared. Two frames lets that scroll event go past first.
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => window.addEventListener('scroll', onClose, true))
    })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose, anchorRef])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      onKeyDown={onKeyDown}
      // Keep clicks and right-clicks from reaching the card or row this
      // belongs to — React bubbles them out of the portal.
      onClick={e => e.stopPropagation()}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}
      style={pos ? { left: pos.left, top: pos.top } : { left: x, top: y, visibility: 'hidden' }}
      className="fixed z-50 min-w-[200px] py-1.5 bg-surface-base border border-edge-base rounded-xl shadow-xl text-sm"
    >
      {children}
    </div>,
    document.body,
  )
}

function MenuItem({ icon, danger = false, onSelect, children }: { icon: React.ReactNode; danger?: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left focus:outline-none ${
        danger
          ? 'text-red-600 hover:bg-red-50 focus:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30 dark:focus:bg-red-900/30'
          : 'text-fg-secondary hover:bg-surface-hover hover:text-fg-base focus:bg-surface-hover focus:text-fg-base'
      }`}
    >
      <span className="w-4 h-4 flex items-center justify-center shrink-0">{icon}</span>
      {children}
    </button>
  )
}

function Divider() {
  return <div className="my-1.5 h-px bg-edge-base" role="separator" />
}

// ── Dialogs ─────────────────────────────────────────────────────────────

export function ConfirmDialog({
  title, body, confirmLabel, danger, loading, onCancel, onConfirm,
}: Confirm & { onCancel: () => void; onConfirm: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div role="alertdialog" aria-modal className="relative w-full max-w-sm bg-surface-base border border-edge-base rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-fg-base break-words">{title}</h2>
          <p className="text-sm text-fg-muted mt-1" aria-live="polite">{body}</p>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-fg-secondary hover:text-fg-base border border-edge-base rounded-lg hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ErrorToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000)
    return () => clearTimeout(t)
  }, [onDone])
  return createPortal(
    <div role="alert" onClick={e => e.stopPropagation()} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm shadow-xl">
      {message}
    </div>,
    document.body,
  )
}

// ── Icons ───────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.86 4.49l2.65 2.65M4.5 19.5l3.9-.87L19.06 7.97a1.87 1.87 0 000-2.65l-.38-.38a1.87 1.87 0 00-2.65 0L5.37 15.6 4.5 19.5z" />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg className={`w-4 h-4 ${filled ? 'text-amber-400' : ''}`} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinejoin="round" d="M11.48 3.5a.56.56 0 011.04 0l2.13 5.11c.08.2.27.33.47.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 00-.18.56l1.28 5.38a.56.56 0 01-.84.61l-4.72-2.88a.56.56 0 00-.59 0l-4.72 2.88a.56.56 0 01-.84-.61l1.28-5.38a.56.56 0 00-.18-.56l-4.2-3.6a.56.56 0 01.32-.99l5.52-.44a.56.56 0 00.47-.35L11.48 3.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" />
    </svg>
  )
}
