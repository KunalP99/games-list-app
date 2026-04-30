import { describe, it, expect } from 'vitest'
import { calculateCompletionAwards } from '../tickets'

describe('calculateCompletionAwards', () => {
  describe('base award by hours', () => {
    it('awards 1 ticket for null hours (treated as 0)', () => {
      const awards = calculateCompletionAwards(null, null)
      const base = awards.find(a => a.reason === 'game_completed_short')
      expect(base?.amount).toBe(1)
    })

    it('awards 1 ticket for a short game (< 20 hours)', () => {
      const awards = calculateCompletionAwards(15, null)
      expect(awards).toContainEqual({ reason: 'game_completed_short', amount: 1 })
    })

    it('awards 1 ticket at exactly 0 hours', () => {
      const awards = calculateCompletionAwards(0, null)
      expect(awards).toContainEqual({ reason: 'game_completed_short', amount: 1 })
    })

    it('awards 2 tickets for a medium game (20–49 hours)', () => {
      const awards = calculateCompletionAwards(20, null)
      expect(awards).toContainEqual({ reason: 'game_completed_medium', amount: 2 })
    })

    it('awards 2 tickets at 49 hours (still medium)', () => {
      const awards = calculateCompletionAwards(49, null)
      expect(awards).toContainEqual({ reason: 'game_completed_medium', amount: 2 })
    })

    it('awards 3 tickets for a long game (50+ hours)', () => {
      const awards = calculateCompletionAwards(50, null)
      expect(awards).toContainEqual({ reason: 'game_completed_long', amount: 3 })
    })

    it('awards 3 tickets at exactly 100 hours (no bonus yet)', () => {
      const awards = calculateCompletionAwards(100, null)
      expect(awards).toContainEqual({ reason: 'game_completed_long', amount: 3 })
      expect(awards.find(a => a.reason === 'game_completed_bonus_hours')).toBeUndefined()
    })
  })

  describe('bonus hours beyond 100', () => {
    it('awards 1 bonus ticket at 120 hours (1 full 20h block beyond 100)', () => {
      const awards = calculateCompletionAwards(120, null)
      expect(awards).toContainEqual({ reason: 'game_completed_bonus_hours', amount: 1 })
    })

    it('awards 2 bonus tickets at 140 hours (2 full 20h blocks beyond 100)', () => {
      const awards = calculateCompletionAwards(140, null)
      expect(awards).toContainEqual({ reason: 'game_completed_bonus_hours', amount: 2 })
    })

    it('awards no bonus at 119 hours (not a full 20h block beyond 100)', () => {
      const awards = calculateCompletionAwards(119, null)
      expect(awards.find(a => a.reason === 'game_completed_bonus_hours')).toBeUndefined()
    })
  })

  describe('100% achievement bonus', () => {
    it('awards 3 extra tickets for 100% achievement progress', () => {
      const awards = calculateCompletionAwards(15, 100)
      expect(awards).toContainEqual({ reason: 'achievement_100_percent', amount: 3 })
    })

    it('does not award achievement bonus for 99%', () => {
      const awards = calculateCompletionAwards(15, 99)
      expect(awards.find(a => a.reason === 'achievement_100_percent')).toBeUndefined()
    })

    it('does not award achievement bonus when progress is null', () => {
      const awards = calculateCompletionAwards(15, null)
      expect(awards.find(a => a.reason === 'achievement_100_percent')).toBeUndefined()
    })
  })

  describe('combined awards', () => {
    it('stacks base + achievement bonus correctly', () => {
      const awards = calculateCompletionAwards(15, 100)
      const total = awards.reduce((sum, a) => sum + a.amount, 0)
      expect(total).toBe(4) // 1 (short) + 3 (achievements)
    })

    it('stacks long game + bonus hours + achievement bonus', () => {
      const awards = calculateCompletionAwards(120, 100)
      const total = awards.reduce((sum, a) => sum + a.amount, 0)
      expect(total).toBe(7) // 3 (long) + 1 (bonus hours) + 3 (achievements)
    })

    it('returns exactly one base award per completion', () => {
      const awards = calculateCompletionAwards(30, null)
      const baseAwards = awards.filter(a =>
        ['game_completed_short', 'game_completed_medium', 'game_completed_long'].includes(a.reason)
      )
      expect(baseAwards).toHaveLength(1)
    })
  })
})
