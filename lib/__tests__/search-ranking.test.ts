import { describe, it, expect } from 'vitest'
import { rankSearchResults, mergeById, apicalypseString, isFullGame, popularity, type RankCandidate } from '../search-ranking'

type G = RankCandidate & { id: number }
const names = (gs: G[]) => gs.map(g => g.name)

// IGDB game_type ids used below: 0 main game, 1 DLC, 2 expansion, 3 bundle, 8 remake.
describe('rankSearchResults', () => {
  it('puts a popular main game above DLC and bundles that IGDB ranked higher', () => {
    // The add-game form's real complaint: "Cyber" showing add-ons first.
    const pool: G[] = [
      { id: 1, name: 'Cyberpunk 2077: Phantom Liberty', game_type: 2, total_rating_count: 400 },
      { id: 2, name: 'Cyberpunk 2077: Ultimate Edition', game_type: 0, version_parent: 99, total_rating_count: 50 },
      { id: 3, name: 'Cyber Shadow', game_type: 0, total_rating_count: 120 },
      { id: 4, name: 'Cyberpunk 2077', game_type: 0, total_rating_count: 5000 },
    ]
    expect(names(rankSearchResults('Cyber', pool))).toEqual([
      'Cyberpunk 2077',
      'Cyber Shadow',
      'Cyberpunk 2077: Phantom Liberty',
      'Cyberpunk 2077: Ultimate Edition',
    ])
  })

  it('puts an exact title first, even when its expansions are more rated', () => {
    // The World of Warcraft case: the base game buried under its expansions.
    const pool: G[] = [
      { id: 1, name: 'World of Warcraft: Dragonflight', game_type: 2, total_rating_count: 900 },
      { id: 2, name: 'World of Warcraft Classic', game_type: 0, total_rating_count: 300 },
      { id: 3, name: 'World of Warcraft', game_type: 0, total_rating_count: 200 },
    ]
    expect(rankSearchResults('world of warcraft', pool)[0].name).toBe('World of Warcraft')
  })

  it('still finds a DLC first when it is searched for by its exact name', () => {
    const pool: G[] = [
      { id: 1, name: 'Cyberpunk 2077', game_type: 0, total_rating_count: 5000 },
      { id: 2, name: 'Cyberpunk 2077: Phantom Liberty', game_type: 2, total_rating_count: 400 },
    ]
    expect(rankSearchResults('Cyberpunk 2077: Phantom Liberty', pool)[0].name)
      .toBe('Cyberpunk 2077: Phantom Liberty')
  })

  it('matches query words anywhere in the title, not just at its start', () => {
    const pool: G[] = [
      { id: 1, name: 'The Witcher 3: Wild Hunt - Blood and Wine', game_type: 2, total_rating_count: 800 },
      { id: 2, name: 'Some Unrelated Game', game_type: 0, total_rating_count: 9000 },
      { id: 3, name: 'The Witcher 3: Wild Hunt', game_type: 0, total_rating_count: 4000 },
    ]
    // IGDB only returned the unrelated one via some alternative name: anything
    // whose words actually match outranks it regardless of popularity.
    expect(names(rankSearchResults('witcher 3', pool))).toEqual([
      'The Witcher 3: Wild Hunt',
      'The Witcher 3: Wild Hunt - Blood and Wine',
      'Some Unrelated Game',
    ])
  })

  it('puts a far more popular partial match above an obscure exact title', () => {
    // Store-search behaviour: "Cyber" means Cyberpunk, not a game called Cyber.
    const pool: G[] = [
      { id: 1, name: 'Cyber', game_type: 0, total_rating_count: 4 },
      { id: 2, name: 'Cyberpunk 2077', game_type: 0, total_rating_count: 5000 },
    ]
    expect(names(rankSearchResults('Cyber', pool))).toEqual(['Cyberpunk 2077', 'Cyber'])
  })

  it('keeps an exact title first against anything less than ten times as popular', () => {
    const pool: G[] = [
      { id: 1, name: 'Portal Knights', game_type: 0, total_rating_count: 900 },
      { id: 2, name: 'Portal', game_type: 0, total_rating_count: 100 },
    ]
    expect(rankSearchResults('portal', pool)[0].name).toBe('Portal')
  })

  it('ignores punctuation and case when deciding a title is exact', () => {
    const pool: G[] = [
      { id: 1, name: 'Baldur’s Gate 3', game_type: 0, total_rating_count: 10 },
      { id: 2, name: 'Baldur’s Gate II: Enhanced Edition', game_type: 0, total_rating_count: 500 },
    ]
    expect(rankSearchResults("baldur's gate 3", pool)[0].name).toBe('Baldur’s Gate 3')
  })

  it("keeps IGDB's own order when nothing else separates two results", () => {
    const pool: G[] = [
      { id: 1, name: 'Doom Eternal', game_type: 0, total_rating_count: 100 },
      { id: 2, name: 'Doom 64', game_type: 0, total_rating_count: 100 },
    ]
    expect(names(rankSearchResults('doom', pool))).toEqual(['Doom Eternal', 'Doom 64'])
  })

  it('ranks an anticipated unreleased game by its hype, not as unrated', () => {
    // No ratings yet, so ratings alone would sink it below any released game.
    const pool: G[] = [
      { id: 1, name: 'Grand Theft Auto: Obscure Fan Game', game_type: 0, total_rating_count: 3 },
      { id: 2, name: 'Grand Theft Auto VI', game_type: 0, total_rating_count: 0, hypes: 2500 },
    ]
    expect(rankSearchResults('grand theft auto', pool)[0].name).toBe('Grand Theft Auto VI')
  })

  it('treats missing ratings and hype as zero rather than failing', () => {
    const pool: G[] = [
      { id: 1, name: 'Celeste', game_type: 0 },
      { id: 2, name: 'Celeste Classic', game_type: 0, hypes: 5 },
    ]
    expect(names(rankSearchResults('celeste', pool))).toEqual(['Celeste', 'Celeste Classic'])
  })

  it('does not punish a result whose game type is unknown', () => {
    const pool: G[] = [
      { id: 1, name: 'Hades: Soundtrack', game_type: 1, total_rating_count: 50 },
      { id: 2, name: 'Hades', total_rating_count: 50 },
    ]
    expect(rankSearchResults('hades', pool)[0].name).toBe('Hades')
  })

  it('neither drops nor duplicates anything', () => {
    const pool: G[] = [
      { id: 1, name: 'A', game_type: 1 },
      { id: 2, name: 'B', game_type: 0 },
      { id: 3, name: 'C' },
    ]
    expect(rankSearchResults('x', pool).map(g => g.id).sort()).toEqual([1, 2, 3])
  })
})

