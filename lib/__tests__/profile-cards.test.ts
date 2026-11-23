import { describe, it, expect } from 'vitest'
import {
  moveToSpace,
  spotlightOrder,
  genreColumns,
  shortGenre,
  streakFlame,
  timelineDate,
  DEFAULT_LAYOUT,
  MAX_BIO_LENGTH,
  PROFILE_CARD_IDS,
  PROFILE_CARDS,
  addCard,
  normaliseShelfGames,
  setShelfGames,
  shelfGames,
  SHELF_MAX,
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
    layout[0].size = 'small'
    expect(DEFAULT_LAYOUT[0].size).toBe('half')
  })

  it('keeps an empty layout: no cards is a choice', () => {
    expect(normaliseLayout([])).toEqual([])
  })

  it('drops unknown cards, repeats and unknown sizes; a size a card does not come in becomes its largest', () => {
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
    ])).toEqual(L(['playing', 'half'], ['year', 'full'], ['genres', 'half'], ['streak', 'half']))
    // Finish rate was once half or square; a saved half becomes a square.
    expect(normaliseLayout([{ card: 'finish_rate', size: 'half' }])).toEqual(L(['finish_rate', 'small']))
    // Currently playing was once full or half; a saved full one becomes half.
    expect(normaliseLayout([{ card: 'playing', size: 'full' }])).toEqual(L(['playing', 'half']))
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
    expect(setSize(base, 'achievements', 'small')[2]).toEqual({ card: 'achievements', size: 'small' })
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

describe('the Game shelf', () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

  it('keeps only game ids, each once, up to the shelf’s size', () => {
    expect(normaliseShelfGames([id(1), 'nope', 7, id(1), id(2)])).toEqual([id(1), id(2)])
    expect(normaliseShelfGames(Array.from({ length: 12 }, (_, i) => id(i)))).toHaveLength(SHELF_MAX)
    expect(normaliseShelfGames('x')).toEqual([])
  })

  it('stores its games in the layout, and only on the shelf', () => {
    expect(normaliseLayout([{ card: 'shelf', size: 'full', games: [id(1), 'bad'] }, { card: 'streak', size: 'small', games: [id(2)] }]))
      .toEqual([{ card: 'shelf', size: 'full', games: [id(1)] }, { card: 'streak', size: 'small' }])
    expect(normaliseLayout([{ card: 'shelf', size: 'full', games: [] }])).toEqual([{ card: 'shelf', size: 'full' }])
  })

  it('sets and clears its games, and counts them as a change', () => {
    const layout = L(['shelf', 'full'], ['streak', 'small'])
    const set = setShelfGames(layout, [id(3), id(1)])
    expect(set[0]).toEqual({ card: 'shelf', size: 'full', games: [id(3), id(1)] })
    expect(sameLayout(layout, set)).toBe(false)
    expect(setShelfGames(set, [])[0]).toEqual({ card: 'shelf', size: 'full' })
  })

  it('shows the chosen games in order, skipping missing ones, else the latest', () => {
    const completed = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ id: id(n) }))
    expect(shelfGames(completed, [id(5), id(99), id(2)]).map(g => g.id)).toEqual([id(5), id(2)])
    expect(shelfGames(completed, undefined)).toHaveLength(SHELF_MAX)
    expect(shelfGames(completed, [])[0].id).toBe(id(1))
  })
})

describe('timelineDate', () => {
  it('shows the day and month, and the year only when it is not this year', () => {
    expect(timelineDate('2026-09-30', 2026)).toBe('30 Sep')
    expect(timelineDate('2026-01-05T10:00:00Z', 2026)).toBe('5 Jan')
    expect(timelineDate('2025-12-31', 2026)).toBe('31 Dec 2025')
  })
  it('has nothing to show without a date', () => {
    expect(timelineDate(null, 2026)).toBeNull()
    expect(timelineDate('soon', 2026)).toBeNull()
  })
})

describe('streakFlame', () => {
  it('is out with no streak', () => {
    expect(streakFlame(0)).toEqual({ size: 0, glow: 0 })
    expect(streakFlame(NaN)).toEqual({ size: 0, glow: 0 })
  })
  it('starts small, grows with the streak and is full size from 30 days', () => {
    expect(streakFlame(1).size).toBeCloseTo(0.6)
    const sizes = [1, 3, 7, 14, 30].map(d => streakFlame(d).size)
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes)
    expect(streakFlame(30)).toEqual({ size: 1, glow: 1 })
    expect(streakFlame(200)).toEqual({ size: 1, glow: 1 })
  })
})

