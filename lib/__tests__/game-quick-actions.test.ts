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
  it('mentions tickets only for a completed game while the amount is unknown', () => {
    expect(deleteWarning('completed')).toMatch(/tickets/)
    expect(deleteWarning('backlog')).not.toMatch(/tickets/)
    expect(deleteWarning('dnf')).not.toMatch(/tickets/)
  })

  it('names the exact tickets lost and the balance after', () => {
    expect(deleteWarning('completed', { change: -3, balance: 10 }))
      .toMatch(/You lose the 3 tickets you earned for completing it\. Your balance goes from 10 to 7\.$/)
    expect(deleteWarning('completed', { change: -1, balance: 4 })).toMatch(/the 1 ticket you earned/)
  })

  it('shows a balance going below zero with a real minus sign', () => {
    expect(deleteWarning('completed', { change: -3, balance: 0 })).toMatch(/from 0 to −3\.$/)
    expect(deleteWarning('completed', { change: -2, balance: -4 })).toMatch(/from −4 to −6\.$/)
  })

  it('says so when a completed game earned nothing', () => {
    expect(deleteWarning('completed', { change: 0, balance: 5 })).toMatch(/didn't earn any tickets, so your balance stays the same/)
  })

  it('tells a DNF game\'s owner the penalty comes back', () => {
    expect(deleteWarning('dnf', { change: 5, balance: -2 }))
      .toMatch(/The 5 tickets you lost for dropping it are given back\. Your balance goes from −2 to 3\.$/)
    expect(deleteWarning('dnf', { change: 0, balance: 3 })).not.toMatch(/tickets/) // public: no penalty
  })

  it('leaves other statuses alone even with an answer', () => {
    expect(deleteWarning('playing', { change: 0, balance: 3 })).not.toMatch(/tickets/)
  })
})
