/**
 * The cards on a profile (public edition, `FEATURES.newProfile`).
 *
 * Under the profile card, which never moves, each person picks which cards to
 * show and in what order. The grid has four columns: a card is full width (a
 * whole row), half (two columns) or a square (one); some come in more than
 * one size. The layout is stored as an ordered
 * list in `profiles.profile_layout` (db/profile-cards.sql). Everything here is
 * pure: the page, the editor and the save action all go through it, so a
 * layout means the same thing everywhere.
 */
import type { PrivacyKey } from './friends'

export type CardSize = 'full' | 'half' | 'small'

/** Columns each size takes, of the grid's four. */
export const CARD_COLUMNS: Record<CardSize, number> = { full: 4, half: 2, small: 1 }
const GRID_COLUMNS = 4
const SIZES: readonly CardSize[] = ['full', 'half', 'small']

export const PROFILE_CARD_IDS = [
  'playing',
  'recently_completed',
  'up_next',
  'year',
  'calendar',
  'shelf',
  'finish_rate',
  'achievements',
  'genres',
  'platforms',
  'streak',
  'completed_this_year',
] as const

export type ProfileCardId = (typeof PROFILE_CARD_IDS)[number]

export type ProfileCardDef = {
  id: ProfileCardId
  name: string
  description: string
  /** The sizes it comes in, largest first. */
  sizes: readonly CardSize[]
  /** The privacy setting that hides it from viewers it doesn't allow. */
  privacy: PrivacyKey
}

export const PROFILE_CARDS: Record<ProfileCardId, ProfileCardDef> = {
  playing: {
    id: 'playing', name: 'Currently playing', description: 'The games you’re playing, and what’s on right now.',
    sizes: ['half'], privacy: 'privacy_activity',
  },
  recently_completed: {
    id: 'recently_completed', name: 'Recently completed', description: 'The last games you finished.',
    sizes: ['full', 'half'], privacy: 'privacy_games',
  },
  up_next: {
    id: 'up_next', name: 'Up next', description: 'The newest games in your backlog.',
    sizes: ['full', 'half'], privacy: 'privacy_games',
  },
  year: {
    id: 'year', name: 'Your year', description: 'Tracked hours each month for the last 12 months.',
    sizes: ['full'], privacy: 'privacy_activity',
  },
  calendar: {
    id: 'calendar', name: 'Play calendar', description: 'Every day of the last year, shaded by the hours tracked.',
    sizes: ['full'], privacy: 'privacy_activity',
  },
  shelf: {
    id: 'shelf', name: 'Game shelf', description: 'Completed games you choose, on show in a lit glass case.',
    sizes: ['full'], privacy: 'privacy_games',
  },
  finish_rate: {
    id: 'finish_rate', name: 'Finish rate', description: 'How many of the games you stopped you finished.',
    sizes: ['small'], privacy: 'privacy_games',
  },
  achievements: {
    id: 'achievements', name: 'Achievements', description: 'How many you’ve unlocked, and the XP.',
    sizes: ['half', 'small'], privacy: 'privacy_achievements',
  },
  genres: {
    id: 'genres', name: 'Favourite genres', description: 'The genres you play most.',
    sizes: ['half'], privacy: 'privacy_games',
  },
  platforms: {
    id: 'platforms', name: 'Platforms', description: 'Where you play.',
    sizes: ['half'], privacy: 'privacy_games',
  },
  streak: {
    id: 'streak', name: 'Play streak', description: 'Days in a row with tracked play, and your best.',
    sizes: ['half', 'small'], privacy: 'privacy_activity',
  },
  completed_this_year: {
    id: 'completed_this_year', name: 'Completed this year', description: 'Games finished so far this year.',
    sizes: ['half', 'small'], privacy: 'privacy_games',
  },
}

/**
 * A card in the layout. `games`: the Game shelf's chosen games (game ids, in
 * shelf order); without it the shelf shows the latest completions.
 */
export type LayoutItem = { card: ProfileCardId; size: CardSize; games?: string[] }

/** How many games fit on the Game shelf. */
export const SHELF_MAX = 7
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The shelf's game ids, made safe: ids only, each once, at most SHELF_MAX. */
export function normaliseShelfGames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && UUID.test(id)))).slice(0, SHELF_MAX)
}
/**
 * An empty space kept in the layout, so the cards after it stay where they
 * are: what a card leaves behind when it's dragged into another space. Shown
 * as a space in edit mode and as nothing (but still taking its room) to
 * everyone else.
 */
