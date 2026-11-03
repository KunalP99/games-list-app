'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { formatSessionDuration, formatSessionTime, type PlaySessionEntry } from '@/lib/activity'

/**
 * The sessions behind a day's combined "played <game> for 2h 15m" row. The
 * toggle sits inline at the end of the headline — "… for 3h 12m in 3 sessions
 * ▾" — and the list opens below it, so the two share state through
 * `PlaySessions`, which wraps the row's text. Same idea as the "+N more"
 * toggle in ActivityBatchChips.
 *
 * Everything renders nothing for fewer than two sessions: the headline
 * already says all there is. Client components purely for the toggle; the row
 * around them stays server rendered.
 */
type State = { sessions: PlaySessionEntry[]; expanded: boolean; toggle: () => void }

const SessionsContext = createContext<State | null>(null)

export function PlaySessions({ sessions, children }: { sessions: PlaySessionEntry[] | undefined; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <SessionsContext.Provider value={{ sessions: sessions ?? [], expanded, toggle: () => setExpanded(v => !v) }}>
      {children}
    </SessionsContext.Provider>
  )
}

/** " in 3 sessions ▾" — goes inside the headline, straight after the duration. */
export function PlaySessionsToggle() {
  const state = useContext(SessionsContext)
  if (!state || state.sessions.length < 2) return null
  return (
    <>
      {' '}
      <button
        type="button"
        onClick={state.toggle}
        aria-expanded={state.expanded}
        className="inline-flex items-center gap-1 rounded text-fg-muted hover:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 transition-colors"
      >
        in {state.sessions.length} sessions
        <span aria-hidden="true" className="text-[0.7em]">{state.expanded ? '▲' : '▼'}</span>
      </button>
    </>
  )
}

/** Each session's start – end on a UK clock, and its length. Under the headline, once expanded. */
export function PlaySessionsList() {
  const state = useContext(SessionsContext)
  if (!state || state.sessions.length < 2 || !state.expanded) return null
  return (
    <ul className="mt-1 space-y-0.5">
      {state.sessions.map(s => (
        <li key={s.startedAt} className="flex items-center gap-2 text-xs text-fg-secondary tabular-nums">
          <span>
            {formatSessionTime(s.startedAt)} – {s.endedAt ? formatSessionTime(s.endedAt) : 'now'}
          </span>
          {s.endedAt && <span className="text-fg-subtle">· {formatSessionDuration(s.minutes)}</span>}
        </li>
      ))}
    </ul>
  )
}
