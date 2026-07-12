import type { WheelTurn } from './types'

export function nextWheelTurn(current: WheelTurn): WheelTurn {
  if (current === 'spin') return 'spin_reroll'
  if (current === 'spin_reroll') return 'choose'
  return 'spin'
}

export function pickWinner(games: string[]): string {
  return games[Math.floor(Math.random() * games.length)]
}

export type WonGameDecision =
  | { action: 'noop' }
  | { action: 'flip'; gameId: string }
  | { action: 'insert'; isReplay: boolean }

// Decides what winning a game should do to the library, given the user's
// existing rows for that game (already matched by rawg_id or title). A game can
// own several rows once replays exist, so this takes the full set. Precedence:
//   • any Playing (incl. a replay in progress) → noop, don't duplicate
//   • Backlog                                  → flip that row to playing
//   • Completed only                           → insert a fresh replay entry
//   • owned but none of the above (e.g. dnf)   → noop, leave untouched
//   • not owned at all                         → insert a plain (non-replay) entry
export function decideWonGameAction(
  rows: { id: string; status: string }[],
): WonGameDecision {
  if (rows.some(r => r.status === 'playing')) return { action: 'noop' }

  const backlog = rows.find(r => r.status === 'backlog')
  if (backlog) return { action: 'flip', gameId: backlog.id }

  const hasCompleted = rows.some(r => r.status === 'completed')
  if (rows.length > 0 && !hasCompleted) return { action: 'noop' }

  return { action: 'insert', isReplay: hasCompleted }
}
