import { describe, it, expect } from 'vitest'
import { menuMoves, moveWarning, statusChangeEffects, isQuickStatus, deleteWarning } from '../game-quick-actions'

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
  it('mentions tickets only for a completed game', () => {
    expect(deleteWarning('completed')).toMatch(/tickets/)
    expect(deleteWarning('backlog')).not.toMatch(/tickets/)
  })
})