export type EmptySlot = { card: 'empty'; size: CardSize }
export type ProfileLayout = (LayoutItem | EmptySlot)[]

export function isCardItem(item: LayoutItem | EmptySlot): item is LayoutItem {
  return item.card !== 'empty'
}

/** Every card at most once, plus empty spaces between them. */
export const MAX_LAYOUT_ENTRIES = 40

/** What a profile shows until its owner changes it. */
export const DEFAULT_LAYOUT: ProfileLayout = [
  { card: 'playing', size: 'half' },
  { card: 'finish_rate', size: 'small' },
  { card: 'achievements', size: 'small' },
  { card: 'streak', size: 'small' },
  { card: 'completed_this_year', size: 'small' },
  { card: 'genres', size: 'half' },
  { card: 'recently_completed', size: 'half' },
  { card: 'platforms', size: 'half' },
]

export function isProfileCardId(value: unknown): value is ProfileCardId {
  return typeof value === 'string' && (PROFILE_CARD_IDS as readonly string[]).includes(value)
}

export function canBe(card: ProfileCardId, size: CardSize): boolean {
  return PROFILE_CARDS[card].sizes.includes(size)
}

/**
 * A stored or submitted layout, made safe: unknown cards and repeats are
 * dropped, a card at a size it doesn't come in (any more) takes its largest
 * one, and it's capped. `null`/missing (never
 * edited) or anything that isn't a list gives the default. An empty list is
 * kept: someone may want no cards at all.
 */
export function normaliseLayout(raw: unknown): ProfileLayout {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT.map(item => ({ ...item }))
  const seen = new Set<ProfileCardId>()
  const layout: ProfileLayout = []
  for (const entry of raw) {
    if (layout.length >= MAX_LAYOUT_ENTRIES) break
    if (!entry || typeof entry !== 'object') continue
    const { card, size } = entry as { card?: unknown; size?: unknown }
    if (!SIZES.includes(size as CardSize)) continue
    if (card === 'empty') {
      layout.push({ card, size: size as CardSize })
      continue
    }
    if (!isProfileCardId(card) || seen.has(card)) continue
    seen.add(card)
    const item: LayoutItem = { card, size: canBe(card, size as CardSize) ? size as CardSize : PROFILE_CARDS[card].sizes[0] }
    if (card === 'shelf') {
      const games = normaliseShelfGames((entry as { games?: unknown }).games)
      if (games.length > 0) item.games = games
    }
    layout.push(item)
  }
  return trimEmpties(layout)
}

/**
 * Tidies the kept empty spaces: a row with no card in it goes (every row has
 * at least one card), and so do empty spaces at the very end, which hold
 * nothing in place. Rows are worked out the way the grid lays them out: in
 * order, a card that doesn't fit in what's left of a row starting the next.
 */
export function trimEmpties(layout: ProfileLayout): ProfileLayout {
  const rows: ProfileLayout[] = []
  let column = GRID_COLUMNS
  for (const item of layout) {
    const width = CARD_COLUMNS[item.size]
    if (column + width > GRID_COLUMNS) {
      rows.push([])
      column = 0
    }
    rows[rows.length - 1].push(item)
    column += width
  }
  const keptRows = rows.filter(row => row.some(isCardItem))
  // With a row gone, the next one could slide up into the gap at the end of
  // the row before it: fill that gap with empty spaces so every card stays
  // in its own row. (Without a row gone this never triggers: a card that
  // fitted would already have been in that row.)
  const kept: ProfileLayout = []
  keptRows.forEach((row, i) => {
    kept.push(...row)
    const next = keptRows[i + 1]
    const used = row.reduce((sum, item) => sum + CARD_COLUMNS[item.size], 0)
    if (next && used + CARD_COLUMNS[next[0].size] <= GRID_COLUMNS) kept.push(...emptiesFor(GRID_COLUMNS - used, used))
  })
  let end = kept.length
  while (end > 0 && kept[end - 1].card === 'empty') end--
  const tidy = kept.slice(0, end)
  return sameLayout(tidy, layout) ? layout : tidy
}

