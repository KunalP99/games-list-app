import { describe, it, expect } from 'vitest'
import {
  cardDrop,
  dropOnCard,
  layoutRows,
  moveToRow,
  addToSpace,
  moveToSpace,
  trimEmpties,
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
    expect(gridEntries([])).toEqual([{ kind: 'space', at: 0, size: 'full', row: 0 }])
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

describe('empty spaces kept in the layout', () => {
  // Row 1: Currently playing (half), Play streak, Achievements. Row 2: two
  // squares and a half-size gap.
  const layout = L(['playing', 'half'], ['streak', 'small'], ['achievements', 'small'], ['completed_this_year', 'small'], ['finish_rate', 'small'])
  const show = (l: ProfileLayout) => l.map(i => `${i.card}:${i.size}`)
  const rowGap = { at: 5, size: 'half', root: 'half', offset: 0 } as const

  it('moves a card into a gap and leaves an empty space where it was, so nothing else moves', () => {
    expect(show(moveToSpace(layout, 'streak', { ...rowGap, size: 'small' })))
      .toEqual(['playing:half', 'empty:small', 'achievements:small', 'completed_this_year:small', 'finish_rate:small', 'streak:small'])
  })

  it('puts it in the second square of a split gap, with an empty square before it', () => {
    expect(show(moveToSpace(layout, 'streak', { ...rowGap, size: 'small', offset: 1 })))
      .toEqual(['playing:half', 'empty:small', 'achievements:small', 'completed_this_year:small', 'finish_rate:small', 'empty:small', 'streak:small'])
  })

  it('takes the space size when the card comes in it', () => {
    expect(moveToSpace(layout, 'streak', rowGap).at(-1)).toEqual({ card: 'streak', size: 'half' })
  })

  it('fills a kept empty space in place, leaving the rest of it empty', () => {
    const holed = moveToSpace(layout, 'streak', { ...rowGap, size: 'small' })
    // Achievements into the empty square Play streak left.
    expect(show(moveToSpace(holed, 'achievements', { at: 1, size: 'small', root: 'small', offset: 0, slot: 1 })))
      .toEqual(['playing:half', 'achievements:small', 'empty:small', 'completed_this_year:small', 'finish_rate:small', 'streak:small'])
    // A full-width kept space: a square in its third column.
    const wide: ProfileLayout = [{ card: 'empty', size: 'full' }, { card: 'genres', size: 'half' }]
    expect(show(addToSpace(wide, { at: 0, size: 'small', root: 'full', offset: 2, slot: 0 }, 'streak', 'small')))
      .toEqual(['empty:half', 'streak:small', 'empty:small', 'genres:half'])
  })

  it('leaves a card that does not fit where it was', () => {
    expect(moveToSpace(layout, 'playing', { ...rowGap, size: 'small', offset: 1 })).toBe(layout)
    expect(moveToSpace(layout, 'genres', rowGap)).toBe(layout)
  })

  it('shows a kept empty space as a space in the grid, and drops empty spaces at the end', () => {
    const holed = moveToSpace(layout, 'streak', { ...rowGap, size: 'small' })
    expect(gridEntries(holed)[1]).toEqual({ kind: 'space', at: 1, size: 'small', slot: 1, row: 0 })
    expect(show(trimEmpties([...holed, { card: 'empty', size: 'half' }]))).toEqual(show(holed))
  })

  it('keeps empty spaces through normalising, and drops ones at the end', () => {
    expect(show(normaliseLayout([{ card: 'empty', size: 'small' }, { card: 'streak', size: 'small' }, { card: 'empty', size: 'half' }])))
      .toEqual(['empty:small', 'streak:small'])
    expect(normaliseLayout([{ card: 'empty', size: 'huge' }, { card: 'streak', size: 'small' }])).toEqual(L(['streak', 'small']))
  })

  it('adds a card in a gap at the spot clicked; one too big goes in before it', () => {
    expect(show(addToSpace(layout, { ...rowGap, size: 'small', offset: 1 }, 'up_next', 'half')))
      .toEqual([...show(layout), 'up_next:half'])
    expect(show(addToSpace(layout, { ...rowGap, size: 'small', offset: 1 }, 'year', 'full')))
      .toEqual([...show(layout), 'year:full'])
    expect(show(addToSpace(layout, { ...rowGap, size: 'small', offset: 1 }, 'genres', 'half')).slice(-2))
      .toEqual(['finish_rate:small', 'genres:half'])
  })
})

describe('no row without a card', () => {
  const show = (l: ProfileLayout) => l.map(i => `${i.card}:${i.size}`)
  const E = (size: 'small' | 'half' | 'full') => ({ card: 'empty', size }) as const

  it('drops a row made only of empty spaces, and keeps rows with a card', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, E('half'),
      E('small'), E('small'), E('half'),
      E('full'),
      E('small'), { card: 'streak', size: 'small' },
    ]
    expect(show(trimEmpties(layout))).toEqual(['playing:half', 'empty:half', 'empty:small', 'streak:small'])
    // The rows that stay keep their cards: each row's cards, before and after.
    const rowsOf = (l: ProfileLayout) => {
      const out: string[][] = []
      let col = 4
      for (const i of l) {
        const w = { full: 4, half: 2, small: 1 }[i.size]
        if (col + w > 4) { out.push([]); col = 0 }
        if (i.card !== 'empty') out[out.length - 1].push(i.card)
        col += w
      }
      return out.filter(r => r.length > 0)
    }
    const gappy: ProfileLayout = [{ card: 'playing', size: 'half' }, E('full'), { card: 'streak', size: 'small' }, E('full'), { card: 'genres', size: 'half' }]
    expect(rowsOf(trimEmpties(gappy))).toEqual(rowsOf(gappy))
  })

  it('drops the row a card is dragged out of when nothing else is in it', () => {
    // Row 1: Currently playing, Finish rate and a square gap. Row 2: Year alone. Row 3: Play streak alone.
    const layout: ProfileLayout = [{ card: 'playing', size: 'half' }, { card: 'finish_rate', size: 'small' }, { card: 'year', size: 'full' }, { card: 'streak', size: 'small' }]
    // Play streak into the square gap in row 1: row 3 would be empty, so it goes.
    expect(show(moveToSpace(layout, 'streak', { at: 2, size: 'small', root: 'small', offset: 0 })))
      .toEqual(['playing:half', 'finish_rate:small', 'streak:small', 'year:full'])
    // Year into the space after Play streak: row 2 would be empty, so it goes,
    // and row 1 keeps its gap so Play streak doesn't slide up into it.
    expect(show(moveToSpace(layout, 'year', { at: 4, size: 'full', root: 'full', offset: 0 })))
      .toEqual(['playing:half', 'finish_rate:small', 'empty:small', 'streak:small', 'year:full'])
  })

  it('also when a card is removed, or a saved layout has one', () => {
    const layout: ProfileLayout = [{ card: 'playing', size: 'half' }, E('half'), E('small'), { card: 'streak', size: 'small' }]
    expect(show(removeCard(layout, 'streak'))).toEqual(['playing:half'])
    expect(show(normaliseLayout([E('full'), { card: 'streak', size: 'small' }]))).toEqual(['streak:small'])
  })
})

