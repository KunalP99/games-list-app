// Resumable wheel turns.
//
// A turn used to live entirely in React state, so closing the tab lost it —
// including results the user had already paid tickets for. This module holds
// the pure logic behind persisting a turn to `profiles.wheel_session`: deciding
// what a spin settles into, collapsing transient phases, and validating a blob
// read back from the database.
//
// Everything here is pure so it can be unit tested; the Supabase reads/writes
// live in `app/(app)/wheel/actions.ts`.

import { WHEEL_MIN_GAMES } from './constants'
import { spendNote } from './wheel-history'

// Kept in sync with the Phase union in components/wheel/WheelClient.tsx.
export type WheelPhase =
  | 'setup'
  | 'spinning'
  | 'elim_step'
  | 'spin_result'
  | 'spin_paid_spinning'
  | 'spin_upgrade_spinning'
  | 'spin_upgrade_reroll_prompt'
  | 'spin_upgrade_game3_spinning'
  | 'spin_upgrade_final_choice'
  | 'spin_choose_any'
  | 'reroll_prompt'
  | 'reroll_spinning'
  | 'final_choice'
  | 'choose_input'
  | 'done'

export type TicketSpend = { action: string; amount: number }

// The RAWG identity is what lets a won game be added to the library; a
// free-text entry has none. Mirrors WheelEntry in WheelClient.
export type SessionEntry = { name: string; rawg: unknown | null }

// What the review modal was about to confirm. The modal's `confirm` is a live
// closure and can't be serialized, so the *intent* is stored and the closure is
// rebuilt on hydration.
export type PendingIntent = {
  kind: 'accept' | 'upgrade_choice' | 'final_choice' | 'choose'
  chosenName: string
}

export type WheelSession = {
  v: 1
  phase: WheelPhase
  entries: SessionEntry[]
  mode: 'elimination' | 'first_land'
  winner: string
  rerollWinner: string
  upgradeGames: string[]
  upgradeMaxGames: number
  elimQueue: string[]
  elimIndex: number
  eliminated: string[]
  elimNextPhase: WheelPhase
  excludedGames: string[]
  paidRespin: boolean
  spentThisTurn: number
  spends: TicketSpend[]
  chooseAnyReturnPhase: WheelPhase
  finalChosen: string
  pendingIntent: PendingIntent | null
}

export const SESSION_VERSION = 1

// ─── Phase collapsing ──────────────────────────────────────────────────────

// The wheel animation is theatre over an outcome the server already decided, so
// a persisted session must never sit on a transient phase — otherwise resuming
// would replay a spin (or worse, resume into an animation whose completion
// handler re-runs an elimination step). Each animation phase maps to the stable
// phase it would have settled into.
const ANIMATION_PHASES: Record<string, WheelPhase> = {
  spinning: 'spin_result',
  spin_paid_spinning: 'spin_result',
  spin_upgrade_spinning: 'spin_upgrade_reroll_prompt',
  spin_upgrade_game3_spinning: 'spin_upgrade_final_choice',
  reroll_spinning: 'final_choice',
}

export function isAnimationPhase(phase: WheelPhase): boolean {
  return phase in ANIMATION_PHASES
}

// `turn` matters because a plain spin settles differently per turn: a SPIN turn
// shows the result, a SPIN+REROLL turn offers the reroll prompt.
export function collapsePhase(
  phase: WheelPhase,
  turn: 'spin' | 'spin_reroll' | 'choose' = 'spin',
): WheelPhase {
  if (phase === 'spinning') return turn === 'spin_reroll' ? 'reroll_prompt' : 'spin_result'
  return ANIMATION_PHASES[phase] ?? phase
}

// ─── Elimination stepping ──────────────────────────────────────────────────

// Which spin produced this step. Each variant eliminates from a different pool,
// which is the only thing that differed between the four near-identical
// animation-complete handlers this replaces.
export type SpinKind = 'plain' | 'paid' | 'upgrade' | 'upgrade_game3'

export type SettleInput = {
  kind: SpinKind
  turn: 'spin' | 'spin_reroll' | 'choose'
  elimQueue: string[]
  elimIndex: number
  eliminated: string[]
  allGames: string[]
  excludedGames?: string[]
  upgradeGames?: string[]
  upgradeMaxGames?: number
}