describe('popularity', () => {
  it('adds ratings and hype, counting missing values as zero', () => {
    expect(popularity({ name: 'a', total_rating_count: 100, hypes: 20 })).toBe(120)
    expect(popularity({ name: 'b', hypes: 40 })).toBe(40)
    expect(popularity({ name: 'c', total_rating_count: null, hypes: null })).toBe(0)
  })
})

describe('isFullGame', () => {
  it('counts remakes as full games, and editions or add-ons as not', () => {
    expect(isFullGame({ name: 'Resident Evil 4', game_type: 8 })).toBe(true)
    expect(isFullGame({ name: 'Some DLC', game_type: 1 })).toBe(false)
    expect(isFullGame({ name: 'Some Bundle', game_type: 3 })).toBe(false)
    expect(isFullGame({ name: 'Dead Island: GOTY', game_type: 0, version_parent: 42 })).toBe(false)
  })
})

describe('mergeById', () => {
  it('keeps the first copy of each id, in order', () => {
    const a = [{ id: 1, from: 'a' }, { id: 2, from: 'a' }]
    const b = [{ id: 2, from: 'b' }, { id: 3, from: 'b' }]
    expect(mergeById(a, b)).toEqual([{ id: 1, from: 'a' }, { id: 2, from: 'a' }, { id: 3, from: 'b' }])
  })
})

describe('apicalypseString', () => {
  it('escapes quotes and backslashes so a title cannot break out of the query', () => {
    expect(apicalypseString('Say "Hi"')).toBe('Say \\"Hi\\"')
    expect(apicalypseString('a\\b')).toBe('a\\\\b')
  })
})
