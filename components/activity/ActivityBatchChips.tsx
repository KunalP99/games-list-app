'use client'

import { useState } from 'react'
import type { ActivityBatchEntry } from '@/lib/activity'

// How many members of a batch are named before the rest collapse behind the
// toggle. Three fits one line at the narrowest layout the row has.
const DEFAULT_SHOWN = 3

/**
 * The chips under a stacked activity row (a day's achievement unlocks, or a
 * day's backlog adds). Collapsed it shows the first few and a "+N more"
 * button; clicking reveals the rest in place, and "Show less" collapses it
 * again.
 *
 * A client component purely for that toggle — the row around it stays server
 * rendered.
 */
export default function ActivityBatchChips({
  entries,
  shown = DEFAULT_SHOWN,
}: {
  entries: ActivityBatchEntry[]
  shown?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const hidden = entries.length - shown
  const visible = expanded ? entries : entries.slice(0, shown)

  return (
    // Collapsed stays on one line; expanded wraps so a long batch stacks
    // neatly rather than squeezing the chips.
    <div className={`flex items-center gap-1.5 mt-1.5 ${expanded ? 'flex-wrap' : 'overflow-hidden'}`}>
      {visible.map(entry => (
        <span
          key={entry.id}
          title={entry.label}
          className="inline-flex items-center gap-1 max-w-[11rem] px-1.5 py-0.5 rounded-md bg-surface-active text-xs text-fg-secondary"
        >
          {entry.icon && <span aria-hidden="true">{entry.icon}</span>}
          <span className="truncate">{entry.label}</span>
        </span>
      ))}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="shrink-0 px-1.5 py-0.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg-secondary hover:bg-surface-active focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
        >
          {expanded ? 'Show less' : `+${hidden} more`}
        </button>
      )}
    </div>
  )
}
