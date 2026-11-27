/**
 * Levels from XP. Pure, so pages and browser components can both use it
 * (lib/achievements.ts re-exports these for everything that imported them
 * from there).
 *
 * Up to level 10 each level costs 100 XP more than the last:
 * threshold(L) = 50 * L * (L - 1), so level 10 is 4,500 XP. From there every
 * level costs a flat 1,000 XP (about 8 completed games), the same as the old
 * curve's level 10 -> 11, so the switch is seamless. Before, the curve kept
 * steepening, and the top tiers (lib/level-tiers.ts) needed hundreds more games.
 * Both editions; nothing stores a level, so it's worked out from XP each time.
 */

/** The level the curve goes flat at. */
export const FLAT_FROM_LEVEL = 10
/** XP for each level from FLAT_FROM_LEVEL on. */
export const FLAT_LEVEL_XP = 1000

const curve = (level: number) => 50 * level * (level - 1)
const FLAT_START_XP = curve(FLAT_FROM_LEVEL)

export function getLevel(xp: number): number {
  if (!(xp > 0)) return 1
  if (xp >= FLAT_START_XP) return FLAT_FROM_LEVEL + Math.floor((xp - FLAT_START_XP) / FLAT_LEVEL_XP)
  const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2)
  return Math.max(1, level)
}

/** Total XP a level starts at. */
export function xpForLevel(level: number): number {
  if (level <= FLAT_FROM_LEVEL) return curve(level)
  return FLAT_START_XP + (level - FLAT_FROM_LEVEL) * FLAT_LEVEL_XP
}

export function levelProgress(xp: number) {
  const level = getLevel(xp)
  const currentThreshold = xpForLevel(level)
  const nextThreshold = xpForLevel(level + 1)
  const intoLevel = xp - currentThreshold
  const span = nextThreshold - currentThreshold
  return {
    level,
    xp,
    intoLevel,
    span,
    percent: span > 0 ? Math.min(100, Math.round((intoLevel / span) * 100)) : 0,
    nextThreshold,
  }
}
