import { describe, it, expect } from 'vitest'
import {
  orderVideos, pickAgeRating, playersLine, storeLinks, isUpcoming, countdown, releaseLines, splitAddOns,
  platformNames, isYearOnly, type StoreRelated,
} from '../store-page'

describe('orderVideos', () => {
  it('puts the launch trailer first, then trailers, then the rest; dev diaries last', () => {
    const v = (name: string) => ({ name })
    const out = orderVideos([v('Developer Diary: Creating the Sound'), v('TV Spot'), v('Killing Monsters Cinematic Trailer'), v('Gameplay Demo'), v('Launch Trailer'), v('Trailer')], 6)
    expect(out.map(x => x.name)).toEqual(['Launch Trailer', 'Trailer', 'Killing Monsters Cinematic Trailer', 'Gameplay Demo', 'TV Spot', 'Developer Diary: Creating the Sound'])
  })
  it('keeps at most the limit', () => {
    expect(orderVideos(Array.from({ length: 10 }, (_, i) => ({ name: `Trailer ${i}` })), 4)).toHaveLength(4)
  })
})

describe('pickAgeRating', () => {
  const r = (org: string, rating: string) => ({ organization: { name: org }, rating_category: { rating } })
  it('prefers PEGI, then ESRB', () => {
    expect(pickAgeRating([r('ESRB', 'M'), r('USK', '18'), r('PEGI', '18')])).toBe('PEGI 18')
    expect(pickAgeRating([r('CERO', 'Z'), r('ESRB', 'M')])).toBe('ESRB M')
  })
  it('is nothing without either', () => {
    expect(pickAgeRating([r('CERO', 'Z')])).toBeNull()
    expect(pickAgeRating(undefined)).toBeNull()
  })
})

describe('playersLine', () => {
  it('single player only', () => {
    expect(playersLine(['Single player'], [])).toBe('Single player only')
  })
  it('counts players and names the co-op kinds', () => {
    expect(playersLine(['Single player', 'Co-operative'], [{ onlinecoop: true, onlinecoopmax: 4, splitscreen: true }])).toBe('Single player · 1–4 · Online co-op · Split screen')
  })
  it('falls back to "Multiplayer" when IGDB knows little', () => {
    expect(playersLine(['Multiplayer'], [])).toBe('Multiplayer')
  })
  it('is nothing when IGDB has no modes', () => {
    expect(playersLine([], [])).toBeNull()
  })
})

describe('storeLinks', () => {
  it('known shops only, each once, in a fixed order, always https', () => {
    const sites = [
      { url: 'https://www.facebook.com/x', type: { type: 'Facebook' } },
      { url: 'https://www.gog.com/game/x', type: { type: 'GOG' } },
      { url: 'http://store.steampowered.com/app/1', type: { type: 'Steam' } },
      { url: 'https://store.steampowered.com/app/2', type: { type: 'Steam' } },
      { url: 'https://store.playstation.com/x', type: { type: 'Playstation' } },
      { url: 'javascript:alert(1)', type: { type: 'Epic' } },
    ]
    expect(storeLinks(sites)).toEqual([
      { label: 'Steam', url: 'https://store.steampowered.com/app/1' },
      { label: 'GOG', url: 'https://www.gog.com/game/x' },
      { label: 'PlayStation Store', url: 'https://store.playstation.com/x' },
    ])
  })
})

describe('release', () => {
  const now = Date.UTC(2026, 10, 20, 12, 0)
  it('a game with no date, or a date to come, is upcoming', () => {
    expect(isUpcoming(null, now)).toBe(true)
    expect(isUpcoming(now / 1000 + 60, now)).toBe(true)
    expect(isUpcoming(now / 1000 - 60, now)).toBe(false)
  })
  it('counts down in days and hours, and minutes on the last day', () => {
    expect(countdown(now / 1000 + (23 * 1440 + 14 * 60 + 5) * 60, now)).toEqual({ days: 23, hours: 14, minutes: 5, lastDay: false })
    expect(countdown(now / 1000 + (3 * 60 + 20) * 60, now)).toEqual({ days: 0, hours: 3, minutes: 20, lastDay: true })
    expect(countdown(now / 1000 - 1, now)).toBeNull()
    expect(countdown(null, now)).toBeNull()
  })
  it('groups platforms by date, soonest first, year-only placeholders as the year', () => {
    const d = (y: number, m: number, day: number) => Date.UTC(y, m, day) / 1000
    expect(releaseLines([
      { date: d(2027, 11, 31), platform: { abbreviation: 'Series X|S' } },
      { date: d(2026, 11, 12), platform: { abbreviation: 'PC' } },
      { date: d(2026, 11, 12), platform: { abbreviation: 'PS5' } },
    ])).toEqual(['PC, PS5: 12 Dec 2026', 'Series X|S: 2027'])
  })
})

describe('splitAddOns', () => {
  const rel = (id: number, year: number): StoreRelated => ({ id, name: `#${id}`, year, upcoming: false })
  it('expansions always get cards; a few DLC do too', () => {
    const out = splitAddOns([rel(2, 2016), rel(1, 2015)], [rel(3, 2015)])
    expect(out.cards.map(c => c.id)).toEqual([1, 2, 3])
    expect(out.small).toEqual([])
  })
  it('many small DLC go in one line (The Witcher 3\'s five free quests)', () => {
    const out = splitAddOns([rel(1, 2015)], [rel(3, 2015), rel(4, 2015), rel(5, 2015), rel(6, 2015), rel(7, 2015)])
    expect(out.cards.map(c => c.id)).toEqual([1])
    expect(out.small).toHaveLength(5)
  })
})

describe('platformNames', () => {
  it('plain names, PC first then newest consoles', () => {
    expect(platformNames([
      { abbreviation: 'Series X|S' }, { abbreviation: 'PS4' }, { abbreviation: 'Switch 2' }, { abbreviation: 'PC' },
      { abbreviation: 'PS5' }, { abbreviation: 'XONE' }, { abbreviation: 'Switch' },
    ])).toEqual(['PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S', 'Xbox One', 'Switch 2', 'Switch'])
  })
  it('falls back to the name IGDB gives', () => {
    expect(platformNames([{ name: 'Amiga' }])).toEqual(['Amiga'])
  })
})

describe('isYearOnly', () => {
  it('31 December is IGDB’s "sometime that year"', () => {
    expect(isYearOnly(Date.UTC(2027, 11, 31) / 1000)).toBe(true)
    expect(isYearOnly(Date.UTC(2026, 11, 12) / 1000)).toBe(false)
    expect(isYearOnly(null)).toBe(false)
  })
})