/**
 * Where everything sits in the four-column grid, in edit mode: each card, the
 * empty spaces a row is left with when the next card doesn't fit in it (or
 * the layout ends), and one full-width space at the end while there are cards
 * left to add. `at` is where a card added in that space goes in the layout.
 *
 * Cards fill a row in order; one that doesn't fit in what's left starts the
 * next row. That's exactly how a CSS grid with full = 4 columns, half = 2 and
 * square = 1 places them, so the page needs no other maths. A gap is offered
 * as half spaces where one lines up with the halves of the row, else squares.
 */
export type GridEntry =
  | { kind: 'card'; index: number; item: LayoutItem; row: number }
  /** `slot`: the layout index of a kept empty space (else it's a row's leftover gap). */
  | { kind: 'space'; at: number; size: CardSize; slot?: number; row: number }

export function gridEntries(layout: ProfileLayout): GridEntry[] {
  const entries: GridEntry[] = []
  let column = 0
  let row = 0
  const fillRow = (at: number) => {
    if (column === 0) return
    while (column < GRID_COLUMNS) {
      const size: CardSize = column % 2 === 0 ? 'half' : 'small'
      entries.push({ kind: 'space', at, size, row })
      column += CARD_COLUMNS[size]
    }
    column = 0
    row++
  }
  layout.forEach((item, index) => {
    const width = CARD_COLUMNS[item.size]
    if (column + width > GRID_COLUMNS) fillRow(index)
    entries.push(isCardItem(item) ? { kind: 'card', index, item, row } : { kind: 'space', at: index, size: item.size, slot: index, row })
    column += width
    if (column === GRID_COLUMNS) {
      column = 0
      row++
    }
  })
  fillRow(layout.length)
  if (cardsToAdd(layout).length > 0) entries.push({ kind: 'space', at: layout.length, size: 'full', row })
  return entries
}

/**
 * What an empty space splits into, in edit mode: a full-width space into two
 * halves, a half into two squares. A square doesn't split.
 */
export function splitSize(size: CardSize): CardSize | null {
  return size === 'full' ? 'half' : size === 'half' ? 'small' : null
}

/** The cards that aren't on the profile yet, in catalogue order. */
export function cardsToAdd(layout: ProfileLayout): ProfileCardId[] {
  const used = new Set(layout.map(item => item.card))
  return PROFILE_CARD_IDS.filter(id => !used.has(id))
}

/**
 * The size a card goes in at, in a space of `space` size: the space's size if
 * the card comes in it, else the card's largest (a card too big for the space
 * starts the next row, and the cards after it move down).
 */
export function sizeForSpace(card: ProfileCardId, space: CardSize): CardSize {
  return canBe(card, space) ? space : PROFILE_CARDS[card].sizes[0]
}

/**
 * A place to put a card: an empty space in the editor, or one of its halves
 * or squares once split. `root` is the space's own size and `offset` how many
 * columns into it this part starts; `size` is the part's size. `slot` is set
 * for a kept empty space (it's replaced), else the card goes in at `at`.
 */
export type SpaceTarget = { at: number; size: CardSize; root: CardSize; offset: number; slot?: number }

/** Empty spaces filling `columns` columns from `start`: halves where they line up, else squares. */
function emptiesFor(columns: number, start: number): EmptySlot[] {
  const out: EmptySlot[] = []
  for (let col = start, left = columns; left > 0;) {
    const size: CardSize = col % 2 === 0 && left >= 2 ? 'half' : 'small'
    out.push({ card: 'empty', size })
    col += CARD_COLUMNS[size]
    left -= CARD_COLUMNS[size]
  }
  return out
}

/**
 * Puts `item` exactly where `target` is, leaving every other card where it
 * was: the space before it in that spot becomes empty spaces, and so does
 * what's left after it in a kept space. Unchanged if it doesn't fit.
 */
function fillSpace(layout: ProfileLayout, target: SpaceTarget, item: LayoutItem): ProfileLayout {
  const width = CARD_COLUMNS[item.size]
  const room = CARD_COLUMNS[target.root]
  if (target.offset + width > room) return layout
  const before = emptiesFor(target.offset, 0)
  if (target.slot != null) {
    if (layout[target.slot]?.card !== 'empty') return layout
    const after = emptiesFor(room - target.offset - width, target.offset + width)
    return trimEmpties([...layout.slice(0, target.slot), ...before, item, ...after, ...layout.slice(target.slot + 1)])
  }
  const index = Math.max(0, Math.min(target.at, layout.length))
  return [...layout.slice(0, index), ...before, item, ...layout.slice(index)]
}

