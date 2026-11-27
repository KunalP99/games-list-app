import { describe, it, expect } from 'vitest'
import { pickRow, resolveRow, sameGame, rowsWithIgdbIds, type LibraryRow, backlogCopy } from '../trackable-row'

const row = (id: string, status: string, extra: Partial<LibraryRow> = {}): LibraryRow =>
  ({ id, title: 'Mortal Kombat 1', status, igdb_id: 1, steam_appid: 1971870, ...extra })

describe('sameGame', () => {
  it('matches on a shared id, or the title', () => {
    expect(sameGame(row('a', 'completed'), row('b', 'ambient'))).toBe(true)
    expect(sameGame(row('a', 'completed'), row('b', 'ambient', { igdb_id: null, steam_appid: null, title: ' mortal kombat 1 ' }))).toBe(true)
    expect(sameGame(row('a', 'completed'), row('b', 'ambient', { igdb_id: 2, steam_appid: 2, title: 'Tekken 8' }))).toBe(false)
  })
})

describe('pickRow', () => {
  it('prefers Playing, then Ambient, then the most recent', () => {
    expect(pickRow([row('c', 'completed'), row('a', 'ambient'), row('p', 'playing')])?.id).toBe('p')
    expect(pickRow([row('c', 'completed'), row('a', 'ambient')])?.id).toBe('a')
    expect(pickRow([row('c2', 'completed'), row('c1', 'completed')])?.id).toBe('c2')
    expect(pickRow([])).toBeUndefined()
  })

  it('keeps recency order within a status', () => {
    expect(pickRow([row('a2', 'ambient'), row('a1', 'ambient')])?.id).toBe('a2')
  })
})

describe('resolveRow: story, multiplayer, replay', () => {
  const story = row('story', 'completed')
  const multiplayer = row('mp', 'ambient')

  it('sends multiplayer to the Ambient row while the story is Completed', () => {
    expect(resolveRow(story, [multiplayer, story]).id).toBe('mp')
  })

  it('sends hours to a Playing replay, even when the exe is linked to the Ambient row', () => {
    // A wheel-created replay may have no Steam id of its own.
    const replay = row('replay', 'playing', { steam_appid: null })
    expect(resolveRow(multiplayer, [replay, multiplayer, story]).id).toBe('replay')
  })

  it('falls back to the Ambient row once the replay is Completed', () => {
    const doneReplay = row('replay', 'completed')
    expect(resolveRow(doneReplay, [doneReplay, multiplayer, story]).id).toBe('mp')
  })

  it('leaves a Completed game with nothing trackable as it is (so the prompt can ask)', () => {
    expect(resolveRow(story, [story]).id).toBe('story')
  })

  it('never crosses into a different game', () => {
    const other = row('tekken', 'playing', { igdb_id: 2, steam_appid: 2, title: 'Tekken 8' })
    expect(resolveRow(multiplayer, [other, multiplayer]).id).toBe('mp')
  })
})

describe('rowsWithIgdbIds: another edition of the running game', () => {
  const edition = (id: string, igdb_id: number | null, status = 'playing'): LibraryRow => ({ id, title: id, status, igdb_id })
  // Kunal owns "GTA IV: Complete Edition" (27912); the running Steam app
  // resolves to "GTA IV" (731), whose edition family is [27912].
  it('finds the owned edition', () => {
    const library = [edition('other', 1), edition('gta4-ce', 27912), edition('none', null)]
    expect(rowsWithIgdbIds(library, [27912]).map(r => r.id)).toEqual(['gta4-ce'])
    expect(pickRow(rowsWithIgdbIds(library, [27912]))?.id).toBe('gta4-ce')
  })

  it('finds nothing when no edition is owned (or the lookup came back empty)', () => {
    expect(rowsWithIgdbIds([edition('other', 1)], [27912])).toEqual([])
    expect(rowsWithIgdbIds([edition('gta4-ce', 27912)], [])).toEqual([])
  })

  it('prefers a Playing row of the family, as pickRow always does', () => {
    const library = [edition('ce-done', 27912, 'completed'), edition('ce-replay', 27912, 'playing')]
    expect(pickRow(rowsWithIgdbIds(library, [27912]))?.id).toBe('ce-replay')
  })
})

describe('backlogCopy: the copy a running game starts from', () => {
  const row = (id: string, status: string, igdb_id: number | null = 9608, title = 'Mount & Blade II: Bannerlord') => ({ id, status, igdb_id, title })
  // Ramin's case: the 2021 run Completed, a Backlog copy added to replay it.
  const done = row('done', 'completed')
  const backlog = row('backlog', 'backlog')

  it('finds the Backlog copy beside a Completed one, whichever was touched last', () => {
    expect(backlogCopy(done, [done, backlog])).toBe(backlog)
    expect(backlogCopy(done, [backlog, done])).toBe(backlog)
  })

  it('is the row itself when that is the Backlog copy', () => {
    expect(backlogCopy(backlog, [backlog, done])).toBe(backlog)
  })

  it('takes the most recently touched of two Backlog copies', () => {
    const older = row('older', 'backlog')
    expect(backlogCopy(done, [backlog, done, older])).toBe(backlog)
  })

  it('finds nothing when a copy is already trackable, or no copy is in the Backlog', () => {
    expect(backlogCopy(row('p', 'playing'), [row('p', 'playing'), backlog])).toBeUndefined()
    expect(backlogCopy(done, [done, row('dnf', 'dnf')])).toBeUndefined()
  })

  it("never takes a different game's Backlog copy", () => {
    const other = row('other', 'backlog', 1234, 'Another Game')
    expect(backlogCopy(done, [done, other])).toBeUndefined()
  })
})

describe('pickRow between a Main Game and another Playing copy', () => {
  const mp = { id: 'mp', title: 'Halo', status: 'playing', assigned_by: null, tracks_hours: false }
  const campaign = { id: 'camp', title: 'Halo', status: 'playing', assigned_by: 'me', tracks_hours: false }

  it('gives the hours to the Main Game (the wheel copy), whichever was touched last', () => {
    expect(pickRow([mp, campaign])!.id).toBe('camp')
  })

  it('unless its owner chose the other copy', () => {
    expect(pickRow([campaign, { ...mp, tracks_hours: true }])!.id).toBe('mp')
  })

  it('goes back to the other copy once the Main Game is finished', () => {
    expect(pickRow([{ ...campaign, status: 'completed' }, mp])!.id).toBe('mp')
  })
})
