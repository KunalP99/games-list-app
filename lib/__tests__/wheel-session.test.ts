import { describe, it, expect } from 'vitest'
import {
  collapsePhase,
  isAnimationPhase,
  settleSpinStep,
  restoreSession,
  isWorthSaving,
  resumeSummary,
  totalSpent,
  SESSION_VERSION,
  type WheelSession,
  type SettleInput,
} from '../wheel-session'

// ─── Fixtures ───────────────────────────────────────────────────────────────

const GAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo']

// A queue is always [shuffled losers..., winner] — the winner is pinned last.
const QUEUE = ['Bravo', 'Charlie', 'Delta', 'Echo', 'Alpha']

function settleInput(over: Partial<SettleInput> = {}): SettleInput {
  return {
    kind: 'plain',
    turn: 'spin',
    elimQueue: QUEUE,
    elimIndex: 0,
    eliminated: [],
    allGames: GAMES,
    ...over,
  }
}

function session(over: Partial<WheelSession> = {}): WheelSession {
  return {
    v: SESSION_VERSION,
    phase: 'spin_result',
    entries: GAMES.map(name => ({ name, rawg: null })),
    mode: 'elimination',
    winner: 'Alpha',
    rerollWinner: '',
    upgradeGames: [],
    upgradeMaxGames: 3,
    elimQueue: QUEUE,
    elimIndex: 4,
    eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
    elimNextPhase: 'spinning',
    excludedGames: [],
    paidRespin: false,
    spentThisTurn: 0,
    spends: [],
    chooseAnyReturnPhase: 'spin_result',
    finalChosen: '',
    pendingIntent: null,
    ...over,
  }
}

// ─── isAnimationPhase ───────────────────────────────────────────────────────

describe('isAnimationPhase', () => {
  it('identifies all five animation phases', () => {
    for (const p of [
      'spinning', 'spin_paid_spinning', 'spin_upgrade_spinning',
      'spin_upgrade_game3_spinning', 'reroll_spinning',
    ] as const) {
      expect(isAnimationPhase(p)).toBe(true)
    }
  })

  it('does not treat stable phases as animations', () => {
    for (const p of ['setup', 'elim_step', 'spin_result', 'final_choice', 'done'] as const) {
      expect(isAnimationPhase(p)).toBe(false)
    }
  })
})

// ─── collapsePhase ──────────────────────────────────────────────────────────

describe('collapsePhase', () => {
  it('collapses a plain spin to the result on a spin turn', () => {
    expect(collapsePhase('spinning', 'spin')).toBe('spin_result')
  })

  it('collapses a plain spin to the reroll prompt on a spin_reroll turn', () => {
    expect(collapsePhase('spinning', 'spin_reroll')).toBe('reroll_prompt')
  })

  it('collapses a paid spin to the result', () => {
    expect(collapsePhase('spin_paid_spinning', 'spin')).toBe('spin_result')
  })

  it('collapses an upgrade spin to the reroll prompt', () => {
    expect(collapsePhase('spin_upgrade_spinning', 'spin')).toBe('spin_upgrade_reroll_prompt')
  })

  it('collapses the third upgrade spin to the final choice', () => {
    expect(collapsePhase('spin_upgrade_game3_spinning', 'spin')).toBe('spin_upgrade_final_choice')
  })

  it('collapses a reroll spin to the final choice', () => {
    expect(collapsePhase('reroll_spinning', 'spin_reroll')).toBe('final_choice')
  })

  it('leaves stable phases untouched', () => {
    for (const p of ['setup', 'elim_step', 'spin_result', 'choose_input', 'done'] as const) {
      expect(collapsePhase(p, 'spin')).toBe(p)
    }
  })

  it('never returns an animation phase', () => {
    for (const p of [
      'spinning', 'spin_paid_spinning', 'spin_upgrade_spinning',
      'spin_upgrade_game3_spinning', 'reroll_spinning',
    ] as const) {
      expect(isAnimationPhase(collapsePhase(p, 'spin'))).toBe(false)
    }
  })
})

// ─── settleSpinStep ─────────────────────────────────────────────────────────

