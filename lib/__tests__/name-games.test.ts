import { describe, it, expect, vi, afterEach } from 'vitest'
import { normaliseTitle, findGameByExactName } from '../name-games'

vi.mock('../rawg', () => ({ searchRawgGames: vi.fn() }))

describe('normaliseTitle', () => {
  it('reduces a title to bare lowercase letters and digits', () => {
    expect(normaliseTitle('ABZU')).toBe('abzu')
    expect(normaliseTitle('Baldur’s Gate 3')).toBe('baldursgate3')
    expect(normaliseTitle('Hades II')).toBe('hadesii')
  })

  it('treats differing punctuation and spacing as equal', () => {
    // A launcher's display name and IGDB's own title rarely agree on an em
    // dash vs a colon vs nothing at all — this is what lets them still match.
    expect(normaliseTitle('Tom Clancy’s Rainbow Six: Siege'))
      .toBe(normaliseTitle('Tom Clancy’s Rainbow Six - Siege'))
  })
})

describe('findGameByExactName', () => {
  afterEach(() => vi.resetAllMocks())

  it('matches a launcher display name to IGDB’s own, different-case title', async () => {
    // The real case this exists for: Epic's manifest says "ABZU", IGDB's
    // canonical title is "Abzu".
    const { searchRawgGames } = await import('../rawg')
    vi.mocked(searchRawgGames).mockResolvedValue([
      { id: 7352, name: 'Abzu' } as any,
      { id: 52553, name: 'Abzu: Deluxe Edition' } as any,
    ])
    expect(await findGameByExactName('ABZU')).toEqual({ kind: 'game', igdbId: 7352, name: 'Abzu' })
  })

  it('does not take a near match over an exact one further down the results', async () => {
    const { searchRawgGames } = await import('../rawg')
    vi.mocked(searchRawgGames).mockResolvedValue([
      { id: 1, name: 'Hades II: Early Access' } as any,
      { id: 2, name: 'Hades II' } as any,
    ])
    expect(await findGameByExactName('Hades II')).toEqual({ kind: 'game', igdbId: 2, name: 'Hades II' })
  })

  it('is a miss, not a negative, when nothing matches exactly', async () => {
    // The critical distinction from the Steam path: this must never be
    // treated as "not a game" — a search ranking quirk is not proof of
    // anything, and caching it would risk permanently hiding a real game.
    const { searchRawgGames } = await import('../rawg')
    vi.mocked(searchRawgGames).mockResolvedValue([{ id: 1, name: 'Something Else Entirely' } as any])
    expect(await findGameByExactName('Totally Unrelated Title')).toEqual({ kind: 'noMatch' })
  })

  it('is a miss on an empty search result', async () => {
    const { searchRawgGames } = await import('../rawg')
    vi.mocked(searchRawgGames).mockResolvedValue([])
    expect(await findGameByExactName('Anything')).toEqual({ kind: 'noMatch' })
  })

  it('is a miss on a blank or whitespace-only guess, without searching', async () => {
    const { searchRawgGames } = await import('../rawg')
    expect(await findGameByExactName('   ')).toEqual({ kind: 'noMatch' })
    expect(searchRawgGames).not.toHaveBeenCalled()
  })
})
