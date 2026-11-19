'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FEATURES } from '@/lib/edition'
import { ilikeAnyFilter } from '@/lib/query-escape'
import { allowRequest, FRIEND_REQUESTS, USER_SEARCH } from '@/lib/rate-limit'
import { relationTo, searchTerm, type Relation } from '@/lib/friends'
import { getFriendGraph, toPerson, type PersonSummary } from '@/lib/data/friends'
import type { ActionResult } from '@/lib/types'

// The friends system (public edition only: FEATURES.friendSystem). Every write
// goes through a server-only database function (db/friends.sql) with the
// signed-in user's id, so the rules (no requests across a block, a request
// both ways becomes a friendship, each action once) live in one place.

const OFF = 'Friends aren’t part of this site.'

async function signedIn() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

function refresh(username?: string) {
  revalidatePath('/dashboard')
  revalidatePath('/settings')
  if (username) revalidatePath(`/users/${username}`)
}

export type SearchResult = PersonSummary & { relation: Relation }

/** People whose username or display name contains the text, with how each stands to you. */
export async function searchUsers(raw: string): Promise<ActionResult<SearchResult[]>> {
  if (!FEATURES.friendSystem) return { success: false, error: OFF }
  const q = searchTerm(raw)
  if (!q) return { success: true, data: [] }
  const { supabase, user } = await signedIn()
  if (!user) return { success: false, error: 'Not signed in.' }
  if (!(await allowRequest(user.id, USER_SEARCH))) {
    return { success: false, error: 'Too many searches. Wait a moment and try again.' }
  }

  // The service role, because a block against you is hidden from you: the
  // search must still leave out people who blocked you (and those you blocked).
  const admin = createAdminClient()
  const [{ data: rows }, { data: blockRows }] = await Promise.all([
    admin.from('profiles')
      .select('id, username, display_name, accent_colour')
      .or(ilikeAnyFilter(['username', 'display_name'], q))
      .neq('id', user.id)
      .order('username')
      .limit(30),
    admin.from('blocks').select('blocker, blocked').or(`blocker.eq.${user.id},blocked.eq.${user.id}`),
  ])
  const hidden = new Set(((blockRows ?? []) as { blocker: string; blocked: string }[])
    .map(b => (b.blocker === user.id ? b.blocked : b.blocker)))

  const graph = await getFriendGraph(supabase, user.id)
  const lower = q.toLowerCase()
  const results = ((rows ?? []) as { id: string; username: string; display_name: string | null; accent_colour: string | null }[])
    .filter(p => !hidden.has(p.id))
    // Exact username first, then names that start with it, then the rest.
    .sort((a, b) => rank(a.username) - rank(b.username))
    .slice(0, 10)
    .map(p => ({ ...toPerson(p), relation: relationTo(user.id, p.id, graph) }))
  return { success: true, data: results }

  function rank(username: string) {
    const u = username.toLowerCase()
    return u === lower ? 0 : u.startsWith(lower) ? 1 : 2
  }
}

const SEND_RESULT: Record<string, { ok: boolean; relation?: Relation; error?: string }> = {
  sent: { ok: true, relation: 'requested' },
  friends: { ok: true, relation: 'friends' },
  already_friends: { ok: true, relation: 'friends' },
  already_sent: { ok: true, relation: 'requested' },
  blocked: { ok: false, error: 'You can’t send this person a request.' },
  self: { ok: false, error: 'That’s you.' },
  not_found: { ok: false, error: 'That person doesn’t exist any more.' },
}

/** Sends a request (or, if they'd already asked you, makes you friends). */
export async function sendFriendRequest(otherId: string): Promise<ActionResult<{ relation: Relation }>> {
  if (!FEATURES.friendSystem) return { success: false, error: OFF }
  const { user } = await signedIn()
  if (!user) return { success: false, error: 'Not signed in.' }
  if (!(await allowRequest(user.id, FRIEND_REQUESTS))) {
    return { success: false, error: 'You’ve sent a lot of requests. Try again in a while.' }
  }
  const { data, error } = await (createAdminClient() as any).rpc('send_friend_request', { p_user: user.id, p_to: otherId })
  if (error) return { success: false, error: 'Couldn’t send the request. Please try again.' }
  const result = SEND_RESULT[data as string] ?? { ok: false, error: 'Couldn’t send the request.' }
  if (!result.ok) return { success: false, error: result.error! }
  refresh()
  return { success: true, data: { relation: result.relation! } }
}

/** Accepts or declines a request someone sent you. */
export async function respondToRequest(fromId: string, accept: boolean): Promise<ActionResult<{ relation: Relation }>> {
  if (!FEATURES.friendSystem) return { success: false, error: OFF }
  const { user } = await signedIn()
  if (!user) return { success: false, error: 'Not signed in.' }
  const { error } = await (createAdminClient() as any).rpc('respond_friend_request', { p_user: user.id, p_from: fromId, p_accept: accept })
  if (error) return { success: false, error: 'Couldn’t answer the request. Please try again.' }
  refresh()
  return { success: true, data: { relation: accept ? 'friends' : 'none' } }
}

/** Takes back a request you sent. */
export async function cancelRequest(toId: string): Promise<ActionResult<{ relation: Relation }>> {
  return pairAction('cancel_friend_request', { p_to: toId }, 'none', 'Couldn’t cancel the request.')
}

export async function removeFriend(otherId: string, username?: string): Promise<ActionResult<{ relation: Relation }>> {
  return pairAction('remove_friend', { p_other: otherId }, 'none', 'Couldn’t remove this friend.', username)
}

/** Blocks someone: ends any friendship or request, and stops new ones. */
export async function blockUser(otherId: string, username?: string): Promise<ActionResult<{ relation: Relation }>> {
  return pairAction('block_user', { p_other: otherId }, 'blocked', 'Couldn’t block this person.', username)
}

export async function unblockUser(otherId: string, username?: string): Promise<ActionResult<{ relation: Relation }>> {
  return pairAction('unblock_user', { p_other: otherId }, 'none', 'Couldn’t unblock this person.', username)
}

async function pairAction(
  fn: string,
  args: Record<string, string>,
  relation: Relation,
  failure: string,
  username?: string,
): Promise<ActionResult<{ relation: Relation }>> {
  if (!FEATURES.friendSystem) return { success: false, error: OFF }
  const { user } = await signedIn()
  if (!user) return { success: false, error: 'Not signed in.' }
  const { error } = await (createAdminClient() as any).rpc(fn, { p_user: user.id, ...args })
  if (error) return { success: false, error: `${failure} Please try again.` }
  refresh(username)
  return { success: true, data: { relation } }
}
