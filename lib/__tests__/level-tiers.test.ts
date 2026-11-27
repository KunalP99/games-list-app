import { describe, expect, it } from 'vitest'
import { LEVEL_TIERS, levelTier, tierRange } from '../level-tiers'

describe('levelTier', () => {
  it.each([
    [1, 'rookie'], [4, 'rookie'],
    [5, 'bronze'], [9, 'bronze'],
    [10, 'silver'], [14, 'silver'],
    [15, 'gold'], [19, 'gold'],
    [20, 'emerald'], [24, 'emerald'],
    [25, 'diamond'], [29, 'diamond'],
    [30, 'inferno'], [49, 'inferno'],
    [50, 'mythic'], [120, 'mythic'],
  ])('level %i is %s', (level, id) => {
    expect(levelTier(level).id).toBe(id)
  })

  it('treats nonsense as Rookie', () => {
    expect(levelTier(0).id).toBe('rookie')
    expect(levelTier(-3).id).toBe('rookie')
    expect(levelTier(NaN).id).toBe('rookie')
  })

  it('has tiers in rising order starting at level 1', () => {
    expect(LEVEL_TIERS[0].from).toBe(1)
    for (let i = 1; i < LEVEL_TIERS.length; i++) expect(LEVEL_TIERS[i].from).toBeGreaterThan(LEVEL_TIERS[i - 1].from)
  })
})

describe('tierRange', () => {
  it('names the levels a tier covers', () => {
    expect(tierRange(levelTier(16))).toBe('Levels 15–19')
    expect(tierRange(levelTier(33))).toBe('Levels 30–49')
    expect(tierRange(levelTier(60))).toBe('Levels 50+')
  })
})
