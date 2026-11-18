import { describe, it, expect } from 'vitest'
import {
  MAX_HOURS_PLAYED, parseHours, parseAchievementProgress, parseDlc, parseYoutubeVideos, parseStringList,
} from '../game-input'

describe('parseHours', () => {
  it('treats a blank box as no figure', () => {
    expect(parseHours(null)).toEqual({ ok: true, value: null })
    expect(parseHours('')).toEqual({ ok: true, value: null })
    expect(parseHours('  ')).toEqual({ ok: true, value: null })
  })

  it('accepts 0 up to the cap, rounded to 0.1h like the column', () => {
    expect(parseHours('0')).toEqual({ ok: true, value: 0 })
    expect(parseHours('42.26')).toEqual({ ok: true, value: 42.3 })
    expect(parseHours(12.5)).toEqual({ ok: true, value: 12.5 })
    expect(parseHours(String(MAX_HOURS_PLAYED))).toEqual({ ok: true, value: MAX_HOURS_PLAYED })
  })

  it('allows genuinely huge figures, like 10,000+ hours in one game', () => {
    expect(parseHours('10000')).toEqual({ ok: true, value: 10000 })
    expect(parseHours('25000.5')).toEqual({ ok: true, value: 25000.5 })
  })

  it('refuses only what the column cannot store, with a clear message', () => {
    expect(MAX_HOURS_PLAYED).toBe(99_999.9)
    expect(parseHours('100000').ok).toBe(false)
    expect(parseHours(1e9).ok).toBe(false)
  })

  it('refuses negatives and non-numbers', () => {
    expect(parseHours('-1').ok).toBe(false)
    expect(parseHours('abc').ok).toBe(false)
    expect(parseHours('Infinity').ok).toBe(false)
    expect(parseHours(NaN).ok).toBe(false)
  })
})

describe('parseAchievementProgress', () => {
  it('accepts blank and 0–100', () => {
    expect(parseAchievementProgress('')).toEqual({ ok: true, value: null })
    expect(parseAchievementProgress('0')).toEqual({ ok: true, value: 0 })
    expect(parseAchievementProgress('100')).toEqual({ ok: true, value: 100 })
    expect(parseAchievementProgress(57.5)).toEqual({ ok: true, value: 57.5 })
  })

  it('refuses anything outside a percentage', () => {
    expect(parseAchievementProgress('101').ok).toBe(false)
    expect(parseAchievementProgress('-5').ok).toBe(false)
    expect(parseAchievementProgress('lots').ok).toBe(false)
  })
})

describe('parseDlc', () => {
  it('reads well-formed entries', () => {
    const raw = JSON.stringify([
      { name: 'Hearts of Stone', rawg_id: 123, owned: true },
      { name: 'Blood and Wine', rawg_id: null, owned: false, removed: true },
    ])
    expect(parseDlc(raw)).toEqual([
      { name: 'Hearts of Stone', rawg_id: 123, owned: true },
      { name: 'Blood and Wine', rawg_id: null, owned: false, removed: true },
    ])
  })

  it('treats malformed JSON or a non-list as empty instead of throwing', () => {
    expect(parseDlc('{not json')).toEqual([])
    expect(parseDlc('{"a":1}')).toEqual([])
    expect(parseDlc(null)).toEqual([])
    expect(parseDlc('')).toEqual([])
  })

  it('drops entries without a name and coerces the rest', () => {
    const raw = JSON.stringify([null, 'x', { rawg_id: 1 }, { name: '  DLC  ', rawg_id: 'abc', owned: 'yes' }])
    expect(parseDlc(raw)).toEqual([{ name: 'DLC', rawg_id: null, owned: false }])
  })
})

describe('parseYoutubeVideos', () => {
  const good = { youtube_id: 'dQw4w9WgXcQ', title: 'Trailer', author_name: 'Studio', thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }

  it('keeps real videos', () => {
    expect(parseYoutubeVideos(JSON.stringify([good]))).toEqual([good])
  })

  it('drops entries without a valid video id', () => {
    const raw = JSON.stringify([{ ...good, youtube_id: 'bad id' }, { ...good, youtube_id: '<script>' }, {}, good])
    expect(parseYoutubeVideos(raw)).toEqual([good])
  })

  it('keeps only https thumbnails and fills a missing title', () => {
    const raw = JSON.stringify([
      { youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'javascript:alert(1)' },
      { youtube_id: 'dQw4w9WgXcQ', thumbnail_url: 'http://tracker.example/pixel.gif', title: 'T' },
    ])
    expect(parseYoutubeVideos(raw)).toEqual([
      { youtube_id: 'dQw4w9WgXcQ', title: 'YouTube video', author_name: null, thumbnail_url: null },
      { youtube_id: 'dQw4w9WgXcQ', title: 'T', author_name: null, thumbnail_url: null },
    ])
  })

  it('treats malformed JSON as empty', () => {
    expect(parseYoutubeVideos('[{')).toEqual([])
  })
})

describe('parseStringList', () => {
  it('keeps short non-empty strings only', () => {
    expect(parseStringList(JSON.stringify(['RPG', '', 3, ' Indie ']))).toEqual(['RPG', 'Indie'])
    expect(parseStringList('nope')).toEqual([])
  })
})
