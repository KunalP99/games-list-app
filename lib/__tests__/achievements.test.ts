import { describe, it, expect } from 'vitest'
import { getLevel, xpForLevel, levelProgress, gameCompletionXp } from '../achievements'

// XP thresholds: threshold(L) = 50 * L * (L - 1)
// L=1: 0, L=2: 100, L=3: 300, L=4: 600, L=5: 1000

describe('xpForLevel', () => {
  it('returns 0 XP required for level 1', () => {
    expect(xpForLevel(1)).toBe(0)
  })

  it('returns 100 XP required for level 2', () => {
    expect(xpForLevel(2)).toBe(100)
  })

  it('returns 300 XP required for level 3', () => {
    expect(xpForLevel(3)).toBe(300)
  })

  it('returns 600 XP required for level 4', () => {
    expect(xpForLevel(4)).toBe(600)
  })
})

describe('getLevel', () => {
  it('returns level 1 at 0 XP', () => {
    expect(getLevel(0)).toBe(1)
  })

  it('returns level 1 just below level 2 threshold (99 XP)', () => {
    expect(getLevel(99)).toBe(1)
  })

  it('returns level 2 at exactly the threshold (100 XP)', () => {
    expect(getLevel(100)).toBe(2)
  })

  it('returns level 2 just below level 3 threshold (299 XP)', () => {
    expect(getLevel(299)).toBe(2)
  })

  it('returns level 3 at exactly 300 XP', () => {
    expect(getLevel(300)).toBe(3)
  })

  it('returns level 4 at exactly 600 XP', () => {
    expect(getLevel(600)).toBe(4)
  })

  it('never returns below level 1 for 0 or negative XP', () => {
    expect(getLevel(0)).toBeGreaterThanOrEqual(1)
    expect(getLevel(-50)).toBeGreaterThanOrEqual(1)
  })
})

describe('levelProgress', () => {
  it('at level 1 with 50 XP, shows correct progress toward level 2', () => {
    const p = levelProgress(50)
    expect(p.level).toBe(1)
    expect(p.xp).toBe(50)
    expect(p.nextThreshold).toBe(100)
    expect(p.intoLevel).toBe(50)
    expect(p.span).toBe(100)
    expect(p.percent).toBe(50)
  })

  it('at exactly level 2 threshold shows 0% progress into level 2', () => {
    const p = levelProgress(100)
    expect(p.level).toBe(2)
    expect(p.intoLevel).toBe(0)
    expect(p.percent).toBe(0)
  })

  it('percent never exceeds 100', () => {
    const p = levelProgress(99999)
    expect(p.percent).toBeLessThanOrEqual(100)
  })
})

describe('gameCompletionXp', () => {
  it('awards 50 XP for a short game (null hours)', () => {
    expect(gameCompletionXp(null, null)).toBe(50)
  })

  it('awards 50 XP for a short game (< 20 hours)', () => {
    expect(gameCompletionXp(10, null)).toBe(50)
  })

  it('awards 100 XP for a medium game (20–49 hours)', () => {
    expect(gameCompletionXp(20, null)).toBe(100)
    expect(gameCompletionXp(49, null)).toBe(100)
  })

  it('awards 175 XP for a long game (50–100 hours)', () => {
    expect(gameCompletionXp(50, null)).toBe(175)
    expect(gameCompletionXp(100, null)).toBe(175)
  })

  it('awards 255 XP for a very long game (110 hours)', () => {
    // base 250 + floor((110-100)/10)*5 = 250 + 5 = 255
    expect(gameCompletionXp(110, null)).toBe(255)
  })

  it('awards 260 XP for 120 hours', () => {
    // 250 + floor(20/10)*5 = 250 + 10 = 260
    expect(gameCompletionXp(120, null)).toBe(260)
  })

  it('adds 75 XP bonus for 100% achievement progress', () => {
    expect(gameCompletionXp(10, 100)).toBe(125)   // 50 + 75
    expect(gameCompletionXp(20, 100)).toBe(175)   // 100 + 75
    expect(gameCompletionXp(50, 100)).toBe(250)   // 175 + 75
  })

  it('does not add achievement bonus for less than 100%', () => {
    expect(gameCompletionXp(10, 99)).toBe(50)
    expect(gameCompletionXp(10, null)).toBe(50)
  })
})