describe('moving a card to a row of its own', () => {
  const show = (l: ProfileLayout) => l.map(i => `${i.card}:${i.size}`)
  // The cards in each row, ignoring empty spaces.
  const rows = (l: ProfileLayout) => layoutRows(l).map(r => r.map(i => l[i].card).filter(c => c !== 'empty')).filter(r => r.length > 0)
  // Row 1: four squares. Row 2: two halves. Row 3: Play calendar. Row 4: Game shelf.
  const layout: ProfileLayout = [
    { card: 'streak', size: 'small' }, { card: 'completed_this_year', size: 'small' }, { card: 'finish_rate', size: 'small' }, { card: 'achievements', size: 'small' },
    { card: 'recently_completed', size: 'half' }, { card: 'playing', size: 'half' },
    { card: 'calendar', size: 'full' },
    { card: 'shelf', size: 'full' },
  ]

  it('puts a full-width card at the very top, every other row unchanged', () => {
    expect(rows(moveToRow(layout, 'shelf', 0))).toEqual([
      ['shelf'], ['streak', 'completed_this_year', 'finish_rate', 'achievements'], ['recently_completed', 'playing'], ['calendar'],
    ])
  })

  it('gives a smaller card a row of its own, closed off so the next row stays apart', () => {
    const moved = moveToRow(layout, 'playing', 0)
    expect(rows(moved)).toEqual([
      ['playing'], ['streak', 'completed_this_year', 'finish_rate', 'achievements'], ['recently_completed'], ['calendar'], ['shelf'],
    ])
    expect(show(moved).slice(0, 2)).toEqual(['playing:half', 'empty:half'])
  })

  it('in the middle or at the end too, and the row before keeps its gap', () => {
    // Play streak out of row 1 to between the halves and the calendar.
    expect(rows(moveToRow(layout, 'streak', 2))).toEqual([
      ['completed_this_year', 'finish_rate', 'achievements'], ['recently_completed', 'playing'], ['streak'], ['calendar'], ['shelf'],
    ])
    expect(rows(moveToRow(layout, 'calendar', 9))).toEqual([
      ['streak', 'completed_this_year', 'finish_rate', 'achievements'], ['recently_completed', 'playing'], ['shelf'], ['calendar'],
    ])
    // A square after a row with room left would join it, so that row is closed off.
    const short: ProfileLayout = [{ card: 'playing', size: 'half' }, { card: 'year', size: 'full' }, { card: 'streak', size: 'small' }]
    expect(rows(moveToRow(short, 'streak', 1))).toEqual([['playing'], ['streak'], ['year']])
  })

  it('changes nothing when the card is already alone in that place', () => {
    expect(moveToRow(layout, 'calendar', 2)).toBe(layout)
    expect(moveToRow(layout, 'genres', 0)).toBe(layout)
  })

  it('dropped on a card of the same size they swap; a different size takes a row before it', () => {
    expect(show(dropOnCard(layout, 'shelf', 'calendar')).slice(-2)).toEqual(['shelf:full', 'calendar:full'])
    expect(show(dropOnCard(layout, 'achievements', 'streak')).slice(0, 4))
      .toEqual(['achievements:small', 'completed_this_year:small', 'finish_rate:small', 'streak:small'])
    // Play calendar dropped on Completed this year: a row of its own above row 1.
    expect(rows(dropOnCard(layout, 'calendar', 'completed_this_year'))).toEqual([
      ['calendar'], ['streak', 'completed_this_year', 'finish_rate', 'achievements'], ['recently_completed', 'playing'], ['shelf'],
    ])
  })
})

