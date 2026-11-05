import { formatSessionDuration, formatSessionTime } from '@/lib/activity'
import { londonDay } from '@/lib/activity'
import { sessionDateLabel, type TrackedSession } from '@/lib/play-sessions'
import SessionLog, { type LogSession } from './SessionLog'

/**
 * Every session the desktop agent tracked for this game, newest first: when
 * it was played and for how long. Kept deliberately plain — one readable line
 * per session. Only rendered when there's at least one session, so
 * manually-logged games don't get an empty card.
 */
export default function PlaySessionsCard({ sessions }: { sessions: TrackedSession[] }) {
  if (sessions.length === 0) return null

  const rows: LogSession[] = sessions.map(s => ({
    id: s.id,
    dayKey: londonDay(s.start),
    date: sessionDateLabel(s.start),
    time: `${formatSessionTime(s.start)} – ${s.live ? 'now' : formatSessionTime(s.end)}`,
    duration: formatSessionDuration(s.minutes),
    live: s.live,
  }))

  return (
    <div className="bg-surface-base border border-edge-base rounded-xl p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-xs text-fg-muted font-medium uppercase tracking-wider">Play Sessions</p>
        <p className="text-xs text-fg-subtle">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>
      <SessionLog sessions={rows} />
    </div>
  )
}
