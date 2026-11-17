/**
 * The rules behind the games list's quick-actions menu (the "⋯" button and
 * right-click on a card): which status moves to offer, which ones need a
 * confirmation, and what each does to the ticket ledger.
 *
 * Kept pure so the ticket side can be tested. The ledger rules mirror
 * `updateGame` exactly — a quick move must never earn or lose tickets a full
 * edit wouldn't.
 */
import type { GameStatus } from './types'

/** Statuses the menu moves to directly. Completed and DNF have their own flows. */
export type QuickStatus = 'playing' | 'backlog' | 'ambient'

export type MenuMove =
  | { kind: 'status'; to: QuickStatus }
  | { kind: 'complete' }
  | { kind: 'dnf' }

const ORDER: GameStatus[] = ['playing', 'completed', 'backlog', 'dnf', 'ambient']

/** The moves to offer for a game, in a fixed order, never its own status. */
export function menuMoves(current: GameStatus): MenuMove[] {
  return ORDER.filter(s => s !== current).map(s =>
    s === 'completed' ? { kind: 'complete' }
      : s === 'dnf' ? { kind: 'dnf' }
      : { kind: 'status', to: s as QuickStatus },
  )
}

export function isQuickStatus(s: unknown): s is QuickStatus {
  return s === 'playing' || s === 'backlog' || s === 'ambient'
}

/** What leaving `from` for `to` does to the ledger (same as `updateGame`). */
export function statusChangeEffects(from: GameStatus, to: GameStatus) {
  return {
    reverseCompletion: from === 'completed' && to !== 'completed',
    reverseDnf: from === 'dnf' && to !== 'dnf',
    applyDnf: from !== 'dnf' && to === 'dnf',
  }
}

/**
 * The confirmation to show before a move, or null when the move can go
 * straight through. Anything that costs tickets asks first; getting tickets
 * back (leaving DNF) doesn't.
 */
export function moveWarning(from: GameStatus, to: GameStatus): string | null {
  const fx = statusChangeEffects(from, to)
  const parts: string[] = []
  if (fx.reverseCompletion) parts.push('takes back the tickets you earned for completing it')
  if (fx.applyDnf) parts.push('applies the DNF ticket penalty')
  if (parts.length === 0) return null
  return `This ${parts.join(' and ')}.`
}

/** The confirmation text for deleting a game. */
export function deleteWarning(status: GameStatus): string {
  return status === 'completed'
    ? 'It comes off your list for good, and the tickets you earned for completing it are taken back.'
    : 'It comes off your list for good, along with its hours and notes.'
}
