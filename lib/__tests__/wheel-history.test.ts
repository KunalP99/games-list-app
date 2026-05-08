import { describe, it, expect } from 'vitest'
import { inferCost, spinModeLabel, SPIN_TYPE_BADGE } from '../wheel-history'

describe('inferCost', () => {
  it('returns −9 🎟️ for choose_any spin (spin type + null mode)', () => {
    expect(inferCost('spin', null)).toBe('−9 🎟️')
  })

  it('returns +2 🎟️ for choose_skip', () => {
    expect(inferCost('choose_skip', null)).toBe('+2 🎟️')
  })

  it('returns null for free spin (spin + elimination mode)', () => {
    expect(inferCost('spin', 'elimination')).toBeNull()
  })

  it('returns null for free spin (spin + first_land mode)', () => {
    expect(inferCost('spin', 'first_land')).toBeNull()
  })

  it('returns null for spin_reroll', () => {
    expect(inferCost('spin_reroll', 'elimination')).toBeNull()
    expect(inferCost('spin_reroll', 'first_land')).toBeNull()
    expect(inferCost('spin_reroll', null)).toBeNull()
  })

  it('returns null for free choose', () => {
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
