import { describe, it, expect } from 'vitest'
import { menuMoves, moveWarning, statusChangeEffects, isQuickStatus, deleteWarning, deleteTicketChange, formatChange, formatBalance } from '../game-quick-actions'

describe('menuMoves', () => {
  it('offers every other status, in a fixed order', () => {
    expect(menuMoves('playing')).toEqual([
      { kind: 'complete' },
      { kind: 'status', to: 'backlog' },
      { kind: 'dnf' },
      { kind: 'status', to: 'ambient' },
    ])
    expect(menuMoves('completed').map(m => m.kind)).toEqual(['status', 'status', 'dnf', 'status'])
    expect(menuMoves('dnf')).not.toContainEqual({ kind: 'dnf' })
  })

  it('offers no Ambient move without Ambient (public edition)', () => {
    expect(menuMoves('playing', false)).toEqual([
      { kind: 'complete' },
      { kind: 'status', to: 'backlog' },
      { kind: 'dnf' },
    ])
    expect(menuMoves('backlog', false).map(m => m.kind === 'status' ? m.to : m.kind)).toEqual(['playing', 'complete', 'dnf'])
  })
})

describe('statusChangeEffects', () => {
  it('matches updateGame’s ledger rules', () => {
    expect(statusChangeEffects('completed', 'playing')).toEqual({ reverseCompletion: true, reverseDnf: false, applyDnf: false })
    expect(statusChangeEffects('completed', 'dnf')).toEqual({ reverseCompletion: true, reverseDnf: false, applyDnf: true })
    expect(statusChangeEffects('dnf', 'backlog')).toEqual({ reverseCompletion: false, reverseDnf: true, applyDnf: false })
    expect(statusChangeEffects('playing', 'backlog')).toEqual({ reverseCompletion: false, reverseDnf: false, applyDnf: false })
    expect(statusChangeEffects('dnf', 'dnf').applyDnf).toBe(false)
  })
})

describe('without a DNF penalty (public edition)', () => {
  it('neither charges nor refunds anything for DNF', () => {
    expect(statusChangeEffects('playing', 'dnf', false)).toEqual({ reverseCompletion: false, reverseDnf: false, applyDnf: false })
    expect(statusChangeEffects('dnf', 'playing', false)).toEqual({ reverseCompletion: false, reverseDnf: false, applyDnf: false })
  })

  it('still takes back a completion’s tickets, so they can’t be earned twice', () => {
    expect(statusChangeEffects('completed', 'dnf', false)).toEqual({ reverseCompletion: true, reverseDnf: false, applyDnf: false })
    expect(moveWarning('completed', 'dnf', false)).toMatch(/takes back the tickets/)
  })

  it('lets a game be dropped without a warning', () => {
    expect(moveWarning('playing', 'dnf', false)).toBeNull()
    expect(moveWarning('playing', 'dnf', true)).toMatch(/DNF ticket penalty/)
  })
})

describe('moveWarning', () => {
  it('asks before anything that costs tickets', () => {
    expect(moveWarning('completed', 'backlog')).toMatch(/takes back the tickets/)
    expect(moveWarning('playing', 'dnf')).toMatch(/DNF ticket penalty/)
    expect(moveWarning('completed', 'dnf')).toMatch(/takes back .* and applies the DNF/)
  })
  it('lets free moves and refunds straight through', () => {
    expect(moveWarning('playing', 'backlog')).toBeNull()
    expect(moveWarning('dnf', 'playing')).toBeNull()
    expect(moveWarning('backlog', 'ambient')).toBeNull()
  })
})

describe('isQuickStatus', () => {
  it('only accepts the statuses the quick action may set directly', () => {
    expect(['playing', 'backlog', 'ambient'].every(isQuickStatus)).toBe(true)
    expect(isQuickStatus('completed')).toBe(false)
    expect(isQuickStatus('dnf')).toBe(false)
    expect(isQuickStatus('nope')).toBe(false)
  })
})

describe('deleteWarning', () => {
  const plain = 'It comes off your list for good, along with its hours and notes.'

  it('is one plain line while checking and once the figures are known', () => {
    expect(deleteWarning('completed')).toBe(plain)
    expect(deleteWarning('completed', { change: -3, balance: 10 })).toBe(plain)
    expect(deleteWarning('backlog', { change: 0, balance: 3 })).toBe(plain)
  })

  it('says the tickets are taken back if the check failed', () => {
    expect(deleteWarning('completed', null)).toMatch(/tickets you earned for completing it are taken back/)
    expect(deleteWarning('playing', null)).toBe(plain)
  })
})

describe('deleteTicketChange', () => {
  it('gives the change and the balance before and after', () => {
    expect(deleteTicketChange({ change: -3, balance: 10 })).toEqual({ change: -3, before: 10, after: 7 })
    expect(deleteTicketChange({ change: 5, balance: -2 })).toEqual({ change: 5, before: -2, after: 3 })
  })

  it('can go below zero', () => {
    expect(deleteTicketChange({ change: -3, balance: 1 })).toEqual({ change: -3, before: 1, after: -2 })
  })

  it('is nothing when nothing changes or nothing is known', () => {
    expect(deleteTicketChange({ change: 0, balance: 5 })).toBeNull()
    expect(deleteTicketChange(null)).toBeNull()
    expect(deleteTicketChange()).toBeNull()
  })
})

describe('formatChange / formatBalance', () => {
  it('use a real minus sign and sign gains', () => {
    expect(formatChange(-3)).toBe('−3')
    expect(formatChange(5)).toBe('+5')
    expect(formatBalance(-2)).toBe('−2')
    expect(formatBalance(0)).toBe('0')
  })
})
