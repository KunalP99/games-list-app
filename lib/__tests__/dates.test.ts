import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { todayIsoDate, isFutureDate } from '../dates'

describe('dates', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('todayIsoDate', () => {
    it('returns today as YYYY-MM-DD', () => {
      expect(todayIsoDate()).toBe('2026-10-31')
    })
  })

  describe('isFutureDate', () => {
    it('is false for today', () => {
      expect(isFutureDate('2026-10-31')).toBe(false)
    })

    it('is false for a past date', () => {
      expect(isFutureDate('2026-10-30')).toBe(false)
      expect(isFutureDate('2020-01-01')).toBe(false)
    })

    it('is true for a date after today', () => {
      expect(isFutureDate('2026-11-01')).toBe(true)
      // The actual real-world case: a game marked completed with a date
      // three weeks out.
      expect(isFutureDate('2026-11-20')).toBe(true)
    })

    it('is true for a future year-precision date (normalised to Jan 1)', () => {
      expect(isFutureDate('2027-01-01')).toBe(true)
    })

    it('is false for the current year normalised to Jan 1', () => {
      expect(isFutureDate('2026-01-01')).toBe(false)
    })
  })
})