describe('the Favourite genres blocks', () => {
  it('drops the bracketed abbreviation from a genre name', () => {
    expect(shortGenre('Role-playing (RPG)')).toBe('Role-playing')
    expect(shortGenre('Turn-based strategy (TBS)')).toBe('Turn-based strategy')
    expect(shortGenre("Hack and slash/Beat 'em up")).toBe("Hack and slash/Beat 'em up")
  })

  it('gives the top two a column each and stacks the third and fourth', () => {
    const cols = genreColumns([
      { name: 'Adventure', count: 10 }, { name: 'RPG', count: 7 }, { name: 'Indie', count: 5 }, { name: 'Platform', count: 4 }, { name: 'Puzzle', count: 4 },
    ])
    expect(cols.map(c => c.blocks.map(b => b.name))).toEqual([['Adventure'], ['RPG'], ['Indie', 'Platform']])
    expect(cols.map(c => c.weight)).toEqual([10 / 26, 7 / 26, 9 / 26])
    expect(cols[2].blocks.map(b => b.weight)).toEqual([5 / 9, 4 / 9])
  })

  it('uses a column per genre when there are three or fewer, and none when there are none', () => {
    expect(genreColumns([{ name: 'A', count: 2 }, { name: 'B', count: 1 }]).map(c => c.blocks.length)).toEqual([1, 1])
    expect(genreColumns([])).toEqual([])
    expect(genreColumns([{ name: 'A', count: 0 }])).toEqual([])
  })

  it('keeps a small genre big enough for its name', () => {
    const cols = genreColumns([{ name: 'A', count: 50 }, { name: 'B', count: 1 }, { name: 'C', count: 30 }, { name: 'D', count: 1 }])
    expect(cols[1].weight).toBe(0.18)
    expect(cols[2].blocks[1].weight).toBe(0.18)
  })
})

describe('spotlightOrder', () => {
  const g = (id: string, liveSince: string | null = null) => ({ id, liveSince })
  it('keeps the order when nothing is running', () => {
    expect(spotlightOrder([g('a'), g('b'), g('c')]).map(x => x.id)).toEqual(['a', 'b', 'c'])
    expect(spotlightOrder([])).toEqual([])
  })
  it('puts a running game first, the most recently started if several are', () => {
    expect(spotlightOrder([g('a'), g('b', '2026-11-23T10:00:00Z'), g('c')]).map(x => x.id)).toEqual(['b', 'a', 'c'])
    expect(spotlightOrder([g('a', '2026-11-23T09:00:00Z'), g('b'), g('c', '2026-11-23T11:00:00Z')]).map(x => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('moveToSpace', () => {
  const layout = L(['playing', 'half'], ['streak', 'small'], ['achievements', 'small'], ['completed_this_year', 'small'], ['finish_rate', 'small'])
  const show = (l: ReturnType<typeof L>) => l.map(i => `${i.card}:${i.size}`)

  it('moves a card into a space later on, where Add a card would put one', () => {
    // A space at the end (at = length): Play streak goes last.
    expect(show(moveToSpace(layout, 'streak', 5, 'small')))
      .toEqual(['playing:half', 'achievements:small', 'completed_this_year:small', 'finish_rate:small', 'streak:small'])
    // A space before Finish rate (at = 4).
    expect(show(moveToSpace(layout, 'streak', 4, 'small')))
      .toEqual(['playing:half', 'achievements:small', 'completed_this_year:small', 'streak:small', 'finish_rate:small'])
  })

  it('moves a card into a space earlier on', () => {
    expect(show(moveToSpace(layout, 'finish_rate', 1, 'small')))
      .toEqual(['playing:half', 'finish_rate:small', 'streak:small', 'achievements:small', 'completed_this_year:small'])
  })

  it('takes the space size when the card comes in it, else keeps its own', () => {
    expect(moveToSpace(layout, 'streak', 5, 'half').at(-1)).toEqual({ card: 'streak', size: 'half' })
    // Finish rate is square only; Currently playing half only.
    expect(moveToSpace(layout, 'finish_rate', 0, 'half')[0]).toEqual({ card: 'finish_rate', size: 'small' })
    expect(moveToSpace(layout, 'playing', 5, 'small').at(-1)).toEqual({ card: 'playing', size: 'half' })
  })

  it('changes nothing for a card not on the profile, or a drop where it already is', () => {
    expect(moveToSpace(layout, 'genres', 2, 'half')).toBe(layout)
    expect(moveToSpace(layout, 'streak', 2, 'small')).toBe(layout)
  })
})
