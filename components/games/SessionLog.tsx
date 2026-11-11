'use client'

import { useEffect, useState } from 'react'

export type LogSession = {
  id: string
  dayKey: string
  date: string
  /** The whole day's total — every session that day, shown or not. */
  dayTotal: string
  dayCount: number
  time: string
  duration: string
  live: boolean
}

/** Sessions shown before "Show all". */
const INITIAL = 5

type Hover = { day: LogSession; top: number; right: number }

/** Consecutive sessions on the same UK day, in order — one block each. */
function groupByDay(sessions: LogSession[]): LogSession[][] {
  const days: LogSession[][] = []
  for (const s of sessions) {
    const last = days[days.length - 1]
    if (last && last[0].dayKey === s.dayKey) last.push(s)
    else days.push([s])
  }
  return days
}

/**
 * The Play Sessions card's list: date, time of day, length — one line per
 * session, grouped into one block per day. Hovering a day highlights the
 * whole block and floats a card with the day's total above it.
 */
export default function SessionLog({ sessions }: { sessions: LogSession[] }) {
  const [expanded, setExpanded] = useState(false)
  const [hover, setHover] = useState<Hover | null>(null)
  const days = groupByDay(expanded ? sessions : sessions.slice(0, INITIAL))

  // The floating card is placed against the window, so it would drift off
  // its day on scroll — hide it instead.
  useEffect(() => {
    if (!hover) return
    const hide = () => setHover(null)
    window.addEventListener('scroll', hide, true)
    return () => window.removeEventListener('scroll', hide, true)
  }, [hover])

  return (
    <div>
      {/* Expanded, it scrolls inside the card rather than growing: in the
          sticky sidebar a long list would push everything below it out of
          reach. */}
      <ul
        className={`-mx-2 divide-y divide-edge-subtle ${expanded ? 'max-h-80 overflow-y-auto' : ''}`}
        onMouseLeave={() => setHover(null)}
      >
        {days.map(day => {
          const first = day[0]
          return (
            <li
              key={first.dayKey}
              onMouseEnter={e => {
                const r = e.currentTarget.getBoundingClientRect()
                setHover({ day: first, top: r.top, right: window.innerWidth - r.right })
              }}
              className={`px-2 py-1 rounded-md transition-colors ${
                hover?.day.dayKey === first.dayKey ? 'bg-surface-active' : ''
              }`}
            >
              {day.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 py-1 text-xs">
                  {/* The date once, on the day's first session. */}
                  <span className="flex-1 min-w-0 font-medium text-fg-base truncate">{i === 0 ? s.date : ''}</span>
                  <span className="shrink-0 text-fg-muted tabular-nums whitespace-nowrap">
                    {s.live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5 align-middle" />}
                    {s.time}
                  </span>
                  <span className="min-w-[3.5rem] shrink-0 whitespace-nowrap text-right font-semibold text-fg-base tabular-nums">{s.duration}</span>
                </div>
              ))}
            </li>
          )
        })}
      </ul>

      {hover && (
        // Fixed to the window rather than the card, so the scrolling list
        // can't clip it.
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-full rounded-lg border border-edge-base bg-surface-elevated px-3 py-2 shadow-lg"
          style={{ top: hover.top - 6, right: hover.right }}
        >
          <p className="text-[11px] font-medium text-fg-muted">{hover.day.date}</p>
          <p className="text-sm font-semibold text-fg-base tabular-nums whitespace-nowrap">
            {hover.day.dayTotal}
            <span className="text-xs font-normal text-fg-muted">
              {' · '}{hover.day.dayCount} {hover.day.dayCount === 1 ? 'session' : 'sessions'}
            </span>
          </p>
        </div>
      )}

      {sessions.length > INITIAL && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-2 text-xs font-medium text-brand-500 hover:text-brand-600 transition-colors"
        >
          {expanded ? 'Show fewer' : `Show all ${sessions.length}`}
        </button>
      )}
    </div>
  )
}
