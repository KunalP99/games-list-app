import { describe, it, expect } from 'vitest'
import { settleSession, LIVE_STALE_AFTER_MS } from '../presence'
import { toTrackedSessions } from '../play-sessions'

const now = Date.parse('2026-11-19T12:00:00Z')
const iso = (msAgo: number) => new Date(now - msAgo).toISOString()

describe('settleSession', () => {
  it('leaves a finished session alone', () => {
    const s = { started_at: iso(3 * 3600_000), last_checkpoint_at: iso(3600_000), ended_at: iso(3600_000) }
    expect(settleSession(s, now)).toBe(s)
  })

  it('leaves a live session open (checked in within the last 20 minutes)', () => {
    const s = { started_at: iso(3600_000), last_checkpoint_at: iso(5 * 60_000), ended_at: null }
    expect(settleSession(s, now).ended_at).toBeNull()
  })

  it('ends a session the tracker never closed at its last checkpoint', () => {
    // The real case: started 15:04, last checkpoint 19:51, never closed.
    const s = { started_at: '2026-11-18T15:04:57Z', last_checkpoint_at: '2026-11-18T19:51:58Z', ended_at: null, minutes: 287 }
    const settled = settleSession(s, now)
    expect(settled.ended_at).toBe('2026-11-18T19:51:58Z')
    expect(settled.minutes).toBe(287)
  })

  it('ends one that never checked in at its start', () => {
    const s = { started_at: iso(2 * 3600_000), last_checkpoint_at: null, ended_at: null }
    expect(settleSession(s, now).ended_at).toBe(s.started_at)
  })

  it('stops counting as live exactly when the live badge does', () => {
    const fresh = { started_at: iso(3600_000), last_checkpoint_at: iso(LIVE_STALE_AFTER_MS - 1000), ended_at: null }
    const stale = { started_at: iso(3600_000), last_checkpoint_at: iso(LIVE_STALE_AFTER_MS + 1000), ended_at: null }
    expect(settleSession(fresh, now).ended_at).toBeNull()
    expect(settleSession(stale, now).ended_at).toBe(stale.last_checkpoint_at)
  })

  it('agrees with the game page\'s session list on where an unclosed session ends', () => {
    const row = { id: 'a', started_at: '2026-11-18T15:04:57Z', last_checkpoint_at: '2026-11-18T19:51:58Z', ended_at: null, minutes: 287 }
    const [tracked] = toTrackedSessions([row], now)
    expect(tracked.live).toBe(false)
    expect(settleSession(row, now).ended_at).toBe(tracked.end)
  })
})
