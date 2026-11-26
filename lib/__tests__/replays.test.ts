import { describe, it, expect } from 'vitest'
import { finishedBefore, playthroughOrder, type ReplayCandidate } from '../replays'

const copy = (id: string, status: string, completion_date: string | null, title = 'Mount & Blade II: Bannerlord', igdb_id: number | null = 9608): ReplayCandidate =>
  ({ id, title, status, igdb_id, completion_date })

describe('finishedBefore: a second finish is a replay', () => {
  it("tags Ramin's later run: finished in 2021, finished again now", () => {
    const first = copy('first', 'completed', '2021-01-01')
    const now = copy('now', 'completed', '2026-12-01')
    expect(finishedBefore(now, [first, now])).toBe(true)
  })

  it('does not tag the earlier finish when a later one is recorded first', () => {
    const later = copy('later', 'completed', '2025-09-15')
    const earlier = copy('earlier', 'completed', '2020-06-14')
    expect(finishedBefore(earlier, [later, earlier])).toBe(false)
    expect(finishedBefore(later, [later, earlier])).toBe(true)
  })

  it('counts a finish with no date, or a finish on the same day, as before', () => {
    expect(finishedBefore(copy('now', 'completed', '2026-12-01'), [copy('undated', 'completed', null)])).toBe(true)
    expect(finishedBefore(copy('now', 'completed', null), [copy('dated', 'completed', '2021-01-01')])).toBe(true)
    expect(finishedBefore(copy('a', 'completed', '2026-12-01'), [copy('b', 'completed', '2026-12-01')])).toBe(true)
  })

  it('needs another Completed copy of the same game', () => {
    const now = copy('now', 'completed', '2026-12-01')
    expect(finishedBefore(now, [now])).toBe(false)
    expect(finishedBefore(now, [now, copy('b', 'backlog', null), copy('a', 'ambient', null), copy('d', 'dnf', '2020-01-01')])).toBe(false)
    expect(finishedBefore(now, [now, copy('other', 'completed', '2020-01-01', 'Another Game', 1234)])).toBe(false)
  })

  it('matches the same game by title when there is no shared id', () => {
    const now = copy('now', 'completed', '2026-12-01', 'Bannerlord', null)
    expect(finishedBefore(now, [now, copy('old', 'completed', '2021-01-01', 'bannerlord', null)])).toBe(true)
  })
})

describe('playthroughOrder: numbered by when they were played', () => {
  const c = (id: string, status: string, completion_date: string | null, created_at: string, start_date: string | null = null) =>
    ({ id, status, completion_date, start_date, created_at })

  it('puts the older finish first even when the newer run was added first (the import)', () => {
    const replay = c('replay', 'completed', '2025-09-15', '2026-05-03T23:17:42Z')
    const original = c('original', 'completed', '2020-06-14', '2026-05-03T23:17:51Z')
    expect(playthroughOrder([replay, original]).map(x => x.id)).toEqual(['original', 'replay'])
  })

  it("keeps a run still being played after the finished ones (Ramin's Bannerlord: 2 of 2)", () => {
    const done = c('done', 'completed', '2021-01-01', '2026-05-03T23:42:01Z')
    const now = c('now', 'ambient', null, '2026-05-03T23:42:15Z', '2026-11-21')
    expect(playthroughOrder([now, done]).map(x => x.id)).toEqual(['done', 'now'])
  })

  it('orders the rest by start, then by when added (a never-started Backlog copy last)', () => {
    const backlog = c('backlog', 'backlog', null, '2026-01-01T00:00:00Z')
    const playing = c('playing', 'playing', null, '2026-02-01T00:00:00Z', '2026-02-01')
    const undated = c('undated', 'completed', null, '2025-01-01T00:00:00Z')
    const dropped = c('dropped', 'dnf', '2019-05-01', '2026-03-01T00:00:00Z')
    expect(playthroughOrder([backlog, playing, undated, dropped]).map(x => x.id)).toEqual(['dropped', 'playing', 'undated', 'backlog'])
  })

  it('falls back to when added when nothing else tells them apart', () => {
    const a = c('a', 'backlog', null, '2026-01-01T00:00:00Z')
    const b = c('b', 'backlog', null, '2026-01-02T00:00:00Z')
    expect(playthroughOrder([b, a]).map(x => x.id)).toEqual(['a', 'b'])
  })
})