/**
 * Adds a card in an empty space (or part of one), in place. A card too big
 * for it goes in before it instead, and the cards after it move along.
 */
export function addToSpace(layout: ProfileLayout, target: SpaceTarget, card: ProfileCardId, size: CardSize): ProfileLayout {
  if (layout.some(item => item.card === card) || !canBe(card, size)) return layout
  const placed = fillSpace(layout, target, { card, size })
  return placed !== layout ? placed : addCard(layout, target.at, card, size)
}

export function addCard(layout: ProfileLayout, at: number, card: ProfileCardId, size: CardSize): ProfileLayout {
  if (layout.some(item => item.card === card) || !canBe(card, size)) return layout
  const index = Math.max(0, Math.min(at, layout.length))
  return [...layout.slice(0, index), { card, size }, ...layout.slice(index)]
}

export function removeCard(layout: ProfileLayout, card: ProfileCardId): ProfileLayout {
  return trimEmpties(layout.filter(item => item.card !== card))
}

export function setSize(layout: ProfileLayout, card: ProfileCardId, size: CardSize): ProfileLayout {
  if (!canBe(card, size)) return layout
  return layout.map(item => (item.card === card ? { ...item, size } : item))
}

/** Moves `card` to where `target` is now; the cards between shift along. */
export function moveCard(layout: ProfileLayout, card: ProfileCardId, target: ProfileCardId): ProfileLayout {
  const from = layout.findIndex(item => item.card === card)
  const to = layout.findIndex(item => item.card === target)
  if (from < 0 || to < 0 || from === to) return layout
  const next = [...layout]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Moves `card` into an empty space (dropped there in the editor) without
 * moving any other card: the card takes the space's size when it comes in
 * it, and the place it left becomes an empty space of its old size. A card
 * too big for the space stays where it was.
 */
export function moveToSpace(layout: ProfileLayout, card: ProfileCardId, target: SpaceTarget): ProfileLayout {
  const from = layout.findIndex(item => item.card === card)
  const item = layout[from]
  if (!item || !isCardItem(item)) return layout
  const moved: LayoutItem = canBe(card, target.size) ? { ...item, size: target.size } : item
  const holed: ProfileLayout = layout.map((entry, i) => (i === from ? { card: 'empty', size: item.size } : entry))
  const placed = fillSpace(holed, target, moved)
  return placed === holed ? layout : trimEmpties(placed)
}

/** The layout's rows as the grid lays them out: each a list of layout indexes. */
export function layoutRows(layout: ProfileLayout): number[][] {
  const rows: number[][] = []
  let column = GRID_COLUMNS
  layout.forEach((item, index) => {
    const width = CARD_COLUMNS[item.size]
    if (column + width > GRID_COLUMNS) {
      rows.push([])
      column = 0
    }
    rows[rows.length - 1].push(index)
    column += width
  })
  return rows
}

/**
 * Moves `card` into a new row of its own, before row `row` (or after the
 * last). Every other row keeps exactly its cards: the place the card left
 * becomes an empty space (and its row goes if that leaves it without a card),
 * and the new row is closed off with empty spaces so nothing joins it.
 */
export function moveToRow(layout: ProfileLayout, card: ProfileCardId, row: number): ProfileLayout {
  const from = layout.findIndex(item => item.card === card)
  const item = layout[from]
  if (!item || !isCardItem(item)) return layout
  const holed: ProfileLayout = layout.map((entry, i) => (i === from ? { card: 'empty', size: item.size } : entry))
  const rows = layoutRows(holed)
  const at = Math.max(0, Math.min(row, rows.length))
  const start = at < rows.length ? rows[at][0] : holed.length
  const width = CARD_COLUMNS[item.size]
  // The row before keeps its gap: the card would otherwise fit in it.
  const before = rows[at - 1]
  const used = before ? before.reduce((sum, i) => sum + CARD_COLUMNS[holed[i].size], 0) : GRID_COLUMNS
  const padBefore = used + width <= GRID_COLUMNS ? emptiesFor(GRID_COLUMNS - used, used) : []
  const padAfter = at < rows.length ? emptiesFor(GRID_COLUMNS - width, width) : []
  const next = trimEmpties([...holed.slice(0, start), ...padBefore, item, ...padAfter, ...holed.slice(start)])
  return sameLayout(next, layout) ? layout : next
}

/**
 * A card dropped on another: the same size, they swap places; otherwise the
 * dragged card takes a new row just before the other card's row. Either way
 * no row loses or gains any other card.
 */
export function dropOnCard(layout: ProfileLayout, card: ProfileCardId, target: ProfileCardId): ProfileLayout {
  const from = layout.findIndex(item => item.card === card)
  const to = layout.findIndex(item => item.card === target)
  if (from < 0 || to < 0 || from === to) return layout
  if (layout[from].size === layout[to].size) {
    const next = [...layout]
    ;[next[from], next[to]] = [next[to], next[from]]
    return next
  }
  const row = layoutRows(layout).findIndex(indexes => indexes.includes(to))
  return moveToRow(layout, card, row)
}

/** Moves a card one place earlier (-1) or later (+1), for the keyboard. */
export function nudgeCard(layout: ProfileLayout, card: ProfileCardId, by: -1 | 1): ProfileLayout {
  const from = layout.findIndex(item => item.card === card)
  const to = from + by
  if (from < 0 || to < 0 || to >= layout.length) return layout
  const next = [...layout]
  ;[next[from], next[to]] = [next[to], next[from]]
  return trimEmpties(next)
}

export function sameLayout(a: ProfileLayout, b: ProfileLayout): boolean {
  const games = (item: LayoutItem | EmptySlot) => (isCardItem(item) ? item.games ?? [] : []).join()
  return a.length === b.length && a.every((item, i) =>
    item.card === b[i].card && item.size === b[i].size && games(item) === games(b[i]))
}

/** Sets the Game shelf's games (an empty list goes back to the latest completions). */
export function setShelfGames(layout: ProfileLayout, games: string[]): ProfileLayout {
  const chosen = normaliseShelfGames(games)
  return layout.map(item => {
    if (item.card !== 'shelf' || !isCardItem(item)) return item
    const { games: _old, ...rest } = item
    return chosen.length > 0 ? { ...rest, games: chosen } : rest
  })
}

/**
 * What the shelf shows: the chosen games in their order (ones no longer
 * completed or no longer there are skipped), else the latest completions.
 * `completed` is newest first.
 */
export function shelfGames<G extends { id: string }>(completed: G[], chosen: string[] | undefined): G[] {
  if (!chosen || chosen.length === 0) return completed.slice(0, SHELF_MAX)
  const byId = new Map(completed.map(g => [g.id, g]))
  return chosen.flatMap(id => byId.get(id) ?? [])
}

// ── What the cards show ───────────────────────────────────────────────────
// Loaded on the server (lib/data/profile-cards.ts) and handed to the page's
// client component, so a card can switch size or be added in edit mode
// without another trip. Only cards the viewer may see are filled in.

/**
 * How big the Play streak's flame is (0 = not lit) and how strongly it glows,
 * each 0 to 1. It grows quickly over the first days and is full size by 30,
 * so a week-long streak already looks like something.
 */
export function streakFlame(days: number): { size: number; glow: number } {
  if (!(days >= 1)) return { size: 0, glow: 0 }
  const grown = Math.min(1, Math.log(days) / Math.log(30))
  return { size: 0.6 + 0.4 * grown, glow: Math.min(1, Math.log(days + 1) / Math.log(31)) }
}

export type PlayingGame = CardGame & { liveSince: string | null; platform: string | null; startedOn: string | null }

/**
 * The Currently playing card's games in the order it shows them: the
 * spotlight first (a game running right now, the most recently started if
 * several are; else the first, the latest started), then the rest as loaded.
 */
export function spotlightOrder<T extends { liveSince: string | null }>(games: T[]): T[] {
  const live = games.filter(g => g.liveSince).sort((a, b) => b.liveSince!.localeCompare(a.liveSince!))[0]
  if (!live) return games
  return [live, ...games.filter(g => g !== live)]
}

/** How many genres the Favourite genres card shows. */
export const GENRE_BLOCKS_MAX = 4

/** IGDB's genre names without their bracketed abbreviation: "Role-playing (RPG)" → "Role-playing". */
export function shortGenre(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name
}

export type GenreBlock = { name: string; count: number }
export type GenreColumn = { weight: number; blocks: (GenreBlock & { weight: number })[] }

/**
 * The Favourite genres card's blocks, as columns (widths) of stacked blocks
 * (heights), so each block's area follows its game count: the top two genres
 * get a full-height column each, and the third and fourth share the last
 * column. No block shrinks below `MIN_SHARE` of its direction, so a genre
 * with one game still has room for its name.
 */
export function genreColumns(items: GenreBlock[]): GenreColumn[] {
  const top = items.filter(i => i.count > 0).slice(0, GENRE_BLOCKS_MAX)
  const MIN_SHARE = 0.18
  const floor = (weights: number[]) => {
    const total = weights.reduce((a, b) => a + b, 0) || 1
    return weights.map(w => Math.max(MIN_SHARE, w / total))
  }
  const groups = top.length <= 3 ? top.map(i => [i]) : [[top[0]], [top[1]], top.slice(2)]
  const widths = floor(groups.map(g => g.reduce((sum, i) => sum + i.count, 0)))
  return groups.map((group, c) => {
    const heights = floor(group.map(i => i.count))
    return { weight: widths[c], blocks: group.map((i, r) => ({ ...i, weight: heights[r] })) }
  })
}

/** How many finishes the Recently completed timeline shows: full width, and half (or on a phone). */
export const RECENT_COMPLETED_MAX = 8
export const RECENT_COMPLETED_HALF = 4

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** A completion date on the timeline: "30 Sep", with the year when it isn't this year ("30 Sep 2025"). */
export function timelineDate(iso: string | null, thisYear: number): string | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const day = `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]}`
  return Number(m[1]) === thisYear ? day : `${day} ${m[1]}`
}

