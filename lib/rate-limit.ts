// Per-user rate limits for routes that spend a shared quota (IGDB), so one
// account can't use it up for everyone (code review SEC-010).
//
// Counted in the database (take_rate_limit, db/batch4.sql): serverless
// functions share no memory, so an in-process counter would reset on every
// cold start and differ between instances.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type RateLimit = { bucket: string; limit: number; windowSeconds: number }

/** Searching as you type (debounced) plus browsing results: generous for a person, tight for a script. */
export const IGDB_SEARCH: RateLimit = { bucket: 'igdb_search', limit: 60, windowSeconds: 60 }
/** Opening a game's details or its image chooser. */
export const IGDB_LOOKUP: RateLimit = { bucket: 'igdb_lookup', limit: 120, windowSeconds: 60 }
/** The desktop app identifying running programs: a handful a minute at most. */
export const AGENT_IDENTIFY: RateLimit = { bucket: 'agent_identify', limit: 30, windowSeconds: 60 }

/**
 * Counts this request against the user's limit. True when it may go ahead.
 *
 * Fails open: if the counter can't be reached (or db/batch4.sql hasn't been
 * run yet), the request is allowed. A limit that broke search whenever the
 * database hiccuped would cost more than it saves.
 */
export async function allowRequest(userId: string, rule: RateLimit): Promise<boolean> {
  try {
    const { data, error } = await (createAdminClient() as any).rpc('take_rate_limit', {
      p_user_id: userId,
      p_bucket: rule.bucket,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    })
    if (error) {
      console.warn(`rate limit check failed (${rule.bucket}): ${error.message}`)
      return true
    }
    return data !== false
  } catch (err) {
    console.warn(`rate limit check failed (${rule.bucket}): ${err instanceof Error ? err.message : err}`)
    return true
  }
}

/** The response for a request over the limit. */
export function tooManyRequests(rule: RateLimit, body: unknown = { error: 'Too many requests. Wait a moment and try again.' }) {
  return NextResponse.json(body, { status: 429, headers: { 'Retry-After': String(rule.windowSeconds) } })
}
