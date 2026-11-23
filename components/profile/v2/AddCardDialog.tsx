'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PROFILE_CARDS, PROFILE_CARD_IDS, canBe, type CardSize, type ProfileCardId } from '@/lib/profile-cards'

const ICONS: Record<ProfileCardId, string> = {
  playing: '🎮',
  recently_completed: '🏁',
  up_next: '📚',
  year: '📊',
  calendar: '🗓️',
  finish_rate: '✅',
  achievements: '🏆',
  genres: '🏷️',
  platforms: '🖥️',
  streak: '🔥',
  completed_this_year: '📅',
}

const SIZE_LABEL: Record<CardSize, string> = { full: 'Full', half: 'Half', small: 'Square' }
const SPACE_TEXT: Record<CardSize, string> = {
  full: 'This is a full-width space. Smaller cards sit on the left, ready for others beside them.',
  half: 'This is a half-size space. A bigger card starts the next row, and the cards after it move down.',
  small: 'This is a square space. A bigger card starts the next row, and the cards after it move down.',
}

/**
 * Picks a card for an empty space on the profile. Cards already on it are
 * shown greyed out, so the list is always the whole set.
 */
export default function AddCardDialog({
  space,
  used,
  onAdd,
  onClose,
}: {
  space: CardSize
  used: ReadonlySet<ProfileCardId>
  onAdd: (card: ProfileCardId) => void
  onClose: () => void
}) {
  const [fitsOnly, setFitsOnly] = useState(false)
  const [picked, setPicked] = useState<ProfileCardId | null>(null)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button[data-card]:not([disabled])')?.focus()
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [onClose])

  const cards = PROFILE_CARD_IDS.filter(id => !fitsOnly || canBe(id, space))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-[8vh]">
      <div className="fixed inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal
        aria-labelledby="add-card-title"
        className="relative w-full max-w-3xl space-y-4 rounded-2xl border border-edge-base bg-surface-base p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="add-card-title" className="text-xl font-semibold text-fg-base">Add a card</h2>
            <p className="mt-1 text-sm text-fg-muted">
              {SPACE_TEXT[space]}
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

        <div role="group" aria-label="Show" className="flex gap-1.5 text-sm font-medium">
          {([false, true] as const).map(only => (
            <button
              key={String(only)}
              type="button"
              aria-pressed={fitsOnly === only}
              onClick={() => setFitsOnly(only)}
              className={`rounded-full px-3 py-1.5 ${fitsOnly === only ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-surface-sunken text-fg-secondary hover:text-fg-base'}`}
            >
              {only ? `Fits here (${SIZE_LABEL[space].toLowerCase()})` : 'All'}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {cards.map(id => {
            const card = PROFILE_CARDS[id]
            const taken = used.has(id)
            const on = picked === id
            return (
              <button
                key={id}
                type="button"
                data-card={id}
                disabled={taken}
                aria-pressed={on}
                onClick={() => setPicked(id)}
                onDoubleClick={() => !taken && onAdd(id)}
                className={`relative flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors ${
                  taken
                    ? 'cursor-not-allowed border-edge-base opacity-50'
                    : on
                      ? 'border-brand-500 ring-2 ring-brand-500/30'
                      : 'border-edge-base hover:bg-surface-hover'
                }`}
              >
                {taken && <span className="absolute right-3 top-3 text-[11px] font-medium text-fg-muted">On your profile</span>}
                <span className="text-2xl" aria-hidden>{ICONS[id]}</span>
                <span className="text-sm font-semibold text-fg-base">{card.name}</span>
                <span className="text-xs leading-snug text-fg-muted">{card.description}</span>
                <span className="mt-auto flex gap-1.5">
                  {card.sizes.map(size => (
                    <span key={size} className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-fg-secondary">
                      {SIZE_LABEL[size]}
                    </span>
                  ))}
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle pt-4">
          <p className="text-xs text-fg-muted">Cards already on your profile are greyed out. Remove one to put it somewhere else.</p>
          <button
            type="button"
            disabled={!picked}
            onClick={() => picked && onAdd(picked)}
            className="h-11 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {picked ? `Add ${PROFILE_CARDS[picked].name}` : 'Pick a card'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