export type SettleResult = {
  phase: WheelPhase
  elimIndex: number
  eliminated: string[]
  currentAnimGames: string[]
  animTarget: string
  /** True when the elimination run is over and a winner has been reached. */
  finished: boolean
}

// Where a spin lands once its elimination run finishes.
function finishedPhase(input: SettleInput): WheelPhase {
  switch (input.kind) {
    case 'plain':
      return input.turn === 'spin_reroll' ? 'reroll_prompt' : 'spin_result'
    case 'paid':
      return 'spin_result'
    case 'upgrade':
      return 'spin_upgrade_reroll_prompt'
    case 'upgrade_game3': {
      const have = (input.upgradeGames ?? []).length
      const max = input.upgradeMaxGames ?? 3
      return have >= max ? 'spin_upgrade_final_choice' : 'spin_upgrade_reroll_prompt'
    }
  }
}

// The pool still on the wheel after `eliminated` are knocked out. Paid spins
// also bar games already landed on this turn; upgrade spins bar games already
// collected as options. Both fall back to the full list rather than emptying.
function remainingPool(input: SettleInput, eliminated: string[]): string[] {
  const { kind, allGames } = input
  const excluded = input.excludedGames ?? []
  const upgrades = input.upgradeGames ?? []

  if (kind === 'paid') {
    const pool = allGames.filter(g => !eliminated.includes(g) && !excluded.includes(g))
    return pool.length > 0 ? pool : allGames.filter(g => !eliminated.includes(g))
  }
  if (kind === 'upgrade' || kind === 'upgrade_game3') {
    const pool = allGames.filter(g => !upgrades.includes(g) && !eliminated.includes(g))
    return pool.length > 0 ? pool : allGames
  }
  return allGames.filter(g => !eliminated.includes(g))
}

// Advances one elimination step. `elimQueue` is a shuffled list of losers with
// the already-decided winner pinned last, so stepping is deterministic — which
// is what lets a resumed turn play out to the same winner.
export function settleSpinStep(input: SettleInput): SettleResult {
  const { elimQueue, elimIndex, eliminated } = input
  const landed = elimQueue[elimIndex]
  const isLast = elimIndex === elimQueue.length - 1

  if (isLast) {
    return {
      phase: finishedPhase(input),
      elimIndex,
      eliminated,
      currentAnimGames: remainingPool(input, eliminated),
      animTarget: landed ?? '',
      finished: true,
    }
  }

  const nextEliminated = [...eliminated, landed]
  const remaining = remainingPool(input, nextEliminated)

  // One survivor means the run is over early — no point spinning a single slot.
  if (remaining.length <= 1) {
    return {
      phase: finishedPhase(input),
      elimIndex,
      eliminated: nextEliminated,
      currentAnimGames: remaining,
      animTarget: remaining[0] ?? landed ?? '',
      finished: true,
    }
  }

  const next = elimIndex + 1
  return {
    phase: 'elim_step',
    elimIndex: next,
    eliminated: nextEliminated,
    currentAnimGames: remaining,
    animTarget: elimQueue[next],
    finished: false,
  }
}

// ─── Validation / restore ──────────────────────────────────────────────────

const PHASES = new Set<string>([
  'setup', 'spinning', 'elim_step', 'spin_result', 'spin_paid_spinning',
  'spin_upgrade_spinning', 'spin_upgrade_reroll_prompt', 'spin_upgrade_game3_spinning',
  'spin_upgrade_final_choice', 'spin_choose_any', 'reroll_prompt', 'reroll_spinning',
  'final_choice', 'choose_input', 'done',
])

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every(x => typeof x === 'string')
}

function isSpends(v: unknown): v is TicketSpend[] {
  return Array.isArray(v) && v.every(
    x => x !== null && typeof x === 'object'
      && typeof (x as TicketSpend).action === 'string'
      && typeof (x as TicketSpend).amount === 'number',
  )
}

function isEntries(v: unknown): v is SessionEntry[] {
  return Array.isArray(v) && v.every(
    x => x !== null && typeof x === 'object' && typeof (x as SessionEntry).name === 'string',
  )
}

