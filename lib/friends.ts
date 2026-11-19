/**
 * The friends system's rules (public edition; FEATURES.friendSystem). Pure, so
 * they're unit tested; the database enforces the same privacy rule itself
 * (can_view in db/friends.sql), and these only decide what a page shows, so a
 * page can tidy away a section the database would leave empty anyway.
 */
import type { PrivacySetting } from './types'

/** How one person stands to another, from the viewer's side. */
export type Relation =
  | 'self'      // looking at yourself
  | 'friends'
  | 'requested' // you sent them a request, waiting
  | 'incoming'  // they sent you one, waiting for you
  | 'blocked'   // you blocked them (a block by them looks like 'none' to you)
  | 'none'

export type FriendGraph = {
  /** Friendship rows involving the viewer. */
  friendships: { user_a: string; user_b: string }[]
  /** Pending requests involving the viewer. */
  requests: { from_user: string; to_user: string }[]
  /** The viewer's own blocks (they can't see blocks against them). */
  blocks: { blocker: string; blocked: string }[]
}

export function relationTo(viewerId: string, otherId: string, graph: FriendGraph): Relation {
  if (viewerId === otherId) return 'self'
  if (graph.blocks.some(b => b.blocker === viewerId && b.blocked === otherId)) return 'blocked'
  if (graph.friendships.some(f =>
    (f.user_a === viewerId && f.user_b === otherId) || (f.user_b === viewerId && f.user_a === otherId))) return 'friends'
  if (graph.requests.some(r => r.from_user === viewerId && r.to_user === otherId)) return 'requested'
  if (graph.requests.some(r => r.from_user === otherId && r.to_user === viewerId)) return 'incoming'
  return 'none'
}

/** Whether `relation` may see something set to `setting` (as can_view decides). */
export function privacyAllows(setting: PrivacySetting, relation: Relation): boolean {
  if (relation === 'self') return true
  if (relation === 'blocked') return false
  if (setting === 'everyone') return true
  if (setting === 'friends') return relation === 'friends'
  return false
}

export type PrivacyKey = 'privacy_profile' | 'privacy_games' | 'privacy_achievements' | 'privacy_activity' | 'privacy_tickets'

/** The Settings → Privacy rows, in order, with the database's defaults. */
export const PRIVACY_ITEMS: { key: PrivacyKey; label: string; description: string; default: PrivacySetting }[] = [
  { key: 'privacy_profile', label: 'Profile', description: 'Your profile page: stats, charts and recent activity.', default: 'everyone' },
  { key: 'privacy_games', label: 'Games', description: 'Your games list and each game’s page.', default: 'everyone' },
  { key: 'privacy_achievements', label: 'Achievements', description: 'The achievements you’ve unlocked.', default: 'everyone' },
  { key: 'privacy_activity', label: 'Play activity', description: 'What you’re playing now, play sessions and tracked hours.', default: 'friends' },
  { key: 'privacy_tickets', label: 'Tickets', description: 'Your ticket history.', default: 'friends' },
]

export const PRIVACY_CHOICES: { value: PrivacySetting; label: string }[] = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends' },
  { value: 'only_me', label: 'Only me' },
]

export function isPrivacySetting(v: unknown): v is PrivacySetting {
  return v === 'everyone' || v === 'friends' || v === 'only_me'
}

export function isPrivacyKey(v: unknown): v is PrivacyKey {
  return PRIVACY_ITEMS.some(i => i.key === v)
}

/** The other person in a friendship row. */
export function friendOf(row: { user_a: string; user_b: string }, me: string): string {
  return row.user_a === me ? row.user_b : row.user_a
}

/** Search text worth sending: trimmed, an optional leading @ dropped, at least 2 characters. */
export function searchTerm(raw: string): string | null {
  const q = raw.trim().replace(/^@/, '').trim()
  return q.length >= 2 ? q.slice(0, 40) : null
}
