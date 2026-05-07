export type SpinType = 'spin' | 'spin_reroll' | 'choose' | 'choose_skip'
export type SpinMode = 'elimination' | 'first_land' | null

export const SPIN_TYPE_BADGE: Record<SpinType, { label: string; className: string }> = {
  spin:        { label: 'Spin',   className: 'bg-brand-100 text-brand-700 border border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700' },
  spin_reroll: { label: 'Reroll', className: 'bg-violet-100 text-violet-700 border border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700' },
  choose:      { label: 'Choose', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' },
  choose_skip: { label: 'Skip',   className: 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700' },
}

export function inferCost(spinType: SpinType, spinMode: SpinMode): string | null {
  if (spinType === 'spin' && spinMode === null) return '−9 🎟️'
  if (spinType === 'choose_skip') return '+2 🎟️'
  return null
}

export function spinModeLabel(spinMode: SpinMode): string | null {
  if (spinMode === 'elimination') return 'Elimination'
  if (spinMode === 'first_land') return 'First Land'
  return null
}