describe('swapping a half card and a square', () => {
  const show = (l: ProfileLayout) => l.map(i => `${i.card}:${i.size}`)
  // The cards and spaces in each row, as the grid lays them out.
  const rows = (l: ProfileLayout) => layoutRows(l).map(r => r.map(i => l[i].card))
  const E = 'empty'

  it('a half dropped on two squares swaps with the pair; nothing else moves', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, { card: 'streak', size: 'small' }, { card: 'achievements', size: 'small' },
      { card: 'finish_rate', size: 'small' }, { card: 'completed_this_year', size: 'small' }, { card: 'genres', size: 'half' },
      { card: 'calendar', size: 'full' },
    ]
    expect(cardDrop(layout, 'playing', 'finish_rate')).toBe('swap-pair')
    expect(rows(dropOnCard(layout, 'playing', 'finish_rate'))).toEqual([
      ['finish_rate', 'completed_this_year', 'streak', 'achievements'], ['playing', 'genres'], ['calendar'],
    ])
    // The same pair dropped on the half, either square: the same swap.
    expect(rows(dropOnCard(layout, 'completed_this_year', 'playing'))).toEqual(rows(dropOnCard(layout, 'playing', 'finish_rate')))
  })

  it('a square with an empty space beside it swaps with a half, leaving the space where the half was', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, { card: 'genres', size: 'half' },
      { card: 'streak', size: 'small' }, { card: 'empty', size: 'small' }, { card: 'platforms', size: 'half' },
    ]
    expect(cardDrop(layout, 'streak', 'playing')).toBe('swap')
    expect(rows(dropOnCard(layout, 'streak', 'playing'))).toEqual([['streak', E, 'genres'], ['playing', 'platforms']])
    expect(rows(dropOnCard(layout, 'playing', 'streak'))).toEqual([['streak', E, 'genres'], ['playing', 'platforms']])
  })

  it('uses the square to the left when there is none to the right', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, { card: 'streak', size: 'small' }, { card: 'achievements', size: 'small' },
      { card: 'genres', size: 'half' },
    ]
    expect(rows(dropOnCard(layout, 'genres', 'achievements'))).toEqual([['playing', 'genres'], ['streak', 'achievements']])
  })

  it('counts the unfilled end of a row as the space beside the square', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, { card: 'streak', size: 'small' },
      { card: 'genres', size: 'half' }, { card: 'platforms', size: 'half' },
    ]
    expect(rows(dropOnCard(layout, 'genres', 'streak'))).toEqual([['playing', 'genres'], ['streak', E, 'platforms']])
  })

  it('a square between two halves has no half-width space: a new row instead', () => {
    const layout: ProfileLayout = [
      { card: 'streak', size: 'small' }, { card: 'playing', size: 'half' }, { card: 'achievements', size: 'small' },
      { card: 'genres', size: 'half' }, { card: 'platforms', size: 'half' },
    ]
    expect(cardDrop(layout, 'genres', 'streak')).toBe('new-row')
    expect(cardDrop(layout, 'streak', 'genres')).toBe('new-row')
  })

  it('every row keeps its width, so nothing slides between rows', () => {
    const layout: ProfileLayout = [
      { card: 'playing', size: 'half' }, { card: 'streak', size: 'small' }, { card: 'achievements', size: 'small' },
      { card: 'finish_rate', size: 'small' }, { card: 'empty', size: 'small' }, { card: 'genres', size: 'half' },
      { card: 'calendar', size: 'full' },
    ]
    const before = rows(layout).length
    for (const [a, b] of [['playing', 'finish_rate'], ['finish_rate', 'genres'], ['streak', 'genres']] as const) {
      const after = dropOnCard(layout, a, b)
      expect(rows(after).length).toBe(before)
      expect(show(after).filter(x => !x.startsWith('empty'))).toHaveLength(6)
    }
  })

  it('a full card still takes a new row', () => {
    const layout: ProfileLayout = [{ card: 'streak', size: 'small' }, { card: 'calendar', size: 'full' }]
    expect(cardDrop(layout, 'calendar', 'streak')).toBe('new-row')
  })
})
