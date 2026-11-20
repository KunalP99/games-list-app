import type { SupabaseClient } from '@supabase/supabase-js'
import { friendOf, relationTo, type FriendGraph, type Relation } from '@/lib/friends'
import { FEATURES } from '@/lib/edition'
import { getPlayingNow, type PlayingNowEntry } from '@/lib/presence'

/**
 * The viewer's side of the friends system (public edition), read with their
 * own session: the read rules (db/friends.sql) let you see your own
 * friendships, requests sent to or by you, and your own blocks.
 */

export type PersonSummary = {
  id: string
  username: string
  displayName: string
  accentColour: string | null
  /** For their level (levelProgress); 0 where it wasn't loaded (search results). */
  xp: number
}

type ProfileRow = { id: string; username: string; display_name: string | null; accent_colour: string | null; xp?: number | null }

export function toPerson(p: ProfileRow): PersonSummary {
  return { id: p.id, username: p.username, displayName: p.display_name ?? p.username, accentColour: p.accent_colour, xp: p.xp ?? 0 }
}

export async function getFriendGraph(supabase: SupabaseClient, userId: string): Promise<FriendGraph> {
  const [friendships, requests, blocks] = await Promise.all([
    supabase.from('friendships').select('user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('friend_requests').select('from_user, to_user, created_at').or(`from_user.eq.${userId},to_user.eq.${userId}`),
    supabase.from('blocks').select('blocker, blocked').eq('blocker', userId),
  ])
  return {
    friendships: (friendships.data ?? []) as FriendGraph['friendships'],
    requests: (requests.data ?? []) as FriendGraph['requests'],
    blocks: (blocks.data ?? []) as FriendGraph['blocks'],
  }
}

export async function getFriendIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase.from('friendships').select('user_a, user_b').or(`user_a.eq.${userId},user_b.eq.${userId}`)
  return ((data ?? []) as { user_a: string; user_b: string }[]).map(r => friendOf(r, userId))
}

export async function getRelation(supabase: SupabaseClient, viewerId: string, otherId: string): Promise<Relation> {
  if (viewerId === otherId) return 'self'
  return relationTo(viewerId, otherId, await getFriendGraph(supabase, viewerId))
}

export type FriendsOverview = {
  friends: PersonSummary[]
  /** Requests waiting for the viewer's answer, newest first. */
  incoming: PersonSummary[]
  /** Requests the viewer sent, still waiting. */
  sent: PersonSummary[]
  /** People the viewer blocked. */
  blocked: PersonSummary[]
}

export async function getFriendsOverview(supabase: SupabaseClient, userId: string): Promise<FriendsOverview> {
  const graph = await getFriendGraph(supabase, userId)
  const friendIds = graph.friendships.map(f => friendOf(f, userId))
  const requests = [...graph.requests as { from_user: string; to_user: string; created_at?: string }[]]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const incomingIds = requests.filter(r => r.to_user === userId).map(r => r.from_user)
  const sentIds = requests.filter(r => r.from_user === userId).map(r => r.to_user)
  const blockedIds = graph.blocks.map(b => b.blocked)

  const ids = [...new Set([...friendIds, ...incomingIds, ...sentIds, ...blockedIds])]
  const { data } = ids.length > 0
    ? await supabase.from('profiles').select('id, username, display_name, accent_colour, xp').in('id', ids)
    : { data: [] }
  const people = new Map(((data ?? []) as ProfileRow[]).map(p => [p.id, toPerson(p)]))
  const pick = (list: string[]) => list.map(id => people.get(id)).filter((p): p is PersonSummary => p != null)

  return {
    friends: pick(friendIds).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    incoming: pick(incomingIds),
    sent: pick(sentIds),
    blocked: pick(blockedIds),
  }
}

/**
 * "Playing now" for the dashboard and its once-a-minute refresh: in the
 * public edition you and your friends only, in the friends edition everyone.
 */
export async function getPlayingNowFor(supabase: SupabaseClient, userId: string): Promise<PlayingNowEntry[]> {
  const friendIds = FEATURES.friendSystem ? await getFriendIds(supabase, userId) : undefined
  return getPlayingNow(supabase, userId, Date.now(), friendIds)
}
