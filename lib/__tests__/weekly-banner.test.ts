import { describe, it, expect } from 'vitest'
import { weekIndex, hashString, pickWeekly } from '../weekly-banner'

describe('weekIndex', () => {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000

  it('is stable within a week and increments across one', () => {
    // Anchored to an actual week boundary: epoch weeks roll over on a Thursday,
    // so an arbitrary date plus a few days may or may not still be "this week".
    const weekStart = weekIndex(new Date('2026-09-14T12:00:00Z')) * WEEK_MS
    const start = new Date(weekStart)
    const lastMoment = new Date(weekStart + WEEK_MS - 1)
    const nextWeek = new Date(weekStart + WEEK_MS)

    expect(weekIndex(lastMoment)).toBe(weekIndex(start))
    expect(weekIndex(nextWeek)).toBe(weekIndex(start) + 1)
  })
})

describe('hashString', () => {
  it('is deterministic and returns an unsigned 32-bit value', () => {
    expect(hashString('alex')).toBe(hashString('alex'))
    expect(hashString('alex')).not.toBe(hashString('sam'))
    expect(hashString('alex')).toBeGreaterThanOrEqual(0)
    expect(hashString('alex')).toBeLessThan(2 ** 32)
  })
})

describe('pickWeekly', () => {
  const games = ['a', 'b', 'c', 'd', 'e']

  it('returns null for an empty list', () => {
    expect(pickWeekly([], 'user', 100)).toBeNull()
  })

  it('always returns a member of the list', () => {
    for (let week = 0; week < 60; week++) {
      expect(games).toContain(pickWeekly(games, 'user', week))
    }
  })

  it('gives the same answer for the same seed and week', () => {
    expect(pickWeekly(games, 'user', 42)).toBe(pickWeekly(games, 'user', 42))
  })

  it('gives different users different banners in the same week', () => {
    const picks = new Set(
      ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map(u => pickWeekly(games, u, 42)),
    )
    expect(picks.size).toBeGreaterThan(1)
  })

  it('actually rotates over consecutive weeks', () => {
    const picks = new Set(
      Array.from({ length: 30 }, (_, w) => pickWeekly(games, 'user', w)),
    )
    // Not asserting it hits all five — that would be asserting on the hash.
    // The real claim is that it moves, rather than sticking on one game.
    expect(picks.size).toBeGreaterThan(2)
  })

  it('handles a single-item list without going out of bounds', () => {
    for (let week = 0; week < 10; week++) {
      expect(pickWeekly(['only'], 'user', week)).toBe('only')
    }
  })
})
