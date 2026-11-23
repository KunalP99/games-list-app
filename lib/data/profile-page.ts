import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { escapeLike } from '@/lib/query-escape'
import { privacyAllows, type PrivacyKey, type Relation } from '@/lib/friends'
import { getRelation } from '@/lib/data/friends'
import type { Profile } from '@/lib/types'

/**
 * The person a `/users/[username]` page is about, and how the viewer stands
 * to them.
 *
 * The friends edition matches the name exactly, as it always has. The public
 * edition's usernames are case-insensitive, and an old name (from before a
 * rename, kept in username_redirects) forwards to the current profile.
 */
export async function getProfileForPage(rawUsername: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const columns = FEATURES.friendSystem
    ? 'id, display_name, username, ticket_balance, xp, accent_colour, wheel_turn, wheel_enabled, privacy_profile, privacy_games, privacy_achievements, privacy_activity, privacy_tickets'
    : 'id, display_name, username, ticket_balance, accent_colour, wheel_turn, wheel_enabled'
  let profileQuery = supabase
    .from('profiles')
    .select(FEATURES.newProfile ? `${columns}, bio, profile_layout` : columns)
  const requested = decodeURIComponent(rawUsername)
  profileQuery = FEATURES.secureAuth
    ? profileQuery.ilike('username', escapeLike(requested))
    : profileQuery.eq('username', rawUsername)
  const { data: profile } = await profileQuery.maybeSingle() as { data: Profile | null }

  if (!profile && FEATURES.secureAuth) {
    const { data: moved } = await ((supabase as any).from('username_redirects'))
      .select('profiles(username)')
      .eq('old_username', requested.toLowerCase())
      .maybeSingle() as { data: { profiles: { username: string } | null } | null }
    if (moved?.profiles?.username) redirect(`/users/${encodeURIComponent(moved.profiles.username)}`)
  }
  if (!profile) notFound()

  const isOwner = user?.id === profile.id

  // Public edition: what this viewer may see of them (lib/friends.ts). The
  // database applies the same rule to the rows themselves (db/friends.sql);
  // this just keeps sections it would leave empty off the page.
  const relation: Relation = !FEATURES.friendSystem || isOwner
    ? 'self'
    : user ? await getRelation(supabase, user.id, profile.id) : 'none'
  const allows = (key: PrivacyKey) => privacyAllows(profile[key] ?? 'everyone', relation)
  const name = profile.display_name ?? profile.username

  // Only letters/digits start an initial — a display name like "Alex (test)"
  // would otherwise render as "A(".
  const initials = name
    .split(/[\s_-]+/)
    // Strip leading punctuation so a word like "(test)" contributes "t", not "(".
    // No \p{…} escapes here — the TS target predates the `u` flag.
    .map((w: string) => w.replace(/^[^0-9A-Za-zÀ-ɏ]+/, '').charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
  // Their accent, never the viewer's — `brand-*` classes resolve to whoever is
  // logged in, so the friend's colour is always passed down as a value.
  const accent = profile.accent_colour ?? '#7c3aed'

  return { supabase, user, profile, isOwner, relation, allows, name, initials, accent }
}
