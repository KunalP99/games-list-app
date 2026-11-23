import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAYOUT,
  MAX_BIO_LENGTH,
  PROFILE_CARD_IDS,
  PROFILE_CARDS,
  addCard,
  calendarDays,
  playLevel,
  cardsToAdd,
  gridEntries,
  moveCard,
  normaliseBio,
  normaliseLayout,
  nudgeCard,
  removeCard,
  sameLayout,
  setSize,
  sizeForSpace,
  splitSize,
  type ProfileLayout,
} from '../profile-cards'

const L = (...items: [string, 'full' | 'half' | 'small'][]) => items.map(([card, size]) => ({ card, size })) as ProfileLayout

describe('the card catalogue', () => {
  it('describes every card, each with at least one size', () => {
    for (const id of PROFILE_CARD_IDS) {
      expect(PROFILE_CARDS[id].id).toBe(id)
      expect(PROFILE_CARDS[id].sizes.length).toBeGreaterThan(0)
    }
  })

  it('has a default layout that is itself valid', () => {
    expect(normaliseLayout(DEFAULT_LAYOUT)).toEqual(DEFAULT_LAYOUT)
  })
})

describe('normaliseLayout', () => {
  it('gives the default for a profile that never chose one, or garbage', () => {
    expect(normaliseLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(normaliseLayout(undefined)).toEqual(DEFAULT_LAYOUT)
    expect(normaliseLayout('playing')).toEqual(DEFAULT_LAYOUT)
    expect(normaliseLayout({ card: 'playing' })).toEqual(DEFAULT_LAYOUT)
  })

  it('returns a copy, so editing it never changes the default', () => {
    const layout = normaliseLayout(null)
    layout[0].size = 'half'
    expect(DEFAULT_LAYOUT[0].size).toBe('full')
  })

  it('keeps an empty layout: no cards is a choice', () => {
    expect(normaliseLayout([])).toEqual([])
  })

  it('drops unknown cards, repeats and sizes a card does not come in', () => {
    expect(normaliseLayout([
      { card: 'playing', size: 'half' },
      { card: 'shop_item', size: 'full' },
      { card: 'playing', size: 'full' },
      { card: 'year', size: 'half' },
      { card: 'streak', size: 'huge' },
      { card: 'genres', size: 'small' },
      null,
      7,
      { card: 'streak', size: 'half' },
    ])).toEqual(L(['playing', 'half'], ['streak', 'half']))
  })

  it('caps the list', () => {
    const many = [...PROFILE_CARD_IDS, ...PROFILE_CARD_IDS].map(card => ({ card, size: PROFILE_CARDS[card].sizes[0] }))
    expect(normaliseLayout(many)).toHaveLength(PROFILE_CARD_IDS.length)
  })
})

describe('gridEntries', () => {
  const show = (layout: ProfileLayout) =>
    gridEntries(layout).map(e => e.kind === 'card' ? e.item.card : `space:${e.size}@${e.at}`)

  it('fills rows of four columns and ends with a full space while cards are left', () => {
    expect(show(L(['playing', 'full'], ['finish_rate', 'half'], ['achievements', 'half'])))
      .toEqual(['playing', 'finish_rate', 'achievements', 'space:full@3'])
    expect(show(L(['finish_rate', 'small'], ['achievements', 'small'], ['streak', 'small'], ['completed_this_year', 'small'])))
      .toEqual(['finish_rate', 'achievements', 'streak', 'completed_this_year', 'space:full@4'])
    expect(show(L(['finish_rate', 'small'], ['genres', 'half'], ['streak', 'small'])))
      .toEqual(['finish_rate', 'genres', 'streak', 'space:full@3'])
  })

  it('leaves a half space beside a lone half card before a full one', () => {
    expect(show(L(['genres', 'half'], ['year', 'full'])))
      .toEqual(['genres', 'space:half@1', 'year', 'space:full@2'])
  })

  it('offers squares where a half would not line up', () => {
    expect(show(L(['streak', 'small'], ['year', 'full'])))
      .toEqual(['streak', 'space:small@1', 'space:half@1', 'year', 'space:full@2'])
    expect(show(L(['streak', 'small'], ['genres', 'half'], ['year', 'full'])))
      .toEqual(['streak', 'genres', 'space:small@2', 'year', 'space:full@3'])
  })

  it('moves a half card that does not fit to the next row, leaving a square', () => {
    expect(show(L(['finish_rate', 'small'], ['achievements', 'small'], ['streak', 'small'], ['genres', 'half'])))
      .toEqual(['finish_rate', 'achievements', 'streak', 'space:small@3', 'genres', 'space:half@4', 'space:full@4'])
  })

  it('is just a full space for an empty profile', () => {
    expect(gridEntries([])).toEqual([{ kind: 'space', at: 0, size: 'full' }])
  })

  it('has no full space once every card is on', () => {
    const all = PROFILE_CARD_IDS.map(card => ({ card, size: PROFILE_CARDS[card].sizes[0] }))
    expect(gridEntries(all).some(e => e.kind === 'space' && e.size === 'full')).toBe(false)
  })
})

describe('splitSize', () => {
  it('splits a full space into halves, a half into squares, and a square not at all', () => {
    expect(splitSize('full')).toBe('half')
    expect(splitSize('half')).toBe('small')
    expect(splitSize('small')).toBeNull()
  })
})

describe('editing', () => {
  const base = L(['playing', 'full'], ['finish_rate', 'half'], ['achievements', 'half'])

  it('lists the cards not on the profile', () => {
    expect(cardsToAdd(base)).not.toContain('playing')
    expect(cardsToAdd(base)).toContain('streak')
    expect(cardsToAdd(base)).toHaveLength(PROFILE_CARD_IDS.length - 3)
  })

  it('adds a card where the space is', () => {
    expect(addCard(base, 1, 'streak', 'half').map(i => i.card))
      .toEqual(['playing', 'streak', 'finish_rate', 'achievements'])
    expect(addCard(base, 99, 'streak', 'half').map(i => i.card).at(-1)).toBe('streak')
  })

  it('never adds a card twice, or at a size it does not come in', () => {
    expect(addCard(base, 0, 'playing', 'half')).toBe(base)
    expect(addCard(base, 0, 'year', 'half')).toBe(base)
  })

  it('fills a space at its size when the card comes in it, else at the card’s largest', () => {
    expect(sizeForSpace('up_next', 'half')).toBe('half')
    expect(sizeForSpace('up_next', 'full')).toBe('full')
    expect(sizeForSpace('year', 'half')).toBe('full')
    expect(sizeForSpace('streak', 'full')).toBe('half')
    expect(sizeForSpace('streak', 'small')).toBe('small')
    expect(sizeForSpace('genres', 'small')).toBe('half')
  })

  it('removes and resizes', () => {
    expect(removeCard(base, 'finish_rate').map(i => i.card)).toEqual(['playing', 'achievements'])
    expect(setSize(base, 'playing', 'half')[0]).toEqual({ card: 'playing', size: 'half' })
    expect(setSize(base, 'finish_rate', 'full')).toBe(base)
    expect(setSize(base, 'finish_rate', 'small')[1]).toEqual({ card: 'finish_rate', size: 'small' })
    expect(setSize(base, 'playing', 'small')).toBe(base)
  })

  it('moves a card to another’s place, the rest shifting along', () => {
    expect(moveCard(base, 'achievements', 'playing').map(i => i.card))
      .toEqual(['achievements', 'playing', 'finish_rate'])
    expect(moveCard(base, 'playing', 'achievements').map(i => i.card))
      .toEqual(['finish_rate', 'achievements', 'playing'])
    expect(moveCard(base, 'playing', 'streak')).toBe(base)
  })

  it('nudges a card one place, stopping at the ends', () => {
    expect(nudgeCard(base, 'finish_rate', -1).map(i => i.card)).toEqual(['finish_rate', 'playing', 'achievements'])
    expect(nudgeCard(base, 'playing', -1)).toBe(base)
    expect(nudgeCard(base, 'achievements', 1)).toBe(base)
  })

  it('compares layouts by order and size', () => {
    expect(sameLayout(base, L(['playing', 'full'], ['finish_rate', 'half'], ['achievements', 'half']))).toBe(true)
    expect(sameLayout(base, setSize(base, 'playing', 'half'))).toBe(false)
    expect(sameLayout(base, moveCard(base, 'achievements', 'finish_rate'))).toBe(false)
  })
})

describe('normaliseBio', () => {
  it('trims, folds line breaks and caps the length', () => {
    expect(normaliseBio('  Hello\n\nthere  ')).toBe('Hello there')
    expect(normaliseBio('x'.repeat(500))).toHaveLength(MAX_BIO_LENGTH)
  })

  it('stores nothing for an empty bio or something that is not text', () => {
    expect(normaliseBio('   ')).toBeNull()
    expect(normaliseBio(42)).toBeNull()
  })
})

describe('the Play calendar', () => {
  it('runs from the Monday 52 weeks before this week to today', () => {
    // 2026-11-23 is a Monday: 52 whole weeks before it, plus today.
    const monday = calendarDays(new Map(), '2026-11-23')
    expect(monday.start).toBe('2025-11-24')
    expect(monday.minutes).toHaveLength(52 * 7 + 1)
    // A Thursday: this week's Monday to Thursday on the end.
    const thursday = calendarDays(new Map(), '2026-11-26')
    expect(thursday.start).toBe('2025-11-24')
    expect(thursday.minutes).toHaveLength(52 * 7 + 4)
  })

  it('puts each day’s minutes in its place, and 0 elsewhere', () => {
    const { minutes } = calendarDays(new Map([['2026-11-26', 90], ['2025-11-24', 30], ['2020-01-01', 999]]), '2026-11-26')
    expect(minutes[0]).toBe(30)
    expect(minutes.at(-1)).toBe(90)
    expect(minutes.reduce((a, b) => a + b, 0)).toBe(120)
  })

  it('shades by hours: none, under 1h, 1–2h, 2–4h, 4h+', () => {
    expect([0, 1, 59, 60, 119, 120, 239, 240, 900].map(playLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
  })
})
