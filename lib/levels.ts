/**
 * Levels from XP. Pure, so pages and browser components can both use it
 * (lib/achievements.ts re-exports these for everything that imported them
 * from there).
 */

// threshold(L) = 50 * L * (L - 1)
export function getLevel(xp: number): number {
  if (xp <= 0) return 1
  const level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2)
  return Math.max(1, level)
}

export function xpForLevel(level: number): number {
  return 50 * level * (level - 1)
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
