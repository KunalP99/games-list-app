import { describe, it, expect } from 'vitest'
import { finishedBefore, type ReplayCandidate } from '../replays'

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
