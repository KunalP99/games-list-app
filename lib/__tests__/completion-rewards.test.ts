import { describe, it, expect } from 'vitest'
import { completionReward, rewardTickets, rewardExplanation, UNTRACKED_DAILY_LIMIT, type CompletionInput } from '../completion-rewards'
import { calculateCompletionAwards } from '../tickets'
import { gameCompletionXp } from '../achievements'

const base: CompletionInput = {
  verified: true,
  typedHours: null,
  achievementProgress: null,
  isSequel: false,
  trackedHours: 0,
  providerLinked: true,
  completionDate: '2026-11-19',
  joinedDay: '2026-11-01',
  untrackedRewardsToday: 0,
}

describe('completionReward — friends edition', () => {
  const friends = { ...base, verified: false }

  it('is exactly the old rules: typed hours, 100% bonus, sequel bonus', () => {
    const r = completionReward({ ...friends, typedHours: 140, achievementProgress: 100, isSequel: true })
    expect(r.tickets).toEqual([
      ...calculateCompletionAwards(140, 100),
      { reason: 'sequel_back_to_back', amount: 1 },
    ])
    expect(r.xp).toBe(gameCompletionXp(140, 100))
    expect(r.why).toBe('full')
    expect(r.untracked).toBe(false)
  })

  it('ignores every public-edition check', () => {
    const r = completionReward({ ...friends, typedHours: 30, providerLinked: false, completionDate: null, joinedDay: '2099-01-01', untrackedRewardsToday: 99 })
    expect(rewardTickets(r)).toBe(2)
  })
})

describe('completionReward — public edition (verified)', () => {
  it('typed hours earn nothing extra: an untracked completion is +1 and base XP', () => {
    const r = completionReward({ ...base, typedHours: 99_999, achievementProgress: 100, isSequel: true })
    expect(r.tickets).toEqual([{ reason: 'game_completed_short', amount: 1 }])
    expect(r.xp).toBe(50)
    expect(r.untracked).toBe(true)
    expect(r.why).toBe('untracked')
  })

  it('tracked hours set the tier and the 100h+ bonus, with no 100% or sequel bonus', () => {
    const r = completionReward({ ...base, trackedHours: 140, typedHours: 5, achievementProgress: 100, isSequel: true })
    expect(r.tickets).toEqual(calculateCompletionAwards(140, null))
    expect(rewardTickets(r)).toBe(3 + 2)
    expect(r.xp).toBe(gameCompletionXp(140, null))
    expect(r.untracked).toBe(false)
    expect(r.why).toBe('tracked')
  })

  it('a tracked completion is not limited per day', () => {
    const r = completionReward({ ...base, trackedHours: 25, untrackedRewardsToday: UNTRACKED_DAILY_LIMIT + 3 })
    expect(rewardTickets(r)).toBe(2)
  })

  it('untracked rewards stop at the daily limit', () => {
    expect(rewardTickets(completionReward({ ...base, untrackedRewardsToday: UNTRACKED_DAILY_LIMIT - 1 }))).toBe(1)
    const capped = completionReward({ ...base, untrackedRewardsToday: UNTRACKED_DAILY_LIMIT })
    expect(capped).toEqual({ tickets: [], xp: 0, untracked: false, why: 'daily_limit' })
  })

  it('games not picked from search earn nothing', () => {
    expect(completionReward({ ...base, providerLinked: false, trackedHours: 50 })).toMatchObject({ tickets: [], xp: 0, why: 'not_linked' })
  })

  it('completions before joining earn nothing, on or after joining day earn', () => {
    expect(completionReward({ ...base, completionDate: '2026-10-31' })).toMatchObject({ tickets: [], xp: 0, why: 'before_joining' })
    expect(rewardTickets(completionReward({ ...base, completionDate: '2026-11-01' }))).toBe(1)
    // A year-precision date is stored as 1 January, so it counts as before joining that year.
    expect(completionReward({ ...base, completionDate: '2026-01-01' }).why).toBe('before_joining')
  })

  it('an undated completion earns nothing', () => {
    expect(completionReward({ ...base, completionDate: null }).why).toBe('no_date')
  })

  it('a sliver of tracked time below 0.1h counts as untracked', () => {
    expect(completionReward({ ...base, trackedHours: 0.05 }).why).toBe('untracked')
  })
})

describe('rewardExplanation', () => {
  it('says nothing for the friends edition', () => {
    expect(rewardExplanation('full', 3, 175)).toBeNull()
  })

  it('explains every public-edition outcome', () => {
    expect(rewardExplanation('untracked', 1, 50)).toContain('Earned 1 ticket and 50 XP')
    expect(rewardExplanation('tracked', 2, 100)).toContain('Earned 2 tickets and 100 XP')
    for (const why of ['not_linked', 'no_date', 'before_joining', 'daily_limit'] as const) {
      expect(rewardExplanation(why, 0, 0)).toMatch(/^No tickets/)
    }
  })
})
