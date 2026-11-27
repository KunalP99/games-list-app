import { describe, it, expect } from 'vitest'
import { recentGameIds, orderByIds, lastPlayedByGame, playingOrder, type SessionRow } from '../recently-played'
import type { Game } from '../types'

describe('lastPlayedByGame', () => {
  it('uses the end of each game\'s newest session', () => {
    const rows: SessionRow[] = [
      { game_id: 'lol', started_at: '2026-11-04T00:28:00Z', ended_at: '2026-11-04T01:14:00Z' },
      { game_id: 'ow', started_at: '2026-11-03T19:56:00Z', ended_at: '2026-11-03T23:16:00Z' },
      { game_id: 'lol', started_at: '2026-11-03T23:55:00Z', ended_at: '2026-11-04T00:24:00Z' },
    ]
    const map = lastPlayedByGame(rows)
    expect(map.get('lol')).toBe('2026-11-04T01:14:00Z')
    expect(map.get('ow')).toBe('2026-11-03T23:16:00Z')
  })

  it('falls back to the last checkpoint, then the start, for a session with no end', () => {
    const map = lastPlayedByGame([
      { game_id: 'a', started_at: '2026-11-04T10:00:00Z', ended_at: null, last_checkpoint_at: '2026-11-04T10:45:00Z' },
      { game_id: 'b', started_at: '2026-11-04T09:00:00Z', ended_at: null, last_checkpoint_at: null },
      { game_id: null, started_at: '2026-11-04T08:00:00Z' },
    ])
    expect(map.get('a')).toBe('2026-11-04T10:45:00Z')
    expect(map.get('b')).toBe('2026-11-04T09:00:00Z')
    expect(map.size).toBe(2)
  })
})

const session = (gameId: string | null, startedAt: string): SessionRow => ({
  game_id: gameId,
  started_at: startedAt,
})

const game = (id: string, title: string) => ({ id, title }) as Game

describe('recentGameIds', () => {
  it('keeps the newest session per game, in order', () => {
    // Rows arrive newest-first; the dedupe must not disturb that.
    const rows = [
      session('rocket', '2026-10-30T20:00:00Z'),
      session('minecraft', '2026-10-30T18:00:00Z'),
      session('rocket', '2026-10-29T20:00:00Z'),
      session('terraria', '2026-10-28T20:00:00Z'),
    ]
    expect(recentGameIds(rows, 3)).toEqual(['rocket', 'minecraft', 'terraria'])
  })

  it('does not let one game fill the whole list', () => {
    // An evening of the same game is many sessions but one entry — without
    // this, "last 3 games" would read "Rocket League, Rocket League, Rocket
    // League".
    const rows = [
      session('rocket', '2026-10-30T22:00:00Z'),
      session('rocket', '2026-10-30T21:00:00Z'),
      session('rocket', '2026-10-30T20:00:00Z'),
      session('minecraft', '2026-10-30T12:00:00Z'),
    ]
    expect(recentGameIds(rows, 3)).toEqual(['rocket', 'minecraft'])
  })

  it('stops at the limit', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((id, i) =>
      session(id, `2026-10-${30 - i}T12:00:00Z`))
    expect(recentGameIds(rows, 3)).toEqual(['a', 'b', 'c'])
  })

  it('skips sessions whose game has been deleted', () => {
    // game_id is ON DELETE SET NULL, so orphaned sessions are normal.
    const rows = [
      session(null, '2026-10-30T20:00:00Z'),
      session('rocket', '2026-10-30T18:00:00Z'),
    ]
    expect(recentGameIds(rows, 3)).toEqual(['rocket'])
  })

  it('returns nothing for no sessions', () => {
    expect(recentGameIds([], 3)).toEqual([])
  })
})

describe('orderByIds', () => {
  it('restores the session order the database lost', () => {
    // The games are fetched with `.in('id', ids)`, which returns them in
    // whatever order it likes — so the ordering has to be reapplied.
    const games = [game('terraria', 'Terraria'), game('rocket', 'Rocket League')]
    expect(orderByIds(games, ['rocket', 'terraria']).map(g => g.id))
      .toEqual(['rocket', 'terraria'])
  })

  it('drops ids with no matching game', () => {
    // A game moved out of Ambient between the two queries: it falls out, and
    // the next one down takes its place.
    const games = [game('rocket', 'Rocket League')]
    expect(orderByIds(games, ['rocket', 'moved-to-playing']).map(g => g.id))
      .toEqual(['rocket'])
  })
})

describe('playingOrder: the friends edition Playing section', () => {
  const g = (id: string, start_date: string | null, created_at = '2026-01-01T00:00:00Z') => ({ id, start_date, created_at })

  it('puts tracked games first, most recently played first, then the rest by start date', () => {
    const games = [g('untracked-old', '2026-01-01'), g('tracked-a', '2026-02-01'), g('untracked-new', '2026-03-01'), g('tracked-b', null)]
    const lastPlayed = new Map([['tracked-a', '2026-11-20T10:00:00Z'], ['tracked-b', '2026-11-26T10:00:00Z']])
    expect(playingOrder(games, lastPlayed).map(x => x.id)).toEqual(['tracked-b', 'tracked-a', 'untracked-new', 'untracked-old'])
  })

  it('marks untracked games with no last-played time, and breaks start-date ties by when added', () => {
    const out = playingOrder([g('a', null, '2026-01-01T00:00:00Z'), g('b', null, '2026-02-01T00:00:00Z')], new Map())
    expect(out.map(x => x.id)).toEqual(['b', 'a'])
    expect(out[0].lastPlayedAt).toBeNull()
  })
})