describe('settleSpinStep', () => {
  describe('mid-queue', () => {
    it('eliminates the landed game and advances the index', () => {
      const r = settleSpinStep(settleInput())
      expect(r.eliminated).toEqual(['Bravo'])
      expect(r.elimIndex).toBe(1)
      expect(r.finished).toBe(false)
    })

    it('pauses on elim_step so the user clicks to continue', () => {
      expect(settleSpinStep(settleInput()).phase).toBe('elim_step')
    })

    it('targets the next game in the queue', () => {
      expect(settleSpinStep(settleInput()).animTarget).toBe('Charlie')
    })

    it('drops eliminated games from the wheel', () => {
      const r = settleSpinStep(settleInput())
      expect(r.currentAnimGames).toEqual(['Alpha', 'Charlie', 'Delta', 'Echo'])
    })

    it('accumulates across successive steps', () => {
      const first = settleSpinStep(settleInput())
      const second = settleSpinStep(settleInput({
        elimIndex: first.elimIndex,
        eliminated: first.eliminated,
      }))
      expect(second.eliminated).toEqual(['Bravo', 'Charlie'])
      expect(second.elimIndex).toBe(2)
    })
  })

  describe('end of the run', () => {
    it('finishes when the queue reaches the pinned winner', () => {
      const r = settleSpinStep(settleInput({
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.finished).toBe(true)
      expect(r.phase).toBe('spin_result')
    })

    it('does not eliminate the winner it lands on', () => {
      const r = settleSpinStep(settleInput({
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.eliminated).not.toContain('Alpha')
    })

    it('finishes early when only one game would remain', () => {
      const r = settleSpinStep(settleInput({
        elimIndex: 3,
        eliminated: ['Bravo', 'Charlie', 'Delta'],
      }))
      expect(r.finished).toBe(true)
      expect(r.animTarget).toBe('Alpha')
    })

    it('settles to the reroll prompt on a spin_reroll turn', () => {
      const r = settleSpinStep(settleInput({
        turn: 'spin_reroll',
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.phase).toBe('reroll_prompt')
    })
  })

  describe('paid spins', () => {
    it('bars games already landed on this turn', () => {
      const r = settleSpinStep(settleInput({ kind: 'paid', excludedGames: ['Echo'] }))
      expect(r.currentAnimGames).not.toContain('Echo')
    })

    it('always settles to the result regardless of turn', () => {
      const r = settleSpinStep(settleInput({
        kind: 'paid',
        turn: 'spin_reroll',
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.phase).toBe('spin_result')
    })

    it('falls back to the unexcluded pool rather than emptying the wheel', () => {
      const r = settleSpinStep(settleInput({
        kind: 'paid',
        excludedGames: GAMES,
      }))
      expect(r.currentAnimGames.length).toBeGreaterThan(0)
    })
  })

  describe('upgrade spins', () => {
    it('bars options already collected', () => {
      const r = settleSpinStep(settleInput({ kind: 'upgrade', upgradeGames: ['Delta'] }))
      expect(r.currentAnimGames).not.toContain('Delta')
    })

    it('settles to the reroll prompt', () => {
      const r = settleSpinStep(settleInput({
        kind: 'upgrade',
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.phase).toBe('spin_upgrade_reroll_prompt')
    })

    it('falls back to the full list rather than emptying the wheel', () => {
      const r = settleSpinStep(settleInput({ kind: 'upgrade', upgradeGames: GAMES }))
      expect(r.currentAnimGames).toEqual(GAMES)
    })
  })

  describe('third upgrade spin', () => {
    it('goes to the final choice once enough options are collected', () => {
      const r = settleSpinStep(settleInput({
        kind: 'upgrade_game3',
        upgradeGames: ['Alpha', 'Bravo', 'Charlie'],
        upgradeMaxGames: 3,
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.phase).toBe('spin_upgrade_final_choice')
    })

    it('offers another spin while short of the maximum', () => {
      const r = settleSpinStep(settleInput({
        kind: 'upgrade_game3',
        upgradeGames: ['Alpha', 'Bravo'],
        upgradeMaxGames: 4,
        elimIndex: 4,
        eliminated: ['Bravo', 'Charlie', 'Delta', 'Echo'],
      }))
      expect(r.phase).toBe('spin_upgrade_reroll_prompt')
    })
  })

  describe('determinism', () => {
    it('plays a full run out to the pinned winner', () => {
      let elimIndex = 0
      let eliminated: string[] = []
      let guard = 0
      let last = settleSpinStep(settleInput())
      while (!last.finished && guard++ < 20) {
        elimIndex = last.elimIndex
        eliminated = last.eliminated
        last = settleSpinStep(settleInput({ elimIndex, eliminated }))
      }
      expect(last.finished).toBe(true)
      expect(last.eliminated).not.toContain('Alpha')
    })

    it('produces the same result for the same input (no randomness)', () => {
      const a = settleSpinStep(settleInput({ elimIndex: 2, eliminated: ['Bravo', 'Charlie'] }))
      const b = settleSpinStep(settleInput({ elimIndex: 2, eliminated: ['Bravo', 'Charlie'] }))
      expect(a).toEqual(b)
    })
  })
})

// ─── restoreSession ─────────────────────────────────────────────────────────

describe('restoreSession', () => {
  it('round-trips a valid session', () => {
    const s = session()
    expect(restoreSession(s)).toEqual(s)
  })

  it('returns null for null (no turn in progress)', () => {
    expect(restoreSession(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(restoreSession(undefined)).toBeNull()
  })

  it('returns null for a non-object', () => {
    expect(restoreSession('not a session')).toBeNull()
    expect(restoreSession(42)).toBeNull()
  })

  it('returns null for an array', () => {
    expect(restoreSession([])).toBeNull()
  })

  it('rejects a session from a future version', () => {
    expect(restoreSession(session({ v: 2 as 1 }))).toBeNull()
  })

  it('rejects a session with no version', () => {
    const { v, ...rest } = session()
    expect(restoreSession(rest)).toBeNull()
  })

  it('rejects an unknown phase', () => {
    expect(restoreSession(session({ phase: 'teleporting' as never }))).toBeNull()
  })

  it('rejects an unknown spin mode', () => {
    expect(restoreSession(session({ mode: 'chaos' as never }))).toBeNull()
  })

  it('rejects malformed entries', () => {
    expect(restoreSession(session({ entries: [{ nope: true }] as never }))).toBeNull()
  })

  it('rejects a non-array elimination queue', () => {
    expect(restoreSession(session({ elimQueue: 'Bravo' as never }))).toBeNull()
  })

  it('rejects an elimIndex past the end of the queue', () => {
    expect(restoreSession(session({ elimIndex: 99 }))).toBeNull()
  })

  it('rejects a negative elimIndex', () => {
    expect(restoreSession(session({ elimIndex: -1 }))).toBeNull()
  })

  it('rejects a fractional elimIndex', () => {
    expect(restoreSession(session({ elimIndex: 1.5 }))).toBeNull()
  })

  it('rejects a started turn with too few entries to spin', () => {
    const short = session({ entries: [{ name: 'Alpha', rawg: null }], elimQueue: [], elimIndex: 0 })
    expect(restoreSession(short)).toBeNull()
  })

  it('allows a half-built setup list below the minimum', () => {
    const short = session({
      phase: 'setup',
      entries: [{ name: 'Alpha', rawg: null }],
      elimQueue: [],
      elimIndex: 0,
    })
    expect(restoreSession(short)?.entries).toHaveLength(1)
  })

  it('rejects malformed spends', () => {
    expect(restoreSession(session({ spends: [{ action: 'spin' }] as never }))).toBeNull()
  })

  it('preserves the elimination queue verbatim (it cannot be regenerated)', () => {
    const shuffled = ['Echo', 'Delta', 'Bravo', 'Charlie', 'Alpha']
    const restored = restoreSession(session({ elimQueue: shuffled, elimIndex: 2 }))
    expect(restored?.elimQueue).toEqual(shuffled)
  })

  it('preserves spends so the resumed turn knows what was paid', () => {
    const spends = [{ action: 'spin_again', amount: 3 }]
    const restored = restoreSession(session({ spends, spentThisTurn: 3 }))
    expect(restored?.spends).toEqual(spends)
    expect(restored?.spentThisTurn).toBe(3)
  })

  it('defaults a missing elimNextPhase rather than failing', () => {
    const { elimNextPhase, ...rest } = session()
    expect(restoreSession(rest)?.elimNextPhase).toBe('spinning')
  })

  it('drops a malformed pending review intent', () => {
    expect(restoreSession(session({ pendingIntent: { kind: 'nope' } as never }))?.pendingIntent).toBeNull()
  })

  it('keeps a valid pending review intent', () => {
    const intent = { kind: 'accept' as const, chosenName: 'Alpha' }
    expect(restoreSession(session({ pendingIntent: intent }))?.pendingIntent).toEqual(intent)
  })
})

// ─── isWorthSaving ──────────────────────────────────────────────────────────

describe('isWorthSaving', () => {
  it('is false for an untouched setup screen', () => {
    expect(isWorthSaving(session({ phase: 'setup', entries: [] }))).toBe(false)
  })

  it('is true once entries have been added', () => {
    expect(isWorthSaving(session({ phase: 'setup' }))).toBe(true)
  })

  it('is true for a turn in progress even with no entries', () => {
    expect(isWorthSaving(session({ phase: 'choose_input', entries: [] }))).toBe(true)
  })
})

// ─── resumeSummary ──────────────────────────────────────────────────────────

describe('resumeSummary', () => {
  it('is empty when nothing was spent', () => {
    expect(resumeSummary([])).toEqual([])
  })

  it('is empty for null', () => {
    expect(resumeSummary(null)).toEqual([])
  })

  it('reports a single spend', () => {
    const rows = resumeSummary([{ action: 'spin_again', amount: 3 }])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(3)
    expect(rows[0].count).toBe(1)
  })

  it('aggregates repeats of the same action', () => {
    const rows = resumeSummary([
      { action: 'spin_again', amount: 3 },
      { action: 'spin_again', amount: 3 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(6)
    expect(rows[0].count).toBe(2)
  })

  it('keeps different actions on separate rows', () => {
    // The use case: spin → pay to spin again (−3) → pay to choose instead (−9).
    const rows = resumeSummary([
      { action: 'spin_again', amount: 3 },
      { action: 'choose_any', amount: 9 },
    ])
    expect(rows).toHaveLength(2)
  })
})

// ─── totalSpent ─────────────────────────────────────────────────────────────

describe('totalSpent', () => {
  it('is zero for no spends', () => {
    expect(totalSpent([])).toBe(0)
  })

  it('is zero for null', () => {
    expect(totalSpent(null)).toBe(0)
  })

  it('sums every spend in the turn', () => {
    expect(totalSpent([
      { action: 'spin_again', amount: 3 },
      { action: 'choose_any', amount: 9 },
    ])).toBe(12) // 3 (spin again) + 9 (choose a game)
  })
})
