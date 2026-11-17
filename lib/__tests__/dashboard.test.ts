import { describe, it, expect } from 'vitest'
import { streakStatus, pickHero, comingUp, countdownLabel, playSummary, ticketsEarnedThisWeek, formatPlayMinutes } from '../dashboard'

// Midday UK time on Tue 17 Nov 2026 (GMT, so UTC = UK).
const NOW = new Date('2026-11-17T12:00:00Z')

describe('streakStatus', () => {
  it('counts the run ending today as active', () => {
    expect(streakStatus(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-10'], NOW))
      .toEqual({ days: 3, state: 'active', since: '2026-11-15' })
  })

  it('keeps a run ending yesterday alive, but at risk', () => {
    expect(streakStatus(['2026-11-15', '2026-11-16'], NOW))
      .toEqual({ days: 2, state: 'at_risk', since: '2026-11-15' })
  })

  it('shows nothing once a whole day has passed without playing', () => {
    expect(streakStatus(['2026-11-14', '2026-11-15'], NOW)).toBeNull()
    expect(streakStatus([], NOW)).toBeNull()
  })

  it('ignores repeat days and order', () => {
    expect(streakStatus(['2026-11-17', '2026-11-16', '2026-11-17'], NOW)?.days).toBe(2)
  })

  it('uses the UK day, not UTC, near midnight', () => {
    // 23:30 UTC on 17 Jul is 00:30 UK on 18 Jul (BST).
    const lateBst = new Date('2026-07-17T23:30:00Z')
    expect(streakStatus(['2026-07-18'], lateBst)?.state).toBe('active')
  })
})

describe('pickHero', () => {
  const g = (id: string) => ({ id })

  it('puts a running game first, Playing or Ambient', () => {
    const hero = pickHero({
      playing: [g('a')],
      ambient: [g('x')],
      live: new Map([['x', '2026-11-17T11:00:00Z']]),
      lastPlayed: new Map([['a', '2026-11-17T10:00:00Z'], ['x', '2026-11-17T11:50:00Z']]),
    })
    expect(hero).toEqual({ kind: 'ambient', game: { id: 'x' }, liveSince: '2026-11-17T11:00:00Z', lastPlayedAt: '2026-11-17T11:50:00Z' })
  })

  it('otherwise the most recently played, whatever its status', () => {
    const hero = pickHero({
      playing: [g('a'), g('b')],
      ambient: [g('x')],
      live: new Map(),
      lastPlayed: new Map([['a', '2026-11-10T10:00:00Z'], ['b', '2026-11-15T10:00:00Z'], ['x', '2026-11-16T10:00:00Z']]),
    })
    expect(hero).toMatchObject({ kind: 'ambient', game: { id: 'x' }, liveSince: null })
  })

  it('shows a Playing game played more recently than any Ambient one', () => {
    const hero = pickHero({
      playing: [g('a')],
      ambient: [g('x')],
      live: new Map(),
      lastPlayed: new Map([['a', '2026-11-17T10:00:00Z'], ['x', '2026-11-16T10:00:00Z']]),
    })
    expect(hero).toMatchObject({ kind: 'playing', game: { id: 'a' } })
  })

  it('falls back to Playing before Ambient, in input order, when nothing was tracked', () => {
    const none = { live: new Map<string, string>(), lastPlayed: new Map<string, string>() }
    expect(pickHero({ playing: [g('a'), g('b')], ambient: [g('x')], ...none })?.game.id).toBe('a')
    expect(pickHero({ playing: [], ambient: [g('x'), g('y')], ...none })?.game.id).toBe('x')
  })

  it('puts a tracked game ahead of one never tracked', () => {
    const hero = pickHero({
      playing: [g('a')],
      ambient: [g('x')],
      live: new Map(),
      lastPlayed: new Map([['x', '2026-10-01T10:00:00Z']]),
    })
    expect(hero?.game.id).toBe('x')
  })

  it('is null with nothing to show', () => {
    expect(pickHero({ playing: [], ambient: [], live: new Map(), lastPlayed: new Map() })).toBeNull()
  })
})

describe('comingUp', () => {
  const at = (iso: string) => Date.parse(iso) / 1000

  it('merges releases and events by date, from today onwards', () => {
    const items = comingUp(
      [
        { id: 'gta', title: 'Grand Theft Auto VI', release_date: '2026-11-19' },
        { id: 'old', title: 'Out already', release_date: '2026-11-01' },
        { id: 'today', title: 'Out today', release_date: '2026-11-17' },
      ],
      [
        { id: 1, name: 'INDIE Live Expo', startTime: at('2026-12-01T10:00:00Z') },
        { id: 2, name: 'Last week', startTime: at('2026-11-10T10:00:00Z') },
      ],
      NOW,
    )
    expect(items.map(i => i.title)).toEqual(['Out today', 'Grand Theft Auto VI', 'INDIE Live Expo'])
  })

  it('leaves out year-only release dates and caps the list', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, title: `Game ${i}`, release_date: `2026-12-0${i + 1}` }))
    const items = comingUp([{ id: 'y', title: 'Some year', release_date: '2027-01-01', release_date_precision: 'year' }, ...many], [], NOW)
    expect(items).toHaveLength(4)
    expect(items.some(i => i.title === 'Some year')).toBe(false)
  })
})

