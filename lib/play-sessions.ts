/**
 * The Play Sessions card on a game's page: every session the desktop agent
 * tracked for it, as a plain list. Pure — the page does the one query, this
 * does the rest.
 *
 * Everything is on UK time, like the activity feed (lib/activity.ts): the
 * server runs in UTC, which would put a late-evening session an hour out in
 * summer and sometimes on the wrong day.
 */
import { isSessionLive } from './presence'
import { londonDay } from './activity'

export type PlaySessionRow = {
  id: string
  started_at: string
  ended_at: string | null
  last_checkpoint_at: string | null
  minutes: number
}

export type TrackedSession = {
  id: string
  start: string
  /**
   * When it last ran: the real end, or — for one that never got an end
   * because the PC slept — its last checkpoint. "Now" while live.
   */
  end: string
  minutes: number
  live: boolean
}

/**
 * Rows → sessions worth showing, newest first. Drops the sub-minute ones the
 * feed drops too (a game opened and closed again), but keeps a live one
 * however short — it's happening.
 */
export function toTrackedSessions(rows: PlaySessionRow[], nowMs: number): TrackedSession[] {
  return rows
    .map(row => {
      const live = isSessionLive(row, nowMs)
      return {
        id: row.id,
        start: row.started_at,
        end: live ? new Date(nowMs).toISOString() : (row.ended_at ?? row.last_checkpoint_at ?? row.started_at),
        // A live row's minutes are as of its last checkpoint, up to 15m old.
        minutes: live ? Math.max(row.minutes, Math.floor((nowMs - Date.parse(row.started_at)) / 60000)) : row.minutes,
        live,
      }
    })
    .filter(s => s.live || s.minutes >= 1)
    .sort((a, b) => b.start.localeCompare(a.start))
}

const shortDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' })

/**
 * "Today", "Yesterday", else "Tue 4 Nov" — with the year when it isn't this
 * one. Always the actual date past yesterday, so a list of them reads at a
 * glance without working out which "Tuesday" is meant.
 */
export function sessionDateLabel(iso: string, now: Date = new Date()): string {
  const day = londonDay(iso)
  const today = londonDay(now.toISOString())
  if (day === today) return 'Today'
  // Day maths on the YYYY-MM-DD keys, not "now minus 24h", which lands on
  // the wrong day either side of a 23- or 25-hour clock-change day.
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  if (day === yesterday) return 'Yesterday'
  const label = shortDate.format(new Date(iso)).replace(',', '')
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${day.slice(0, 4)}`
}
