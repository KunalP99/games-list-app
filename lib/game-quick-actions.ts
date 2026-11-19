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
import { FEATURES } from './edition'

/** Statuses the menu moves to directly. Completed and DNF have their own flows. */
export type QuickStatus = 'playing' | 'backlog' | 'ambient'

export type MenuMove =
  | { kind: 'status'; to: QuickStatus }
  | { kind: 'complete' }
  | { kind: 'dnf' }

const ORDER: GameStatus[] = ['playing', 'completed', 'backlog', 'dnf', 'ambient']

/**
 * The moves to offer for a game, in a fixed order, never its own status.
 * No "Move to Ambient" in an edition without Ambient (lib/edition.ts).
 */
export function menuMoves(current: GameStatus, withAmbient: boolean = FEATURES.ambient): MenuMove[] {
  return ORDER.filter(s => s !== current && (withAmbient || s !== 'ambient')).map(s =>
    s === 'completed' ? { kind: 'complete' }
      : s === 'dnf' ? { kind: 'dnf' }
      : { kind: 'status', to: s as QuickStatus },
  )
}

export function isQuickStatus(s: unknown): s is QuickStatus {
  return s === 'playing' || s === 'backlog' || s === 'ambient'
}

/**
 * What leaving `from` for `to` does to the ledger (same as `updateGame`).
 * Without a DNF penalty (the public edition, lib/edition.ts) there's none to
 * apply or refund.
 */
export function statusChangeEffects(from: GameStatus, to: GameStatus, withDnfPenalty: boolean = FEATURES.dnfPenalty) {
  return {
    reverseCompletion: from === 'completed' && to !== 'completed',
    reverseDnf: withDnfPenalty && from === 'dnf' && to !== 'dnf',
    applyDnf: withDnfPenalty && from !== 'dnf' && to === 'dnf',
  }
}

/**
 * The confirmation to show before a move, or null when the move can go
 * straight through. Anything that costs tickets asks first; getting tickets
 * back (leaving DNF) doesn't.
 */
export function moveWarning(from: GameStatus, to: GameStatus, withDnfPenalty: boolean = FEATURES.dnfPenalty): string | null {
  const fx = statusChangeEffects(from, to, withDnfPenalty)
  const parts: string[] = []
  if (fx.reverseCompletion) parts.push('takes back the tickets you earned for completing it')
  if (fx.applyDnf) parts.push('applies the DNF ticket penalty')
  if (parts.length === 0) return null
  return `This ${parts.join(' and ')}.`
}

/** The confirmation text for deleting a game. */
/**
 * The ledger rows deleting a game reverses: a completed game's completion
 * tickets, or a DNF game's penalty. Must match the reasons in
 * `reverse_game_completion_tickets` / `reverse_game_dnf_tickets`
 * (db/review-fixes.sql).
 */
export const COMPLETION_TICKET_REASONS = [
  'game_completed_short', 'game_completed_medium', 'game_completed_long',
  'game_completed_bonus_hours', 'achievement_100_percent',
  'sequel_back_to_back', 'series_back_to_back',
] as const
export const DNF_TICKET_REASONS = ['assigned_game_incomplete'] as const

/** What deleting a game does to the balance (from `deleteImpact`). */
export type DeleteImpact = { change: number; balance: number }

const tickets = (n: number) => `${n} ticket${n === 1 ? '' : 's'}`
/** A balance for display: a real minus sign, so −3 doesn't read as a dash. */
export const formatBalance = (n: number) => (n < 0 ? `−${-n}` : `${n}`)

/**
 * The delete confirmation's text. With `impact` it names the exact tickets
 * and the balance before and after (which can go below zero, by design: see
 * CLAUDE.md, ticket system); without it (still loading, or the check failed)
 * it says what happens in general.
 */
export function deleteWarning(status: GameStatus, impact?: DeleteImpact | null): string {
  const gone = 'It comes off your list for good, along with its hours and notes.'
  const after = (i: DeleteImpact) =>
    `Your balance goes from ${formatBalance(i.balance)} to ${formatBalance(i.balance + i.change)}.`

  if (status === 'completed') {
    if (!impact) return `${gone} The tickets you earned for completing it are taken back.`
    if (impact.change < 0) {
      return `${gone} You lose the ${tickets(-impact.change)} you earned for completing it. ${after(impact)}`
    }
    return `${gone} It didn't earn any tickets, so your balance stays the same.`
  }
  if (status === 'dnf' && impact && impact.change > 0) {
    return `${gone} The ${tickets(impact.change)} you lost for dropping it are given back. ${after(impact)}`
  }
  return gone
}
