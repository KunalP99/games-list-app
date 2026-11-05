import { describe, it, expect } from 'vitest'
import { sessionDateLabel, toTrackedSessions, type PlaySessionRow } from '../play-sessions'

const row = (id: string, start: string, end: string | null, minutes: number, checkpoint: string | null = end): PlaySessionRow =>
  ({ id, started_at: start, ended_at: end, last_checkpoint_at: checkpoint, minutes })

describe('toTrackedSessions', () => {
  const now = Date.parse('2025-11-05T22:00:00Z')

  it('drops sub-minute sessions, sorts newest first', () => {
    const out = toTrackedSessions([
      row('a', '2025-11-01T10:00:00Z', '2025-11-01T11:00:00Z', 60),
      row('b', '2025-11-03T10:00:00Z', '2025-11-03T10:00:20Z', 0),
      row('c', '2025-11-04T10:00:00Z', '2025-11-04T10:30:00Z', 30),
    ], now)
    expect(out.map(s => s.id)).toEqual(['c', 'a'])
  })

  it('treats a recently checkpointed open session as live, timed up to now', () => {
    const [s] = toTrackedSessions([row('live', '2025-11-05T21:00:00Z', null, 45, '2025-11-05T21:45:00Z')], now)
    expect(s.live).toBe(true)
    expect(s.minutes).toBe(60)
    expect(s.end).toBe('2025-11-05T22:00:00.000Z')
  })

  it('ends a stale open session at its last checkpoint', () => {
    const [s] = toTrackedSessions([row('stale', '2025-11-04T20:00:00Z', null, 90, '2025-11-04T21:30:00Z')], now)
    expect(s.live).toBe(false)
    expect(s.end).toBe('2025-11-04T21:30:00Z')
  })
})

describe('sessionDateLabel', () => {
  const now = new Date('2025-11-05T10:00:00Z') // Wed 5 Nov 2025

  it('says Today and Yesterday, then the short date', () => {
    expect(sessionDateLabel('2025-11-05T08:00:00Z', now)).toBe('Today')
    expect(sessionDateLabel('2025-11-04T21:00:00Z', now)).toBe('Yesterday')
    expect(sessionDateLabel('2025-11-02T21:00:00Z', now)).toBe('Sun 2 Nov')
  })

  it('adds the year when it isn\'t this one', () => {
    expect(sessionDateLabel('2024-12-30T21:00:00Z', now)).toBe('Mon 30 Dec 2024')
  })

  it('uses the UK day, not the UTC one', () => {
    // 23:30 UTC on Mon 30 June is 00:30 BST on Tuesday 1 July.
    expect(sessionDateLabel('2025-06-30T23:30:00Z', now)).toBe('Tue 1 Jul')
  })

  it('finds yesterday across the spring clock change', () => {
    // 00:30 BST on Mon 31 Mar 2025, the morning after the 23-hour Sunday.
    expect(sessionDateLabel('2025-03-30T12:00:00Z', new Date('2025-03-30T23:30:00Z'))).toBe('Yesterday')
  })
})
