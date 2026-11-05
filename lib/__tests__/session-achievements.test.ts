import { describe, it, expect } from 'vitest'
import {
  gameKey, hasSquadUp, longestStreak, minutesByDay, sessionAchievementStats,
  type AchievementSession, type KeyedSession,
} from '../session-achievements'

const s = (start: string, end: string | null, minutes: number, game = 'g1'): AchievementSession =>
  ({ game_id: game, started_at: start, ended_at: end, last_checkpoint_at: end, minutes })

describe('gameKey', () => {
  it('prefers the provider id, falling back to the title', () => {
    expect(gameKey({ title: 'Overwatch', igdb_id: 1 })).toBe('igdb:1')
    expect(gameKey({ title: 'Overwatch', igdb_id: null, rawg_id: 5 })).toBe('rawg:5')
    expect(gameKey({ title: ' Overwatch ', igdb_id: null, rawg_id: null })).toBe('title:overwatch')
  })
})

describe('session count', () => {
  it('counts sessions of a minute or more on a real game', () => {
    const stats = sessionAchievementStats([
      s('2025-11-01T10:00:00Z', '2025-11-01T11:00:00Z', 60),
      s('2025-11-02T10:00:00Z', '2025-11-02T10:00:20Z', 0),
      { ...s('2025-11-03T10:00:00Z', '2025-11-03T11:00:00Z', 60), game_id: null },
    ])
    expect(stats.sessionCount).toBe(1)
  })
})

describe('longestStreak', () => {
  it('finds the longest run of consecutive days', () => {
    expect(longestStreak(['2025-11-01', '2025-11-02', '2025-11-03', '2025-11-05', '2025-11-06'])).toBe(3)
    expect(longestStreak([])).toBe(0)
  })

  it('runs across month ends and the clocks going back', () => {
    expect(longestStreak(['2025-10-25', '2025-10-26', '2025-10-27', '2025-10-31', '2025-11-01'])).toBe(3)
  })

  it('ignores repeats of the same day', () => {
    expect(longestStreak(['2025-11-01', '2025-11-01', '2025-11-02'])).toBe(2)
  })

  it('uses UK days for the streak', () => {
    // 23:30 UTC on 30 June is 1 July in the UK — so these are two days in a row.
    const stats = sessionAchievementStats([
      s('2025-06-30T10:00:00Z', '2025-06-30T11:00:00Z', 60),
      s('2025-06-30T23:30:00Z', '2025-06-30T23:50:00Z', 20),
    ])
    expect(stats.longestDayStreak).toBe(2)
  })
})

describe('minutesByDay', () => {
  it('splits a session across UK midnight', () => {
    const days = minutesByDay([s('2025-11-05T23:00:00Z', '2025-11-06T01:00:00Z', 120)])
    expect(days.get('2025-11-05')).toBe(60)
    expect(days.get('2025-11-06')).toBe(60)
  })

  it('never counts more than the tracked minutes', () => {
    // Open for 2 hours by its timestamps, but only 60 minutes tracked.
    const days = minutesByDay([s('2025-11-05T10:00:00Z', '2025-11-05T12:00:00Z', 60)])
    expect(days.get('2025-11-05')).toBe(60)
  })
})

describe('weekend and single-day totals', () => {
  it('adds a Saturday and its Sunday together', () => {
    const stats = sessionAchievementStats([
      s('2025-11-08T10:00:00Z', '2025-11-08T13:00:00Z', 180), // Sat
      s('2025-11-09T10:00:00Z', '2025-11-09T13:00:00Z', 180), // Sun
      s('2025-11-10T10:00:00Z', '2025-11-10T14:00:00Z', 240), // Mon — not the weekend
    ])
    expect(stats.bestWeekendMinutes).toBe(360)
    expect(stats.bestDayMinutes).toBe(240)
  })

  it('does not join a Sunday to the following Saturday', () => {
    const stats = sessionAchievementStats([
      s('2025-11-09T10:00:00Z', '2025-11-09T13:00:00Z', 180), // Sun 9th
      s('2025-11-15T10:00:00Z', '2025-11-15T13:00:00Z', 180), // Sat 15th
    ])
    expect(stats.bestWeekendMinutes).toBe(180)
  })
})

describe('games', () => {
  it('counts games in a day, distinct games, and minutes on one game', () => {
    const stats = sessionAchievementStats([
      s('2025-11-05T10:00:00Z', '2025-11-05T11:00:00Z', 60, 'a'),
      s('2025-11-05T12:00:00Z', '2025-11-05T13:00:00Z', 60, 'b'),
      s('2025-11-05T14:00:00Z', '2025-11-05T15:00:00Z', 60, 'c'),
      s('2025-11-06T14:00:00Z', '2025-11-06T16:00:00Z', 120, 'a'),
    ])
    expect(stats.mostGamesInADay).toBe(3)
    expect(stats.distinctGames).toBe(3)
    expect(stats.mostMinutesOnOneGame).toBe(180)
  })
})

describe('hasSquadUp', () => {
  const keys = new Map([['mine', 'igdb:1']])
  const other = (start: string, end: string, key = 'igdb:1'): KeyedSession =>
    ({ ...s(start, end, 60, 'theirs'), gameKey: key })
  const mine = [s('2025-11-05T20:00:00Z', '2025-11-05T21:00:00Z', 60, 'mine')]

  it('needs the same game at the same time for at least 10 minutes', () => {
    expect(hasSquadUp(mine, keys, [other('2025-11-05T20:45:00Z', '2025-11-05T22:00:00Z')])).toBe(true)
    expect(hasSquadUp(mine, keys, [other('2025-11-05T20:55:00Z', '2025-11-05T22:00:00Z')])).toBe(false)
  })

  it('does not count a different game, or a different time', () => {
    expect(hasSquadUp(mine, keys, [other('2025-11-05T20:00:00Z', '2025-11-05T21:00:00Z', 'igdb:2')])).toBe(false)
    expect(hasSquadUp(mine, keys, [other('2025-11-06T20:00:00Z', '2025-11-06T21:00:00Z')])).toBe(false)
  })

  it('uses the last checkpoint for a session that never ended', () => {
    const open: KeyedSession = { ...other('2025-11-05T19:00:00Z', '2025-11-05T20:30:00Z'), ended_at: null }
    expect(hasSquadUp(mine, keys, [open])).toBe(true)
  })
})