// Reads a blob back from the database. Anything unrecognised returns null and
// the user simply starts a fresh turn — a malformed session must never break
// the wheel, and a future version bump must not crash an older client.
export function restoreSession(raw: unknown): WheelSession | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const s = raw as Partial<WheelSession>

  if (s.v !== SESSION_VERSION) return null
  if (typeof s.phase !== 'string' || !PHASES.has(s.phase)) return null
  if (!isEntries(s.entries)) return null
  if (s.mode !== 'elimination' && s.mode !== 'first_land') return null
  if (!isStringArray(s.elimQueue) || !isStringArray(s.eliminated)) return null
  if (!isStringArray(s.upgradeGames) || !isStringArray(s.excludedGames)) return null
  if (!isSpends(s.spends)) return null
  if (typeof s.elimIndex !== 'number' || !Number.isInteger(s.elimIndex) || s.elimIndex < 0) return null
  if (typeof s.spentThisTurn !== 'number' || s.spentThisTurn < 0) return null

  // An index past the end of the queue would step onto undefined.
  if (s.elimQueue.length > 0 && s.elimIndex >= s.elimQueue.length) return null

  // A turn that can't legally be spun is not worth restoring. Only enforced
  // once past setup — a half-built list is allowed to be short.
  if (s.phase !== 'setup' && s.entries.length < WHEEL_MIN_GAMES) return null

  const phase = s.phase as WheelPhase

  return {
    v: SESSION_VERSION,
    phase,
    entries: s.entries,
    mode: s.mode,
    winner: typeof s.winner === 'string' ? s.winner : '',
    rerollWinner: typeof s.rerollWinner === 'string' ? s.rerollWinner : '',
    upgradeGames: s.upgradeGames,
    upgradeMaxGames: typeof s.upgradeMaxGames === 'number' ? s.upgradeMaxGames : 3,
    elimQueue: s.elimQueue,
    elimIndex: s.elimIndex,
    eliminated: s.eliminated,
    elimNextPhase: typeof s.elimNextPhase === 'string' && PHASES.has(s.elimNextPhase)
      ? s.elimNextPhase as WheelPhase
      : 'spinning',
    excludedGames: s.excludedGames,
    paidRespin: s.paidRespin === true,
    spentThisTurn: s.spentThisTurn,
    spends: s.spends,
    chooseAnyReturnPhase: typeof s.chooseAnyReturnPhase === 'string' && PHASES.has(s.chooseAnyReturnPhase)
      ? s.chooseAnyReturnPhase as WheelPhase
      : 'spin_result',
    finalChosen: typeof s.finalChosen === 'string' ? s.finalChosen : '',
    pendingIntent: isPendingIntent(s.pendingIntent) ? s.pendingIntent : null,
  }
}

function isPendingIntent(v: unknown): v is PendingIntent {
  if (v === null || typeof v !== 'object') return false
  const p = v as PendingIntent
  return typeof p.chosenName === 'string'
    && ['accept', 'upgrade_choice', 'final_choice', 'choose'].includes(p.kind)
}

// A session is only worth persisting once it holds something worth restoring:
// entries the user built, or a turn already underway.
export function isWorthSaving(session: WheelSession): boolean {
  return session.entries.length > 0 || session.phase !== 'setup'
}

// ─── Resume summary ────────────────────────────────────────────────────────

export type ResumeSpendRow = { note: string; amount: number; count: number }

// What the user already spent this turn, so resuming doesn't hide that tickets
// are gone. Groups repeats (two Spin Agains read as one row, ×2). Mirrors
// summariseSpends in wheel-history, reusing its labels.
export function resumeSummary(spends: TicketSpend[] | null | undefined): ResumeSpendRow[] {
  if (!spends || spends.length === 0) return []
  const rows: ResumeSpendRow[] = []
  for (const s of spends) {
    const note = spendNote(s.action as Parameters<typeof spendNote>[0])
    const existing = rows.find(r => r.note === note)
    if (existing) {
      existing.amount += s.amount
      existing.count += 1
    } else {
      rows.push({ note, amount: s.amount, count: 1 })
    }
  }
  return rows
}

export function totalSpent(spends: TicketSpend[] | null | undefined): number {
  if (!spends) return 0
  return spends.reduce((sum, s) => sum + s.amount, 0)
}