export type CardGame = {
  id: string
  title: string
  /** Wide art (artwork, else the capsule image). */
  wide: string | null
  /** Box art (cover, else the capsule image). */
  cover: string | null
  hours: number | null
}

export type ProfileCardData = {
  playing?: PlayingGame[]
  recently_completed?: (CardGame & { completedOn: string | null })[]
  up_next?: CardGame[]
  year?: { bars: { start: string; minutes: number }[]; totalMinutes: number }
  finish_rate?: { rate: number | null; completed: number; stopped: number }
  /** Completed games, newest first: all of them for the owner (to choose from), else only what the shelf shows. */
  shelf?: (CardGame & { completedOn: string | null })[]
  /** Tracked minutes per UK day from `start` (a Monday, 52 weeks before this week's) to today. */
  calendar?: { start: string; minutes: number[] }
  /** `total`: every achievement there is in this edition. */
  achievements?: { unlocked: number; xp: number; total: number }
  genres?: { name: string; count: number }[]
  /** The top few platforms, and how many games have a platform at all (for each one's share). */
  platforms?: { top: { name: string; count: number }[]; total: number }
  /** `week`: the last 7 UK days, oldest first, whether each had play. */
  streak?: { current: number; best: number }
  /** `months`: completions in each month of the year, January first. */
  completed_this_year?: { year: number; count: number; months: number[]; month: number }
}

