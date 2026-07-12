import { describe, it, expect } from 'vitest'
import { spinModeLabel, SPIN_TYPE_BADGE, rerollRunnerUp, spendNote, summariseSpends } from '../wheel-history'

describe('summariseSpends', () => {
  it('shows one row per paid action (spin again, then choose a game)', () => {
    // The use case: spin → pay to spin again (−3) → pay to choose instead (−9).
    // Must NOT collapse into a single misleading "chose your own game −12".
    expect(summariseSpends(
      [{ action: 'spin_again', amount: 3 }, { action: 'choose_any', amount: 9 }],
      'choose_any',
      12,
    )).toEqual([
      { note: 'You spun again', amount: 3, count: 1 },
      { note: 'You chose your own game', amount: 9, count: 1 },
    ])
  })

  it('collapses repeats of the same action into one row with a count', () => {
    expect(summariseSpends(
      [{ action: 'spin_again', amount: 3 }, { action: 'spin_again', amount: 3 }],
      'spin_again',
      6,
    )).toEqual([{ note: 'You spun again', amount: 6, count: 2 }])
  })

  it('handles a spin again followed by a paid upgrade', () => {
    expect(summariseSpends(
      [{ action: 'spin_again', amount: 3 }, { action: 'upgrade_choice', amount: 6 }],
      'upgrade_choice',
      9,
    )).toEqual([
      { note: 'You spun again', amount: 3, count: 1 },
      { note: 'You paid to spin & reroll', amount: 6, count: 1 },
    ])
  })

  it('returns no rows when nothing was spent', () => {
    expect(summariseSpends(null, 'accept', null)).toEqual([])
    expect(summariseSpends([], 'accept', 0)).toEqual([])
  })

  it('falls back to a single aggregate row for pre-migration rows', () => {
    expect(summariseSpends(null, 'spin_again', 3))
      .toEqual([{ note: 'You spun again', amount: 3, count: 1 }])
    expect(summariseSpends(null, null, 12))
      .toEqual([{ note: 'Tickets spent', amount: 12, count: 1 }])
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

describe('rerollRunnerUp', () => {
  it('returns the option that was not chosen (kept the first spin)', () => {
    // option_a = first spin, option_b = reroll; picked option_a
    expect(rerollRunnerUp('spin_reroll', 'reroll_choice', 'Hades', 'Celeste', 'Hades')).toBe('Celeste')
  })

  it('returns the option that was not chosen (kept the reroll)', () => {
    expect(rerollRunnerUp('spin_reroll', 'reroll_choice', 'Hades', 'Celeste', 'Celeste')).toBe('Hades')
  })

  it('is case-insensitive when matching the result', () => {
    expect(rerollRunnerUp('spin_reroll', 'reroll_choice', 'Hades', 'Celeste', 'hades')).toBe('Celeste')
  })

  it('returns null when the user kept the first spin (no reroll — option_b empty)', () => {
    expect(rerollRunnerUp('spin_reroll', 'reroll_choice', 'Hades', '', 'Hades')).toBeNull()
    expect(rerollRunnerUp('spin_reroll', 'reroll_choice', 'Hades', null, 'Hades')).toBeNull()
  })

  it('returns null for non-reroll finalizing actions', () => {
    expect(rerollRunnerUp('spin', 'spin_again', 'A', 'B', 'A')).toBeNull()
    expect(rerollRunnerUp('spin', 'choose_any', 'A', 'B', 'A')).toBeNull()
    expect(rerollRunnerUp('spin_reroll', 'upgrade_choice', 'A', 'B', 'A')).toBeNull()
  })

  it('covers pre-migration reroll rows (finalized_via null + spin_reroll + both options)', () => {
    expect(rerollRunnerUp('spin_reroll', null, 'Doom', 'Celeste', 'Doom')).toBe('Celeste')
  })

  it('returns null for pre-migration non-reroll turns', () => {
    expect(rerollRunnerUp('spin', null, 'A', 'B', 'A')).toBeNull()
  })
})

describe('spendNote', () => {
  it('describes what the tickets were spent on', () => {
    expect(spendNote('spin_again')).toBe('You spun again')
    expect(spendNote('upgrade_choice')).toBe('You paid to spin & reroll')
    expect(spendNote('choose_any')).toBe('You chose your own game')
  })

  it('falls back to a generic label for pre-migration rows', () => {
    expect(spendNote(null)).toBe('Tickets spent')
  })

  it('falls back to a generic label for free actions that somehow carry a cost', () => {
    expect(spendNote('accept')).toBe('Tickets spent')
    expect(spendNote('reroll_choice')).toBe('Tickets spent')
  })
})

