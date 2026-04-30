import { describe, it, expect } from 'vitest'
import { nextWheelTurn, pickWinner } from '../wheel'

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
