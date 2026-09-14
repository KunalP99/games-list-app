// Deterministic weekly rotation for the friend-profile banner.
//
// The banner used to be fixed to whichever game had the most hours, which meant
// it never changed. Instead it now rotates once a week through the games the
// user rated 5/5. "Random" here is deliberately *deterministic*: the same user
// sees the same banner all week, everyone loading their profile sees the same
// one, and it moves on when the week does. A live Math.random() would reshuffle
// on every request, including between a server render and a refresh.

/** Whole weeks since the Unix epoch. Rolls over Thursday 00:00 UTC. */
export function weekIndex(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000))
}

/** FNV-1a. Small, stable across runs — unlike anything hash-seeded by the VM. */
export function hashString(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Picks one item for the given seed and week. Returns null for an empty list.
 *
 * Callers must pass a stably-ordered list — Postgres makes no ordering promise
 * without an ORDER BY, and an index into a list that reorders between requests
 * would defeat the whole point.
 */
export function pickWeekly<T>(items: T[], seed: string, week: number): T | null {
  if (items.length === 0) return null
  const index = (hashString(`${seed}:${week}`) >>> 0) % items.length
  return items[index]
}