// ── Play calendar ─────────────────────────────────────────────────────────

const DAY_MS = 86_400_000
const addDays = (day: string, by: number) => new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10)

/**
 * The Play calendar's days: from the Monday 52 weeks before this week's
 * Monday, through `today` (both UK days, YYYY-MM-DD), so the grid is 53 week
 * columns with this week's partly filled. `minutesByDay` has each day's
 * tracked minutes; days without any are 0.
 */
export function calendarDays(minutesByDay: ReadonlyMap<string, number>, today: string): { start: string; minutes: number[] } {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
  const start = addDays(today, -weekday - 52 * 7)
  const minutes: number[] = []
  for (let day = start; day <= today; day = addDays(day, 1)) minutes.push(minutesByDay.get(day) ?? 0)
  return { start, minutes }
}

/** How dark a day is: 0 none, then under 1h, 1–2h, 2–4h, 4h or more. */
export function playLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0
  if (minutes < 60) return 1
  if (minutes < 120) return 2
  if (minutes < 240) return 3
  return 4
}

export function shiftDay(day: string, by: number): string {
  return addDays(day, by)
}

/** The bio as stored: trimmed, line breaks folded to spaces, at most this long. */
export const MAX_BIO_LENGTH = 160

export function normaliseBio(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const bio = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_BIO_LENGTH).trim()
  return bio === '' ? null : bio
}
