'use client'

import { useState } from 'react'

export type LogSession = { id: string; dayKey: string; date: string; time: string; duration: string; live: boolean }

/** Sessions shown before "Show all". */
const INITIAL = 5

/** The Play Sessions card's list: date, time of day, length — one line each. */
export default function SessionLog({ sessions }: { sessions: LogSession[] }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? sessions : sessions.slice(0, INITIAL)

  return (
    <div>
      {/* Expanded, it scrolls inside the card rather than growing: in the
          sticky sidebar a long list would push everything below it out of
          reach. */}
      <ul className={`divide-y divide-edge-subtle ${expanded ? 'max-h-80 overflow-y-auto pr-1' : ''}`}>
        {shown.map((s, i) => {
          // A day's later sessions sit under its first one: no repeated
          // date, and no divider between them.
          const sameDay = i > 0 && shown[i - 1].dayKey === s.dayKey
          return (
          <li key={s.id} className={`flex items-center gap-3 text-xs ${sameDay ? '!border-t-0 pb-2' : 'py-2'}`}>
            <span className="flex-1 min-w-0 font-medium text-fg-base truncate">{sameDay ? '' : s.date}</span>
            <span className="text-fg-muted tabular-nums whitespace-nowrap">
              {s.live && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5 align-middle" />}
              {s.time}
            </span>
            <span className="w-12 text-right font-semibold text-fg-base tabular-nums">{s.duration}</span>
          </li>
          )
        })}
      </ul>

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
