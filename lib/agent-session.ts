// Pure logic for the desktop agent's play-session reporting.
//
// Supabase access stays in the route handler (app/api/agent/*), per the usual
// split in this project — everything here is deterministic and unit tested,
// because this is the code that decides how many hours get written to someone's
// library off the back of a request from a program on their PC.

/** Clock skew allowed between the agent's machine and the server. */
export const CLOCK_SKEW_MS = 5 * 60_000

/** `games.hours_played` is numeric(6,1) — anything finer is rounded by Postgres. */
export function roundHours(hours: number): number {
  return Math.round(hours * 10) / 10
}

export type ValidatedSession = {
  clientSessionId: string
  minutes: number
  startedAt: string
  endedAt: string | null
  steamAppId: number | null
  exeName: string | null
}

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/**
 * Validate a session payload from the agent.
 *
 * Deliberately NOT capping total session length: a game left running for days
 * is a legitimate session and should still count. What is bounded instead is
 * the claim itself — reported minutes can never exceed the wall-clock time
 * since the session started, which is what stops a client inventing hours.
 */
export function validateSessionPayload(body: unknown, nowMs: number): Validation<ValidatedSession> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'body must be an object' }
  const b = body as Record<string, unknown>

  if (typeof b.clientSessionId !== 'string' || b.clientSessionId.length === 0) {
    return { ok: false, error: 'clientSessionId is required' }
  }
  if (b.clientSessionId.length > 128) return { ok: false, error: 'clientSessionId too long' }

  if (typeof b.minutes !== 'number' || !Number.isFinite(b.minutes) || b.minutes < 0) {
    return { ok: false, error: 'minutes must be a non-negative number' }
  }
  const minutes = Math.floor(b.minutes)

  if (!isIsoDate(b.startedAt)) return { ok: false, error: 'startedAt must be an ISO timestamp' }
  const startedMs = Date.parse(b.startedAt)
  if (startedMs > nowMs + CLOCK_SKEW_MS) return { ok: false, error: 'startedAt is in the future' }

  // The core anti-abuse rule: you cannot have played for longer than the
  // session has existed.
  const elapsedMinutes = (nowMs + CLOCK_SKEW_MS - startedMs) / 60_000
  if (minutes > elapsedMinutes) return { ok: false, error: 'minutes exceed elapsed time' }

  let endedAt: string | null = null
  if (b.endedAt != null) {
    if (!isIsoDate(b.endedAt)) return { ok: false, error: 'endedAt must be an ISO timestamp' }
    if (Date.parse(b.endedAt) < startedMs) return { ok: false, error: 'endedAt precedes startedAt' }
    endedAt = b.endedAt
  }

  let steamAppId: number | null = null
  if (b.steamAppId != null) {
    if (typeof b.steamAppId !== 'number' || !Number.isInteger(b.steamAppId) || b.steamAppId <= 0) {
      return { ok: false, error: 'steamAppId must be a positive integer' }
    }
    steamAppId = b.steamAppId
  }

  let exeName: string | null = null
  if (b.exeName != null) {
    if (typeof b.exeName !== 'string' || b.exeName.length === 0 || b.exeName.length > 260) {
      return { ok: false, error: 'exeName must be a non-empty string' }
    }
    exeName = normaliseExeName(b.exeName)
  }

  if (steamAppId === null && exeName === null) {
    return { ok: false, error: 'one of steamAppId or exeName is required' }
  }

  return { ok: true, value: { clientSessionId: b.clientSessionId, minutes, startedAt: b.startedAt, endedAt, steamAppId, exeName } }
}

/** Executables are matched case-insensitively and without their path. */
export function normaliseExeName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? raw
  return base.trim().toLowerCase()
}

/**
 * How many hours this checkpoint should add.
 *
 * Checkpoints report the session's *cumulative* minutes, so the amount to add
 * is the difference from what we have already applied. That makes a replayed
 * or duplicated request a no-op rather than a double-count.
 *
 * `lastCheckpointAtMs` bounds a single jump to the real time that has passed
 * since the previous checkpoint — so a client cannot post 10 minutes and then
 * immediately post 10 hours.
 */
export function computeHoursDelta(args: {
  minutes: number
  appliedHours: number
  lastCheckpointAtMs: number | null
  nowMs: number
}): number {
  const target = roundHours(args.minutes / 60)
  let delta = roundHours(target - args.appliedHours)
  if (delta <= 0) return 0

  if (args.lastCheckpointAtMs != null) {
    const windowHours = roundHours((args.nowMs - args.lastCheckpointAtMs + CLOCK_SKEW_MS) / 3_600_000)
    delta = Math.min(delta, Math.max(0, windowHours))
  }
  return roundHours(delta)
}

/** Add a delta onto an existing (possibly null) hours figure. */
export function addHours(current: number | null | undefined, delta: number): number {
  return roundHours((current ?? 0) + delta)
}
