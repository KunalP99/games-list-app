export type SpinType = 'spin' | 'spin_reroll' | 'choose' | 'choose_skip'
export type SpinMode = 'elimination' | 'first_land' | null

export const SPIN_TYPE_BADGE: Record<SpinType, { label: string; className: string }> = {
  spin:        { label: 'Spin',   className: 'bg-brand-100 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700' },
  spin_reroll: { label: 'Reroll', className: 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700' },
  choose:      { label: 'Choose', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  choose_skip: { label: 'Skip',   className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
}

export const SPIN_TYPE_LABEL: Record<SpinType, string> = {
  spin:        'Wheel Spin',
  spin_reroll: 'Spin + Reroll',
  choose:      'Choose Game',
  choose_skip: 'Skip',
}

// How a turn was actually finalized — recorded on wheel_spins.finalized_via.
// The history badge stays keyed to the turn type; this drives the ticket-spend
// note ("You spun again") and reroll runner-up detection instead.
export type FinalizedVia =
  | 'accept' | 'spin_again' | 'reroll_choice' | 'upgrade_choice' | 'choose_any' | 'choose' | 'skip'

// On a Spin + Reroll turn where the user actually rerolled, returns the option
// they did NOT pick (the runner-up), so history can highlight it. Returns null
// when no reroll happened (first spin kept → option_b empty) or the row isn't a
// reroll pick. Also covers pre-migration reroll rows (finalized_via null but
// spin_type 'spin_reroll' with both options recorded).
export function rerollRunnerUp(
  spinType: SpinType,
  finalizedVia: FinalizedVia | null,
  optionA: string | null,
  optionB: string | null,
  result: string | null,
): string | null {
  const isRerollPick = finalizedVia === 'reroll_choice' || (finalizedVia === null && spinType === 'spin_reroll')
  if (!isRerollPick) return null
  if (!optionA || !optionB) return null // kept the first spin — no reroll happened
  return [optionA, optionB].find(o => o.toLowerCase() !== (result ?? '').toLowerCase()) ?? null
}

// Short note describing what the tickets were spent on, shown alongside the cost
// (mirrors the "Choose turn skipped +2 🎟️" row). Only used when a cost exists.
// Pre-migration rows (finalized_via null) fall back to a generic label.
export function spendNote(finalizedVia: FinalizedVia | null): string {
  switch (finalizedVia) {
    case 'spin_again': return 'You spun again'
    case 'upgrade_choice': return 'You paid to spin & reroll'
    case 'choose_any': return 'You chose your own game'
    default: return 'Tickets spent'
  }
}

// Every paid action taken during a turn, in order — a turn can stack several
// (e.g. Spin Again −3, then Choose a Game −9).
export type TicketSpend = { action: FinalizedVia; amount: number }

export type SpendRow = { note: string; amount: number; count: number }

// One row per paid action, so history shows the full spend breakdown rather than
// a single aggregate. Repeats of the same action collapse into one row with a
// count (e.g. spinning again twice → "You spun again (×2)  −6"). Pre-migration
// rows have no breakdown, so fall back to a single row from the total.
export function summariseSpends(
  spends: TicketSpend[] | null,
  finalizedVia: FinalizedVia | null,
  ticketsSpent: number | null,
): SpendRow[] {
  if (spends && spends.length > 0) {
    const rows: SpendRow[] = []
    for (const s of spends) {
      const note = spendNote(s.action)
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
  if (ticketsSpent && ticketsSpent > 0) {
    return [{ note: spendNote(finalizedVia), amount: ticketsSpent, count: 1 }]
  }
  return []
}

export function spinModeLabel(spinMode: SpinMode): string | null {
  if (spinMode === 'elimination') return 'Elimination'
  if (spinMode === 'first_land') return 'First Land'
  return null
}
