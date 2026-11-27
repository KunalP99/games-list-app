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
 * (db/review-fixes.sql; `hours_typed` from db/hours-tickets.sql). Tickets
 * for tracked play (`hours_played`) are never taken back.
 */
export const COMPLETION_TICKET_REASONS = [
  'game_completed_short', 'game_completed_medium', 'game_completed_long',
  'game_completed_bonus_hours', 'achievement_100_percent',
  'sequel_back_to_back', 'series_back_to_back', 'hours_typed',
] as const
export const DNF_TICKET_REASONS = ['assigned_game_incomplete'] as const

/** What deleting a game does to the balance (from `deleteImpact`). */
/**
 * `asDnf`: the game is the Main Game holding the wheel (FEATURES.wheelLock),
 * so deleting it counts as dropping it: the DNF charge applies and stays.
 */
export type DeleteImpact = { change: number; balance: number; asDnf?: boolean }

/** A balance for display: a real minus sign, so −3 doesn't read as a dash. */
export const formatBalance = (n: number) => (n < 0 ? `−${-n}` : `${n}`)
/** A change for display, always signed: "−3", "+5". */
export const formatChange = (n: number) => (n > 0 ? `+${n}` : formatBalance(n))

/**
 * The delete confirmation's text: one plain line. The tickets are shown
 * separately (`deleteTicketChange`, a small chip with the balance before and
 * after). `impact` undefined = still checking (the chip's place says so);
 * null = the check failed, so a completed game says in words that its
 * tickets are taken back.
 */
export function deleteWarning(status: GameStatus, impact?: DeleteImpact | null): string {
  const gone = 'It comes off your list for good, along with its hours and notes.'
  if (impact?.asDnf) {
    return `${gone} It's your Main Game from the wheel, so deleting it counts as dropping it (DNF): the DNF ticket charge applies and stays, and the wheel unlocks.`
  }
  if (status === 'completed' && impact === null) return `${gone} The tickets you earned for completing it are taken back.`
  return gone
}

/**
 * The tickets a delete takes (negative: a completed game's earnings) or
 * gives back (positive: a DNF penalty), with the balance before and after,
 * for the dialog's chip. Null when nothing changes (or isn't known yet), so
 * no chip shows. The balance can go below zero, by design (CLAUDE.md, ticket
 * system).
 */
export function deleteTicketChange(impact?: DeleteImpact | null): { change: number; before: number; after: number } | null {
  if (!impact || impact.change === 0) return null
  return { change: impact.change, before: impact.balance, after: impact.balance + impact.change }
}
