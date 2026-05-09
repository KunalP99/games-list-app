import { describe, it, expect } from 'vitest'
import { inferCost, spinModeLabel, SPIN_TYPE_BADGE } from '../wheel-history'

describe('inferCost', () => {
  it('returns −9 🎟️ when 9 tickets spent', () => {
    expect(inferCost('spin', 9)).toBe('−9 🎟️')
  })

  it('returns −3 🎟️ when 3 tickets spent', () => {
    expect(inferCost('spin', 3)).toBe('−3 🎟️')
  })

  it('returns −6 🎟️ when 6 tickets spent', () => {
    expect(inferCost('spin_reroll', 6)).toBe('−6 🎟️')
  })

  it('returns +2 🎟️ for choose_skip', () => {
    expect(inferCost('choose_skip', null)).toBe('+2 🎟️')
  })

  it('returns null when no tickets spent', () => {
    expect(inferCost('spin', null)).toBeNull()
    expect(inferCost('spin', 0)).toBeNull()
    expect(inferCost('spin_reroll', null)).toBeNull()
    expect(inferCost('choose', null)).toBeNull()
  })
})

describe('spinModeLabel', () => {
  it('returns "Elimination" for elimination mode', () => {
    expect(spinModeLabel('elimination')).toBe('Elimination')
  })

  it('returns "First Land" for first_land mode', () => {
    expect(spinModeLabel('first_land')).toBe('First Land')
  })

  it('returns null for null mode', () => {
    expect(spinModeLabel(null)).toBeNull()
  })
})

describe('SPIN_TYPE_BADGE', () => {
  it('has a label for every spin type', () => {
    expect(SPIN_TYPE_BADGE.spin.label).toBe('Spin')
    expect(SPIN_TYPE_BADGE.spin_reroll.label).toBe('Reroll')
    expect(SPIN_TYPE_BADGE.choose.label).toBe('Choose')
    expect(SPIN_TYPE_BADGE.choose_skip.label).toBe('Skip')
  })

  it('all badges have a className', () => {
    for (const badge of Object.values(SPIN_TYPE_BADGE)) {
      expect(badge.className.length).toBeGreaterThan(0)
    }
  })
})
