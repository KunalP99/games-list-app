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
//   • Completed (Ambient or not)               → insert a fresh replay entry.
//     An Ambient row next to a Completed one is the play *after* finishing it
//     — multiplayer, say — so it is left alone: claiming it would carry all
//     those hours into the replay (inflating its completion tickets), drop the
//     replay flag and lose the Ambient row. While the replay is Playing it
//     takes the tracked hours (lib/trackable-row.ts); once it's Completed,
//     tracking falls back to the Ambient row on its own.
//   • Ambient, never completed                 → flip it: the wheel claims the
//     game, keeping the hours already tracked against it. Without this it
//     fell to the catch-all below and the turn was spent for nothing, which
//     got far likelier once the agent began filing games as ambient on its own.
//   • owned but none of the above (e.g. dnf)   → noop, leave untouched
//   • not owned at all                         → insert a plain (non-replay) entry
export function decideWonGameAction(
  rows: { id: string; status: string }[],
): WonGameDecision {
  if (rows.some(r => r.status === 'playing')) return { action: 'noop' }

  // Backlog first: a backlog row is the copy that was deliberately queued, so
  // it is the one the wheel meant.
  const backlog = rows.find(r => r.status === 'backlog')
  if (backlog) return { action: 'flip', gameId: backlog.id }

  const hasCompleted = rows.some(r => r.status === 'completed')
  if (hasCompleted) return { action: 'insert', isReplay: true }

  const ambient = rows.find(r => r.status === 'ambient')
  if (ambient) return { action: 'flip', gameId: ambient.id }

  if (rows.length > 0) return { action: 'noop' }
  return { action: 'insert', isReplay: false }
}
