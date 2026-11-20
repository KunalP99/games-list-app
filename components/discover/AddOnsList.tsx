'use client'

import { useState } from 'react'
import Link from 'next/link'

export type AddOnRow = { id: number; kind: 'dlc' | 'edition'; name: string; when: string; upcoming: boolean }

export function KindTag({ kind }: { kind: 'dlc' | 'edition' }) {
  return kind === 'dlc'
    ? <span className="inline-block rounded-full bg-sky-100 px-2 py-px text-[11px] font-bold text-sky-800 dark:bg-sky-900/40 dark:text-sky-300">DLC</span>
    : <span className="inline-block rounded-full bg-green-100 px-2 py-px text-[11px] font-bold text-green-800 dark:bg-green-900/40 dark:text-green-300">Edition</span>
}

/**
 * The store page's "DLC and editions", as one list of text rows (tag, name,
 * year, ›), each opening that item's own page. The many small DLC (free
 * quests and the like) wait behind a "N more DLC" row and open in place.
 */
export default function AddOnsList({ rows, more }: { rows: AddOnRow[]; more: AddOnRow[] }) {
  const [showMore, setShowMore] = useState(false)
  const all = showMore ? [...rows, ...more] : rows

  return (
    <div className="max-w-3xl">
      <ul className="overflow-hidden rounded-2xl border border-edge-base bg-surface-base divide-y divide-edge-subtle">
        {all.map(r => (
          <li key={r.id}>
            <Link href={`/discover/${r.id}`} className="grid grid-cols-[72px_1fr_auto_16px] items-center gap-3.5 px-4 py-3 hover:bg-surface-hover transition-colors">
              <span className="justify-self-start"><KindTag kind={r.kind} /></span>
              <span className="min-w-0 break-words text-sm font-semibold leading-snug text-fg-base">{r.name}</span>
              <span className={`text-sm ${r.upcoming ? 'font-semibold text-blue-700 dark:text-blue-400' : 'text-fg-muted'}`}>{r.when}</span>
              <span className="text-fg-subtle" aria-hidden>›</span>
            </Link>
          </li>
        ))}
        {more.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowMore(s => !s)}
              aria-expanded={showMore}
              className="w-full px-4 py-3 text-left text-sm font-semibold text-brand-700 hover:bg-surface-hover dark:text-brand-400"
            >
              {showMore ? 'Show fewer' : `${more.length} more DLC`}
            </button>
          </li>
        )}
      </ul>
      <p className="mt-2.5 text-sm text-fg-muted">DLC adds to the game and needs it; an edition is the whole game, often with add-ons included.</p>
    </div>
  )
}
