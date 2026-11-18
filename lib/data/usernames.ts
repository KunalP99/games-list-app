import { createAdminClient } from '@/lib/supabase/admin'
import { BRAND } from '@/lib/edition'
import { validateUsername, suggestUsernames, type Validation } from '@/lib/username'
import { escapeLike as likeExact } from '@/lib/query-escape'

/**
 * Server-side username checks against the database, shared by sign-up, the
 * live "is it free?" check, /welcome and Settings. Uses the service role: the
 * check has to see every profile, and it runs before the user has a session.
 *
 * A name counts as taken if a profile has it (any case) or it's someone's old
 * name kept for redirects (`username_redirects`), so an old profile link can
 * never start pointing at a stranger.
 */

export type UsernameStatus =
  | { status: 'available'; username: string }
  | { status: 'taken'; username: string; suggestions: string[] }
  | { status: 'invalid'; error: string }


/** Validated against the rules, including this deployment's brand name. */
export function checkUsernameRules(raw: string): Validation<string> {
  return validateUsername(raw, [BRAND.name])
}

/** Whether `name` (already normalised) is used, ignoring `exceptUserId` (yourself, when renaming). */
export async function isUsernameTaken(name: string, exceptUserId?: string): Promise<boolean> {
  const sb = createAdminClient()
  let profileQuery = sb.from('profiles').select('id').ilike('username', likeExact(name)).limit(1)
  if (exceptUserId) profileQuery = profileQuery.neq('id', exceptUserId)
  const [{ data: profiles }, { data: redirects }] = await Promise.all([
    profileQuery,
    sb.from('username_redirects').select('user_id').eq('old_username', name).limit(1),
  ])
  if ((profiles ?? []).length > 0) return true
  const redirect = (redirects ?? [])[0] as { user_id: string } | undefined
  // Your own old name is yours to take back.
  return redirect != null && redirect.user_id !== exceptUserId
}

/** Free alternatives, checked against names that start the same way. */
async function suggestionsFor(name: string): Promise<string[]> {
  const sb = createAdminClient()
  const root = name.slice(0, 16)
  const [{ data: profiles }, { data: redirects }] = await Promise.all([
    sb.from('profiles').select('username').ilike('username', `${likeExact(root)}%`).limit(200),
    sb.from('username_redirects').select('old_username').like('old_username', `${likeExact(root)}%`).limit(200),
  ])
  const taken = new Set<string>([
    ...((profiles ?? []) as { username: string }[]).map(p => p.username.toLowerCase()),
    ...((redirects ?? []) as { old_username: string }[]).map(r => r.old_username),
  ])
  return suggestUsernames(name, n => taken.has(n) || !checkUsernameRules(n).ok)
}

/** The full answer for a typed username: invalid (with why), taken (with alternatives) or available. */
export async function usernameStatus(raw: string, exceptUserId?: string): Promise<UsernameStatus> {
  const rules = checkUsernameRules(raw)
  if (!rules.ok) return { status: 'invalid', error: rules.error }
  if (await isUsernameTaken(rules.value, exceptUserId)) {
    return { status: 'taken', username: rules.value, suggestions: await suggestionsFor(rules.value) }
  }
  return { status: 'available', username: rules.value }
}