describe('countdownLabel', () => {
  it('reads naturally', () => {
    expect(countdownLabel('2026-11-17', NOW)).toBe('today')
    expect(countdownLabel('2026-11-18', NOW)).toBe('tomorrow')
    expect(countdownLabel('2026-11-19', NOW)).toBe('in 2 days')
  })
})

describe('playSummary', () => {
  it('week: buckets minutes into the last 7 UK days, today last', () => {
    const week = playSummary([
      { game_id: 'wow', started_at: '2026-11-17T09:00:00Z', minutes: 102 },
      { game_id: 'wow', started_at: '2026-11-16T10:00:00Z', minutes: 600 },
      { game_id: 'tunic', started_at: '2026-11-16T20:00:00Z', minutes: 120 },
      { game_id: 'old', started_at: '2026-11-10T20:00:00Z', minutes: 999 }, // 8 days ago: outside
    ], 'week', NOW)
    expect(week.bars.map(b => b.start)).toEqual([
      '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17',
    ])
    expect(week.bars.every(b => b.start === b.end)).toBe(true)
    expect(week.bars.map(b => b.minutes)).toEqual([0, 0, 0, 0, 0, 720, 102])
    expect(week.totalMinutes).toBe(822)
    expect(week.daysPlayed).toBe(2)
    expect(week.dayCount).toBe(7)
    expect(week.topGameId).toBe('wow')
  })

  it('month: one bar per day for the last 30 days', () => {
    const month = playSummary([
      { game_id: 'a', started_at: '2026-10-19T09:00:00Z', minutes: 30 }, // first day of the 30
      { game_id: 'a', started_at: '2026-10-18T09:00:00Z', minutes: 30 }, // one too early
    ], 'month', NOW)
    expect(month.bars).toHaveLength(30)
    expect(month.bars[0]).toEqual({ start: '2026-10-19', end: '2026-10-19', minutes: 30 })
    expect(month.bars[29].start).toBe('2026-11-17')
    expect(month.totalMinutes).toBe(30)
  })

  it('year: a bar per calendar month, this one so far plus the 11 before it', () => {
    const year = playSummary([
      { game_id: 'a', started_at: '2026-11-17T09:00:00Z', minutes: 60 }, // this month
      { game_id: 'a', started_at: '2026-11-01T09:00:00Z', minutes: 60 }, // this month
      { game_id: 'b', started_at: '2026-10-31T09:00:00Z', minutes: 45 }, // last month
      { game_id: 'c', started_at: '2025-12-01T09:00:00Z', minutes: 10 }, // first day of the 12 months
      { game_id: 'c', started_at: '2025-11-30T09:00:00Z', minutes: 10 }, // a day too early
    ], 'year', NOW)
    expect(year.bars).toHaveLength(12)
    expect(year.bars[0]).toEqual({ start: '2025-12-01', end: '2025-12-31', minutes: 10 })
    expect(year.bars[1]).toEqual({ start: '2026-01-01', end: '2026-01-31', minutes: 0 })
    expect(year.bars[2].end).toBe('2026-02-28')
    expect(year.bars[10]).toEqual({ start: '2026-10-01', end: '2026-10-31', minutes: 45 })
    expect(year.bars[11]).toEqual({ start: '2026-11-01', end: '2026-11-17', minutes: 120 })
    expect(year.totalMinutes).toBe(175)
    expect(year.daysPlayed).toBe(4)
    expect(year.dayCount).toBe(352) // 1 Dec 2025 – 17 Nov 2026
  })

  it('year: starts in the right month across a year boundary', () => {
    const year = playSummary([], 'year', new Date('2026-01-10T12:00:00Z'))
    expect(year.bars[0].start).toBe('2025-02-01')
    expect(year.bars[11].start).toBe('2026-01-01')
  })

  it('ignores empty and missing minutes, and is empty with no play', () => {
    const week = playSummary([{ game_id: 'a', started_at: '2026-11-17T09:00:00Z', minutes: null }], 'week', NOW)
    expect(week.totalMinutes).toBe(0)
    expect(week.daysPlayed).toBe(0)
    expect(week.topGameId).toBeNull()
  })

  it('breaks a tie for most played towards the most recent session', () => {
    const week = playSummary([
      { game_id: 'new', started_at: '2026-11-17T09:00:00Z', minutes: 60 },
      { game_id: 'old', started_at: '2026-11-15T09:00:00Z', minutes: 60 },
    ], 'week', NOW)
    expect(week.topGameId).toBe('new')
  })
})

describe('formatPlayMinutes', () => {
  it('uses minutes under an hour, tenths of an hour above, whole hours from 100h', () => {
    expect(formatPlayMinutes(0)).toBe('')
    expect(formatPlayMinutes(45)).toBe('45m')
    expect(formatPlayMinutes(102)).toBe('1.7h')
    expect(formatPlayMinutes(720)).toBe('12h')
    expect(formatPlayMinutes(14_430)).toBe('241h')
  })
})

describe('ticketsEarnedThisWeek', () => {
  it('sums gains over the last 7 UK days, today included', () => {
    expect(ticketsEarnedThisWeek([
      { amount: 3, created_at: '2026-11-17T09:00:00Z' }, // today
      { amount: 1, created_at: '2026-11-11T00:30:00Z' }, // first day of the 7
      { amount: 5, created_at: '2026-11-10T23:30:00Z' }, // the day before: out
      { amount: -9, created_at: '2026-11-16T09:00:00Z' }, // a spend: ignored
    ], NOW)).toBe(4)
    expect(ticketsEarnedThisWeek([], NOW)).toBe(0)
  })
})
