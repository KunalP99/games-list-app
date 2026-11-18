import { describe, it, expect } from 'vitest'
import { validateUsername, canChangeUsername, suggestUsernames, validatePassword, normaliseUsername } from '../username'

describe('validateUsername', () => {
  it('accepts letters, numbers and underscores, lowercased', () => {
    expect(validateUsername('Kunal_99')).toEqual({ ok: true, value: 'kunal_99' })
    expect(validateUsername('  abc  ')).toEqual({ ok: true, value: 'abc' })
  })

  it('enforces length', () => {
    expect(validateUsername('ab').ok).toBe(false)
    expect(validateUsername('a'.repeat(20)).ok).toBe(true)
    expect(validateUsername('a'.repeat(21)).ok).toBe(false)
  })

  it('rejects other characters and a leading digit or underscore', () => {
    for (const bad of ['kun al', 'kunal!', 'kunal.p', 'user+tag', 'kunál']) expect(validateUsername(bad).ok).toBe(false)
    expect(validateUsername('9lives')).toEqual({ ok: false, error: 'Start with a letter.' })
    expect(validateUsername('_kunal').ok).toBe(false)
  })

  it('refuses reserved names, abuse, and extra names given by the caller', () => {
    expect(validateUsername('Admin').ok).toBe(false)
    expect(validateUsername('settings').ok).toBe(false)
    expect(validateUsername('xxfuckxx').ok).toBe(false)
    expect(validateUsername('playpath', ['Playpath']).ok).toBe(false)
    expect(validateUsername('playpath').ok).toBe(true)
  })
})

describe('canChangeUsername', () => {
  const now = new Date('2026-11-18T12:00:00Z')

  it('allows a first change', () => {
    expect(canChangeUsername(null, now)).toEqual({ ok: true })
  })

  it('waits 30 days after a change', () => {
    const r = canChangeUsername('2026-11-01T12:00:00Z', now)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.nextAt.toISOString()).toBe('2026-12-01T12:00:00.000Z')
    expect(canChangeUsername('2026-10-19T12:00:00Z', now)).toEqual({ ok: true })
  })
})

describe('suggestUsernames', () => {
  it('offers free, valid alternatives', () => {
    const taken = new Set(['kunal', 'kunal_1'])
    const s = suggestUsernames('Kunal', n => taken.has(n), 3, () => 0.5)
    expect(s).toEqual(['kunal_2', 'kunal_3', 'kunal_4'])
    expect(s.every(n => validateUsername(n).ok)).toBe(true)
  })

  it('strips characters a username cannot have and stays within length', () => {
    const s = suggestUsernames('john.smith+games-very-long', () => false, 1)
    expect(s[0]).toBe('johnsmithgamesve_1')
    expect(s[0].length).toBeLessThanOrEqual(20)
  })
})

describe('validatePassword', () => {
  it('needs 8+ characters with a letter and a number', () => {
    expect(validatePassword('short1').ok).toBe(false)
    expect(validatePassword('longenough').ok).toBe(false)
    expect(validatePassword('12345678').ok).toBe(false)
    expect(validatePassword('longenough1').ok).toBe(true)
  })
})

describe('normaliseUsername', () => {
  it('trims and lowercases', () => {
    expect(normaliseUsername('  MiXeD ')).toBe('mixed')
  })
})
