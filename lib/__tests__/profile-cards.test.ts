import { describe, it, expect } from 'vitest'
import {
  DEFAULT_LAYOUT,
  MAX_BIO_LENGTH,
  PROFILE_CARD_IDS,
  PROFILE_CARDS,
  addCard,
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
  type ProfileLayout,
} from '../profile-cards'

const L = (...items: [string, 'full' | 'half'][]) => items.map(([card, size]) => ({ card, size })) as ProfileLayout

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
  it('pairs half cards and ends with a full space while cards are left', () => {
    const entries = gridEntries(L(['playing', 'full'], ['finish_rate', 'half'], ['achievements', 'half']))
    expect(entries.map(e => e.kind === 'card' ? e.item.card : `space:${e.size}@${e.at}`))
      .toEqual(['playing', 'finish_rate', 'achievements', 'space:full@3'])
  })

  it('leaves a half space beside a lone half card before a full one', () => {
    const entries = gridEntries(L(['streak', 'half'], ['year', 'full']))
    expect(entries.map(e => e.kind === 'card' ? e.item.card : `space:${e.size}@${e.at}`))
      .toEqual(['streak', 'space:half@1', 'year', 'space:full@2'])
  })

  it('leaves a half space after a lone half card at the end', () => {
    const entries = gridEntries(L(['streak', 'half']))
    expect(entries.map(e => e.kind === 'card' ? e.item.card : `space:${e.size}@${e.at}`))
      .toEqual(['streak', 'space:half@1', 'space:full@1'])
  })

  it('is just a full space for an empty profile', () => {
    expect(gridEntries([])).toEqual([{ kind: 'space', at: 0, size: 'full' }])
  })

  it('has no full space once every card is on', () => {
    const all = PROFILE_CARD_IDS.map(card => ({ card, size: PROFILE_CARDS[card].sizes[0] }))
    expect(gridEntries(all).some(e => e.kind === 'space' && e.size === 'full')).toBe(false)
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

  it('fills a space at its size when the card comes in it, else at the card’s own size', () => {
    expect(sizeForSpace('up_next', 'half')).toBe('half')
    expect(sizeForSpace('up_next', 'full')).toBe('full')
    expect(sizeForSpace('year', 'half')).toBe('full')
    expect(sizeForSpace('streak', 'full')).toBe('half')
  })

  it('removes and resizes', () => {
    expect(removeCard(base, 'finish_rate').map(i => i.card)).toEqual(['playing', 'achievements'])
    expect(setSize(base, 'playing', 'half')[0]).toEqual({ card: 'playing', size: 'half' })
    expect(setSize(base, 'finish_rate', 'full')).toBe(base)
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
