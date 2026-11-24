'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { ActivityBatchEntry } from '@/lib/activity'
import { chipsThatFit } from '@/lib/activity-chips'

// How many members of a batch are named on the first paint, before the row
// has been measured (the server render). Three fits the narrowest layout.
const DEFAULT_SHOWN = 3
const GAP_PX = 6 // gap-1.5

const chipClass = 'inline-flex shrink-0 items-center gap-1 max-w-[11rem] px-1.5 py-0.5 rounded-md bg-surface-active text-xs text-fg-secondary'
const moreClass = 'shrink-0 px-1.5 py-0.5 rounded-md text-xs font-medium text-fg-muted hover:text-fg-secondary hover:bg-surface-active focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors'

function Chip({ entry }: { entry: ActivityBatchEntry }) {
  const inner = (
    <>
      {entry.icon && <span aria-hidden="true">{entry.icon}</span>}
      <span className="truncate">{entry.label}</span>
    </>
  )
  // A game's chip opens its page.
  return entry.href
    ? <Link href={entry.href} title={entry.label} className={`${chipClass} hover:bg-surface-hover hover:text-fg-base transition-colors`}>{inner}</Link>
    : <span title={entry.label} className={chipClass}>{inner}</span>
}

/**
 * The chips under a stacked activity row (a day's achievement unlocks, or a
 * day's backlog adds). Collapsed it names as many as fit on one line, then
 * "+N more" for the rest, never a chip cut off at the edge: the row measures
 * its chips (an invisible copy) and recounts whenever its width changes.
 * Clicking "+N more" reveals the rest in place; "Show less" collapses again.
 *
 * A client component for the toggle and the measuring; the row around it
 * stays server rendered.
 */
export default function ActivityBatchChips({
  entries,
  shown = DEFAULT_SHOWN,
}: {
  entries: ActivityBatchEntry[]
  /** How many to name before the row has been measured. */
  shown?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [fit, setFit] = useState(Math.min(shown, entries.length))
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    function recount() {
      const items = Array.from(measure!.children) as HTMLElement[]
      const more = items.pop() // the sample "+N more", measured last
      setFit(chipsThatFit({
        available: row!.clientWidth,
        chipWidths: items.map(el => el.offsetWidth),
        moreWidth: more?.offsetWidth ?? 0,
        gap: GAP_PX,
      }))
    }
    recount()
    const observer = new ResizeObserver(recount)
    observer.observe(row)
    return () => observer.disconnect()
  }, [entries])

  const count = expanded ? entries.length : fit
  const hidden = entries.length - count

  return (
    <div ref={rowRef} className="relative mt-1.5">
      {/* An invisible one-line copy of every chip, plus the widest "+N more"
          this batch can need, so the row knows how much each takes. */}
      <div ref={measureRef} aria-hidden="true" className="invisible absolute left-0 top-0 flex gap-1.5 whitespace-nowrap pointer-events-none">
        {entries.map(entry => <Chip key={entry.id} entry={entry} />)}
        <span className={moreClass}>+{entries.length} more</span>
      </div>

      {/* Collapsed: one line, sized to what fits. Expanded: wraps, so a long
          batch stacks neatly rather than squeezing the chips. */}
      <div className={`flex items-center gap-1.5 ${expanded ? 'flex-wrap' : 'overflow-hidden'}`}>
        {entries.slice(0, count).map(entry => <Chip key={entry.id} entry={entry} />)}
        {(hidden > 0 || expanded) && entries.length > fit && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className={moreClass}
          >
            {expanded ? 'Show less' : `+${hidden} more`}
          </button>
        )}
      </div>
    </div>
  )
}
