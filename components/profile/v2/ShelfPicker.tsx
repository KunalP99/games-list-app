'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SHELF_MAX, type CardGame } from '@/lib/profile-cards'

type ShelfGame = CardGame & { completedOn: string | null }

const finished = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : ''

/**
 * Choosing the Game shelf's games (canvas board J5): every completed game,
 * click to add or take off; the number is its place on the shelf. "Clear"
 * goes back to showing the latest completions.
 */
export default function ShelfPicker({
  games,
  initial,
  onDone,
  onClose,
}: {
  /** Every completed game, newest first. */
  games: ShelfGame[]
  initial: string[]
  onDone: (chosen: string[]) => void
  onClose: () => void
}) {
  const [chosen, setChosen] = useState<string[]>(initial)
  const [query, setQuery] = useState('')
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('input')?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? games.filter(g => g.title.toLowerCase().includes(q)) : games
  }, [games, query])

  const toggle = (id: string) =>
    setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : c.length >= SHELF_MAX ? c : [...c, id]))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[6vh]">
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal
        aria-labelledby="shelf-picker-title"
        className="relative w-full max-w-4xl space-y-4 rounded-2xl border border-edge-base bg-surface-base p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="shelf-picker-title" className="text-xl font-semibold text-fg-base">Choose your shelf</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Pick up to {SHELF_MAX} completed games, in the order you want them. {chosen.length} chosen.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge-base text-fg-muted hover:text-fg-base"
          >
            ✕
          </button>
        </div>

        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your completed games"
          aria-label="Search your completed games"
          className="h-10 w-full rounded-lg border border-edge-input bg-surface-input px-3 text-sm text-fg-base placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand-500"
        />

        {games.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-muted">Complete a game and it can go on your shelf.</p>
        ) : (
          <div className="grid max-h-[55vh] grid-cols-3 gap-4 overflow-y-auto p-1 sm:grid-cols-5 md:grid-cols-7">
            {shown.map(g => {
              const place = chosen.indexOf(g.id) + 1
              const full = place === 0 && chosen.length >= SHELF_MAX
              return (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={place > 0}
                  disabled={full}
                  onClick={() => toggle(g.id)}
                  className="group relative flex flex-col gap-1.5 text-left disabled:opacity-40"
                >
                  <span className={`relative block overflow-hidden rounded-md ${place > 0 ? 'ring-[3px] ring-brand-500' : 'group-hover:ring-2 group-hover:ring-edge-input'}`}>
                    {g.cover ? (
                      <img src={g.cover} alt="" className="aspect-[3/4] w-full object-cover" />
                    ) : (
                      <span className="flex aspect-[3/4] w-full items-center justify-center bg-surface-sunken p-2 text-center text-xs">{g.title}</span>
                    )}
                    {place > 0 && (
                      <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">{place}</span>
                    )}
                  </span>
                  <span className="truncate text-xs font-semibold text-fg-base">{g.title}</span>
                  <span className="text-[11px] text-fg-muted">{finished(g.completedOn)}</span>
                </button>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle pt-4">
          <p className="text-xs text-fg-muted">
            Click to add or take off; the number is its place on the shelf. With none chosen, the shelf shows your latest completions.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setChosen([])} disabled={chosen.length === 0} className="h-11 rounded-xl px-4 text-sm text-fg-secondary hover:text-fg-base disabled:opacity-40">
              Clear
            </button>
            <button type="button" onClick={() => onDone(chosen)} className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
