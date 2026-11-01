import { describe, it, expect } from 'vitest'
import { nextWheelTurn, pickWinner, decideWonGameAction } from '../wheel'

describe('nextWheelTurn', () => {
  it('advances spin → spin_reroll', () => {
    expect(nextWheelTurn('spin')).toBe('spin_reroll')
  })

  it('advances spin_reroll → choose', () => {
    expect(nextWheelTurn('spin_reroll')).toBe('choose')
  })

  it('advances choose → spin (cycles back)', () => {
    expect(nextWheelTurn('choose')).toBe('spin')
  })

  it('completes a full cycle correctly', () => {
    const cycle = ['spin', 'spin_reroll', 'choose', 'spin'] as const
    for (let i = 0; i < cycle.length - 1; i++) {
      expect(nextWheelTurn(cycle[i])).toBe(cycle[i + 1])
    }
  })
})

describe('pickWinner', () => {
  it('returns the only game when there is one option', () => {
    expect(pickWinner(['Only Game'])).toBe('Only Game')
  })

  it('always returns one of the provided games', () => {
    const games = ['Game A', 'Game B', 'Game C', 'Game D', 'Game E']
    for (let i = 0; i < 50; i++) {
      expect(games).toContain(pickWinner(games))
    }
  })

  it('can return any game in the list (distribution check)', () => {
    const games = ['A', 'B', 'C']
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(pickWinner(games))
    }
    expect(seen.size).toBe(3)
  })
})

describe('decideWonGameAction', () => {
  it('inserts a plain (non-replay) entry when the game is not owned', () => {
    expect(decideWonGameAction([])).toEqual({ action: 'insert', isReplay: false })
  })

  it('flips a backlog copy into playing', () => {
    expect(decideWonGameAction([{ id: 'b1', status: 'backlog' }]))
      .toEqual({ action: 'flip', gameId: 'b1' })
  })

  it('claims an ambient copy rather than spending the turn on nothing', () => {
    // An ambient game used to fall through to the owned-but-not-completed
    // catch-all and return noop: the turn was consumed and nothing changed.
    // Harmless when ambient did not exist; now the agent files games that way
    // on its own, so it would happen to anything played before the wheel
    // offered it.
    expect(decideWonGameAction([{ id: 'a1', status: 'ambient' }]))
      .toEqual({ action: 'flip', gameId: 'a1' })
  })

  it('prefers a backlog copy over an ambient one', () => {
    expect(decideWonGameAction([
      { id: 'a1', status: 'ambient' },
      { id: 'b1', status: 'backlog' },
    ])).toEqual({ action: 'flip', gameId: 'b1' })
  })

  it('still does nothing when an ambient copy sits beside one being played', () => {
    expect(decideWonGameAction([
      { id: 'a1', status: 'ambient' },
      { id: 'p1', status: 'playing' },
    ])).toEqual({ action: 'noop' })
  })

  it('inserts a replay entry when the game is owned only as completed', () => {
    expect(decideWonGameAction([{ id: 'c1', status: 'completed' }]))
      .toEqual({ action: 'insert', isReplay: true })
  })

  it('inserts a replay entry when there are several completed copies', () => {
    expect(decideWonGameAction([
      { id: 'c1', status: 'completed' },
      { id: 'c2', status: 'completed' },
    ])).toEqual({ action: 'insert', isReplay: true })
  })

  it('is a no-op when the game is already playing (avoids duplicates)', () => {
    expect(decideWonGameAction([{ id: 'p1', status: 'playing' }]))
      .toEqual({ action: 'noop' })
  })

  it('is a no-op when a replay is in progress (completed + playing)', () => {
    expect(decideWonGameAction([
      { id: 'c1', status: 'completed' },
      { id: 'p1', status: 'playing' },
    ])).toEqual({ action: 'noop' })
  })

  it('leaves a dnf-only game untouched', () => {
    expect(decideWonGameAction([{ id: 'd1', status: 'dnf' }]))
      .toEqual({ action: 'noop' })
  })

  it('leaves a game untouched when owned only as dnf alongside... still dnf', () => {
    expect(decideWonGameAction([
      { id: 'd1', status: 'dnf' },
      { id: 'd2', status: 'dnf' },
    ])).toEqual({ action: 'noop' })
  })

  it('starts a replay when owned as completed + dnf (dnf does not block)', () => {
    expect(decideWonGameAction([
      { id: 'd1', status: 'dnf' },
      { id: 'c1', status: 'completed' },
    ])).toEqual({ action: 'insert', isReplay: true })
  })

  it('prefers flipping backlog over starting a completed replay', () => {
    expect(decideWonGameAction([
      { id: 'c1', status: 'completed' },
      { id: 'b1', status: 'backlog' },
    ])).toEqual({ action: 'flip', gameId: 'b1' })
  })

  it('playing takes precedence over an existing backlog copy', () => {
    expect(decideWonGameAction([
      { id: 'b1', status: 'backlog' },
      { id: 'p1', status: 'playing' },
    ])).toEqual({ action: 'noop' })
  })

  it('flips the specific backlog row id, not another status row', () => {
    const result = decideWonGameAction([
      { id: 'c1', status: 'completed' },
      { id: 'b7', status: 'backlog' },
      { id: 'd1', status: 'dnf' },
    ])
    expect(result).toEqual({ action: 'flip', gameId: 'b7' })
  })
})
