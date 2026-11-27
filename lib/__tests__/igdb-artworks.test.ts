import { describe, expect, it } from 'vitest'
import { bestCategory, dailyPick, pictureArtworks } from '../igdb-artworks'

const art = (image_id: string, artwork_type: number | undefined, width = 1920, height = 1080, alpha_channel = false) =>
  ({ image_id, artwork_type, width, height, alpha_channel })

describe('pictureArtworks', () => {
  it('drops logos, even when they are the biggest (Cyberpunk 2077)', () => {
    const list = [art('logo-white', 5, 8334, 2051, true), art('artwork', 1, 3840, 2160)]
    expect(pictureArtworks(list).map(a => a.image_id)).toEqual(['artwork'])
  })

  it('drops covers, icons, infographics and key art with the logo on it', () => {
    const types = [3, 6, 7, 8, 9, 10, 11, 12, 13, 14]
    expect(pictureArtworks(types.map(t => art(`t${t}`, t)))).toEqual([])
  })

  it('drops anything with a transparent background', () => {
    expect(pictureArtworks([art('cutout', 1, 1920, 1080, true)])).toEqual([])
  })

  it('prefers key art without a logo, then artwork, then historical, then concept art', () => {
    const list = [art('concept', 4, 4000, 2000), art('artwork', 1, 3840, 2160), art('historic', 15), art('keyart', 2, 1920, 1080)]
    expect(pictureArtworks(list).map(a => a.image_id)).toEqual(['keyart', 'artwork', 'historic', 'concept'])
  })

  it('takes the largest within a type, and treats untyped artworks as plain artwork', () => {
    const list = [art('small', 1, 1280, 720), art('untyped', undefined, 3840, 2160)]
    expect(pictureArtworks(list).map(a => a.image_id)).toEqual(['untyped', 'small'])
  })

  it('keeps only the shapes asked for', () => {
    const list = [art('wide', 1, 2000, 1000), art('poster', 1, 1000, 1500), art('ultrawide', 1, 3000, 1000)]
    expect(pictureArtworks(list).map(a => a.image_id)).toEqual(['ultrawide', 'wide'])
    expect(pictureArtworks(list, 1.6, 2.4).map(a => a.image_id)).toEqual(['wide'])
    expect(pictureArtworks(list, 0).map(a => a.image_id)).toEqual(['ultrawide', 'wide', 'poster'])
  })
})

describe('bestCategory', () => {
  it('keeps every picture in the best category the game has, largest first', () => {
    const list = [art('a-small', 1, 1280, 720), art('concept', 4), art('a-big', 1, 3840, 2160), art('logo', 5, 8000, 2000, true)]
    expect(bestCategory(list).map(a => a.image_id)).toEqual(['a-big', 'a-small'])
  })

  it('uses only key art without a logo when there is any', () => {
    const list = [art('artwork', 1, 3840, 2160), art('key', 2)]
    expect(bestCategory(list).map(a => a.image_id)).toEqual(['key'])
  })

  it('falls to the next category, and to nothing', () => {
    expect(bestCategory([art('concept', 4), art('logo', 6, 1920, 1080, true)]).map(a => a.image_id)).toEqual(['concept'])
    expect(bestCategory([art('logo', 5, 1920, 1080, true)])).toEqual([])
    expect(bestCategory(undefined)).toEqual([])
  })
})

describe('dailyPick', () => {
  const items = ['a', 'b', 'c']

  it('moves to the next one each day and wraps round', () => {
    const picks = ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30'].map(d => dailyPick(items, d))
    expect(new Set(picks.slice(0, 3)).size).toBe(3)
    expect(picks[3]).toBe(picks[0])
  })

  it('is the same all day, and with one item always that one', () => {
    expect(dailyPick(items, '2026-11-27')).toBe(dailyPick(items, '2026-11-27'))
    expect(dailyPick(['only'], '2026-11-27')).toBe('only')
    expect(dailyPick(['only'], '2027-03-01')).toBe('only')
  })

  it('gives nothing for an empty list', () => {
    expect(dailyPick([], '2026-11-27')).toBeUndefined()
  })
})
