import { describe, it, expect } from 'vitest'
import {
  formatDayRange, formatHoursRough, formatMinutes, formatSessionWhen, scoreRounds, splitShare, streaks, textOn,
  ticketBreakdown, trackedHighlights, type SessionRow,
} from '../stats-wrapped'

describe('ticketBreakdown', () => {
  it('splits earned and lost tickets by reason', () => {
    const out = ticketBreakdown([
      { amount: 2, reason: 'game_completed_medium' },
      { amount: 3, reason: 'game_completed_long' },
      { amount: 3, reason: 'achievement_100_percent' },
      { amount: 2, reason: 'turn_skipped' },
      { amount: 1, reason: 'sequel_back_to_back' },
      { amount: -3, reason: 'spin' },
      { amount: -6, reason: 'spin_reroll' },
      { amount: -9, reason: 'choose_game' },
      { amount: -5, reason: 'assigned_game_incomplete' },
    ])
    expect(out.earned).toBe(11)
    expect(out.lost).toBe(23)
    expect(out.earnedParts).toEqual([
      { key: 'completions', label: 'Completions', amount: 5 },
      { key: 'perfect', label: '100% bonuses', amount: 3 },
      { key: 'skips', label: 'Skipped turns', amount: 2 },
      { key: 'other', label: 'Other', amount: 1 },
    ])
    expect(out.lostParts.map(p => [p.key, p.amount])).toEqual([['spin', 3], ['reroll', 6], ['choose', 9], ['penalty', 5]])
  })

  it('handles no tickets at all', () => {
    expect(ticketBreakdown([])).toEqual({ earned: 0, lost: 0, earnedParts: [], lostParts: [] })
  })
})

describe('streaks', () => {
  const now = new Date('2026-11-17T12:00:00Z')

  it('finds the longest run and its dates', () => {
    const s = streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10'], now)
    expect(s).toEqual({ days: 3, from: '2026-10-01', to: '2026-10-03', current: 0 })
  })

  it('counts a current streak that reaches today or yesterday', () => {
    expect(streaks(['2026-11-15', '2026-11-16', '2026-11-17'], now)?.current).toBe(3)
    expect(streaks(['2026-11-15', '2026-11-16'], now)?.current).toBe(2)
    expect(streaks(['2026-11-14', '2026-11-15'], now)?.current).toBe(0)
  })

  it('returns nothing without any days', () => {
    expect(streaks([], now)).toBeNull()
  })
})

describe('trackedHighlights', () => {
  const titles = new Map([['ow', 'Overwatch'], ['ow2', 'Overwatch'], ['dbd', 'Dead by Daylight'], ['bg3', "Baldur's Gate 3"]])
  const s = (game: string | null, start: string, minutes: number, end: string | null = start): SessionRow =>
    ({ game_id: game, started_at: start, ended_at: end, last_checkpoint_at: end, minutes })

  it('finds the most played game (replays together), runner-up, longest session and streak', () => {
    const out = trackedHighlights([
      s('ow', '2026-11-01T19:00:00Z', 120),
      s('ow2', '2026-11-02T19:00:00Z', 60),
      s('dbd', '2026-11-03T19:00:00Z', 90),
      s('bg3', '2026-11-05T18:40:00Z', 402, '2026-11-06T01:22:00Z'),
      s('bg3', '2026-11-07T18:40:00Z', 0),
      s(null, '2026-11-08T18:40:00Z', 500),
    ], titles, new Date('2026-11-20T12:00:00Z'))
    expect(out.totalMinutes).toBe(672)
    expect(out.mostPlayed).toEqual({ title: "Baldur's Gate 3", minutes: 402, share: 402 / 672 })
    expect(out.runnerUp).toEqual({ title: 'Overwatch', minutes: 180 })
    expect(out.longestSession).toMatchObject({ title: "Baldur's Gate 3", minutes: 402, end: '2026-11-06T01:22:00Z' })
    expect(out.streak).toMatchObject({ days: 3, from: '2026-11-01', to: '2026-11-03', current: 0 })
  })

  it('is empty for someone without the tracker', () => {
    expect(trackedHighlights([], titles)).toEqual({ totalMinutes: 0, mostPlayed: null, runnerUp: null, longestSession: null, streak: null })
  })
})

describe('scoreRounds', () => {
  it('scores each round, lower-wins included, skipping missing data', () => {
    const out = scoreRounds([
      { key: 'hours', you: 1204, friend: 1610 },
      { key: 'games', you: 48, friend: 37 },
      { key: 'dnf', you: 9, friend: 15, higherWins: false },
      { key: 'streak', you: 14, friend: null },
      { key: 'xp', you: 10, friend: 10 },
    ])
    expect(out.rounds.map(r => r.winner)).toEqual(['friend', 'you', 'you', null, 'tie'])
    expect(out.rounds[0].diff).toBe(406)
    expect([out.you, out.friend]).toEqual([2, 1])
  })
})

describe('splitShare', () => {
  it('sizes your half by result, clamped', () => {
    expect(splitShare(50, 50)).toBe(0.5)
    expect(splitShare(1204, 1610)).toBeCloseTo(0.428, 2)
    expect(splitShare(100, 1)).toBe(0.65)
    expect(splitShare(1, 100)).toBe(0.35)
    expect(splitShare(160, 205, false)).toBeCloseTo(0.562, 2)
    expect(splitShare(0, 0)).toBe(0.5)
  })
})

describe('formatting', () => {
  it('formats minutes', () => {
    expect([formatMinutes(45), formatMinutes(402), formatMinutes(540)]).toEqual(['45m', '6h 42m', '9h'])
  })

  it('rounds longer totals to whole hours but keeps minutes under an hour', () => {
    expect([formatHoursRough(0), formatHoursRough(45), formatHoursRough(60), formatHoursRough(12735)]).toEqual(['0m', '45m', '1h', '212h'])
  })

  it('formats a day range and a session on UK time', () => {
    expect(formatDayRange('2026-10-12', '2026-10-25')).toBe('12 Oct – 25 Oct 2026')
    expect(formatDayRange('2026-10-12', '2026-10-12')).toBe('12 Oct 2026')
    // 18:40 UTC in September is 19:40 BST. (en-GB writes September "Sept".)
    expect(formatSessionWhen('2026-09-12T18:40:00Z', '2026-09-13T01:22:00Z')).toBe('Sat 12 Sept · 19:40 – 02:22')
  })

  it('picks readable text for a background', () => {
    expect(textOn('#FFFFFF')).toBe('#1A0A05')
    expect(textOn('#FACC15')).toBe('#1A0A05')
    expect(textOn('#1D4ED8')).toBe('#FFFFFF')
    expect(textOn('not a colour')).toBe('#FFFFFF')
  })
})
