import { describe, it, expect } from 'vitest'
import {
  validateSessionPayload,
  computeHoursDelta,
  roundHours,
  addHours,
  normaliseExeName,
  CLOCK_SKEW_MS,
} from '../agent-session'

const NOW = Date.parse('2026-10-30T12:00:00Z')
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const payload = (over: Record<string, unknown> = {}) => ({
  clientSessionId: 'abc-123',
  minutes: 30,
  startedAt: ago(35),
  steamAppId: 413150,
  ...over,
})

describe('roundHours', () => {
  it('rounds to the 0.1 that numeric(6,1) can actually store', () => {
    expect(roundHours(1.24)).toBe(1.2)
    expect(roundHours(1.25)).toBe(1.3)
    expect(roundHours(0.0166)).toBe(0)
  })
})

describe('normaliseExeName', () => {
  it('strips the path and lowercases', () => {
    expect(normaliseExeName('C:\\Games\\Hades\\Hades.exe')).toBe('hades.exe')
    expect(normaliseExeName('/opt/games/Celeste.EXE')).toBe('celeste.exe')
    expect(normaliseExeName('  SplitFiction.exe ')).toBe('splitfiction.exe')
  })
})

describe('validateSessionPayload', () => {
  it('accepts a well-formed checkpoint', () => {
    const result = validateSessionPayload(payload(), NOW)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.minutes).toBe(30)
      expect(result.value.steamAppId).toBe(413150)
      expect(result.value.endedAt).toBeNull()
    }
  })

  it('rejects a claim longer than the session has existed', () => {
    // Started 10 minutes ago, claiming 600 minutes played.
    const result = validateSessionPayload(payload({ startedAt: ago(10), minutes: 600 }), NOW)
    expect(result).toEqual({ ok: false, error: 'minutes exceed elapsed time' })
  })

  it('allows a long legitimate session — there is no cap on length', () => {
    // Three days running, counted in full: idle time counts by design.
    const threeDays = 3 * 24 * 60
    const result = validateSessionPayload(payload({ startedAt: ago(threeDays + 5), minutes: threeDays }), NOW)
    expect(result.ok).toBe(true)
  })

  it('tolerates modest clock skew on the agent machine', () => {
    const skewed = new Date(NOW + CLOCK_SKEW_MS - 1000).toISOString()
    expect(validateSessionPayload(payload({ startedAt: skewed, minutes: 0 }), NOW).ok).toBe(true)
  })

  it('rejects a start time beyond the skew allowance', () => {
    const future = new Date(NOW + CLOCK_SKEW_MS + 60_000).toISOString()
    expect(validateSessionPayload(payload({ startedAt: future }), NOW)).toEqual({
      ok: false, error: 'startedAt is in the future',
    })
  })

  it('requires something to match the game on', () => {
    const result = validateSessionPayload(
      { clientSessionId: 'x', minutes: 1, startedAt: ago(5) }, NOW)
    expect(result).toEqual({ ok: false, error: 'one of steamAppId or exeName is required' })
  })

  it('accepts an exe instead of a steam id, normalised', () => {
    const result = validateSessionPayload(
      payload({ steamAppId: undefined, exeName: 'D:\\Games\\SplitFiction.exe' }), NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.exeName).toBe('splitfiction.exe')
  })

  it('rejects malformed input', () => {
    expect(validateSessionPayload(null, NOW).ok).toBe(false)
    expect(validateSessionPayload('nope', NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ clientSessionId: '' }), NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ minutes: -5 }), NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ minutes: 'lots' }), NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ startedAt: 'yesterday' }), NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ steamAppId: 0 }), NOW).ok).toBe(false)
    expect(validateSessionPayload(payload({ steamAppId: 1.5 }), NOW).ok).toBe(false)
  })

  it('rejects an end time before the start', () => {
    const result = validateSessionPayload(payload({ endedAt: ago(90) }), NOW)
    expect(result).toEqual({ ok: false, error: 'endedAt precedes startedAt' })
  })
})

describe('computeHoursDelta', () => {
  const base = { lastCheckpointAtMs: null, nowMs: NOW }

  it('adds only what has not been applied yet', () => {
    // 90 minutes played, 1.0h already written -> add 0.5h
    expect(computeHoursDelta({ ...base, minutes: 90, appliedHours: 1 })).toBe(0.5)
  })

  it('returns zero when a checkpoint is replayed', () => {
    expect(computeHoursDelta({ ...base, minutes: 90, appliedHours: 1.5 })).toBe(0)
  })

  it('never returns a negative delta if applied hours somehow exceed the claim', () => {
    expect(computeHoursDelta({ ...base, minutes: 30, appliedHours: 5 })).toBe(0)
  })

  it('bounds a single jump to the time since the previous checkpoint', () => {
    // Last checkpoint 15 minutes ago, now claiming 10 extra hours.
    const delta = computeHoursDelta({
      minutes: 600, appliedHours: 0,
      lastCheckpointAtMs: NOW - 15 * 60_000, nowMs: NOW,
    })
    // 15 minutes elapsed + 5 minutes skew = 0.3h
    expect(delta).toBe(0.3)
  })

  it('applies the full delta when it fits inside the elapsed window', () => {
    const delta = computeHoursDelta({
      minutes: 30, appliedHours: 0,
      lastCheckpointAtMs: NOW - 30 * 60_000, nowMs: NOW,
    })
    expect(delta).toBe(0.5)
  })

  it('ignores sub-six-minute checkpoints rather than losing them to rounding', () => {
    // 3 minutes rounds to 0.1h? No - 0.05h rounds to 0.1. Check the real value.
    expect(computeHoursDelta({ ...base, minutes: 3, appliedHours: 0 })).toBe(0.1)
    expect(computeHoursDelta({ ...base, minutes: 1, appliedHours: 0 })).toBe(0)
  })
})

describe('addHours', () => {
  it('treats a null existing total as zero', () => {
    expect(addHours(null, 1.5)).toBe(1.5)
    expect(addHours(undefined, 0.5)).toBe(0.5)
  })

  it('adds to a manually entered total, as the feature requires', () => {
    expect(addHours(300, 2)).toBe(302)
    expect(addHours(41.5, 0.3)).toBe(41.8)
  })

  it('stays on the 0.1 grid through repeated additions', () => {
    let total = 0
    for (let i = 0; i < 10; i++) total = addHours(total, 0.1)
    expect(total).toBe(1)
  })
})
