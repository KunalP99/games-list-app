// Level badge tiers: the higher the level, the fancier the badge
// (components/profile/LevelBadge.tsx, styles in app/globals.css). Levels come
// from lib/levels.ts: a rising curve to level 10 (4,500 XP), then 1,000 XP a
// level (about 8 completed games), so level 20 is 14,500 XP and level 50 is 44,500.

export type LevelTierId = 'rookie' | 'bronze' | 'silver' | 'gold' | 'emerald' | 'diamond' | 'inferno' | 'mythic'

export type LevelTier = {
  id: LevelTierId
  name: string
  /** First level of the tier. */
  from: number
}

/** In order, lowest first. Each tier runs until the next one starts. */
export const LEVEL_TIERS: readonly LevelTier[] = [
  { id: 'rookie', name: 'Rookie', from: 1 },
  { id: 'bronze', name: 'Bronze', from: 5 },
  { id: 'silver', name: 'Silver', from: 10 },
  { id: 'gold', name: 'Gold', from: 15 },
  { id: 'emerald', name: 'Emerald', from: 20 },
  { id: 'diamond', name: 'Diamond', from: 25 },
  { id: 'inferno', name: 'Inferno', from: 30 },
  { id: 'mythic', name: 'Mythic', from: 50 },
]

/** The tier a level is in. Anything below 1 (or not a number) counts as Rookie. */
export function levelTier(level: number): LevelTier {
  let tier = LEVEL_TIERS[0]
  for (const t of LEVEL_TIERS) if (level >= t.from) tier = t
  return tier
}

/** "Levels 15–19", or "Levels 50+" for the last tier. */
export function tierRange(tier: LevelTier): string {
  const next = LEVEL_TIERS[LEVEL_TIERS.indexOf(tier) + 1]
  return next ? `Levels ${tier.from}–${next.from - 1}` : `Levels ${tier.from}+`
}
