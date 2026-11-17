import { describe, it, expect } from 'vitest'
import { pickRow, resolveRow, sameGame, type LibraryRow } from '../trackable-row'

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
