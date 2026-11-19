import type { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { FEATURES } from '@/lib/edition'
import { settleSession } from '@/lib/presence'
import { getFriendIds } from '@/lib/data/friends'
import { buildActivityItems, groupActivityItems, suppressRepeatedStarts, type ActivityItem, type RawAchievementUnlock, type RawPlaySession } from '@/lib/activity'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * You and your friends' recent activity, newest first: completions, DNFs,
 * backlog adds, wheel results, achievement unlocks and tracked play sessions.
 * Used by /activity and the new dashboard's Activity card, so the two always
 * say the same thing.
 *
 * Grouped before slicing, so one person's day of unlocks or backlog adds costs
 * a single row rather than crowding everything else out.
 */
export async function getActivityFeed(supabase: Supabase, userId: string, limit = 40): Promise<ActivityItem[]> {
  // Friends edition: everyone signed up is a friend. Public edition: your
  // friends only (and the read rules still apply each one's privacy).
  const onlyFriends = FEATURES.friendSystem ? await getFriendIds(supabase, userId) : null
  let friendsQuery = supabase
    .from('profiles')
    .select('id, display_name, username, accent_colour')
    .neq('id', userId)
  if (onlyFriends) friendsQuery = friendsQuery.in('id', onlyFriends)
  const [{ data: myProfile }, { data: friendProfiles }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, username, accent_colour')
      .eq('id', userId)
      .single() as unknown as Promise<{ data: Profile | null }>,
    (onlyFriends && onlyFriends.length === 0
      ? Promise.resolve({ data: [] })
      : friendsQuery.order('display_name', { ascending: true, nullsFirst: false })) as unknown as Promise<{ data: Profile[] | null }>,
  ])

  const friendIds = (friendProfiles ?? []).map(f => f.id)
  const allUserIds = [userId, ...friendIds]

  const [{ data: allGames }, { data: allSpins }, { data: rawSessions }, { data: rawUnlocks }] = await Promise.all([
    supabase
      .from('games')
      .select('id, user_id, title, status, image_url, cover_image_url, completion_date, created_at, updated_at, hours_played, achievement_progress')
      .in('user_id', allUserIds)
      .order('updated_at', { ascending: false })
      .limit(60) as unknown as Promise<{ data: { id: string; user_id: string; title: string; status: string; image_url: string | null; cover_image_url: string | null; completion_date: string | null; created_at: string; updated_at: string; hours_played: number | null; achievement_progress: number | null }[] | null }>,
    // No wheel in this edition, so no spins to read (lib/edition.ts).
    FEATURES.wheel
      ? supabase
          .from('wheel_spins')
          .select('id, user_id, spin_type, result_name, created_at')
          .in('user_id', allUserIds)
          .order('created_at', { ascending: false })
          .limit(30) as unknown as Promise<{ data: { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }[] | null }>
      : Promise.resolve({ data: [] as { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }[] }),
    supabase
      .from('play_sessions')
      .select('user_id, game_id, started_at, ended_at, last_checkpoint_at, minutes')
      .in('user_id', allUserIds)
      .order('started_at', { ascending: false })
      .limit(60) as unknown as Promise<{ data: RawPlaySession[] | null }>,
    (supabase.from('user_achievements') as any)
      .select('user_id, achievement_id, unlocked_at')
      .in('user_id', allUserIds)
      .order('unlocked_at', { ascending: false })
      .limit(40) as Promise<{ data: { user_id: string; achievement_id: string; unlocked_at: string }[] | null }>,
  ])

  // "Started playing" is only worth saying the first time — an in-progress
  // session's own row in `rawSessions` can't tell that on its own, since it's
  // only a recent window; this checks every session those specific games
  // have ever had, not just the ones that made the recent-60 cut.
  // A session the tracker never closed (crash, restart, PC asleep) has no end
  // either; it ended at its last checkpoint, as the game page shows it.
  const nowMs = Date.now()
  const settledSessions = (rawSessions ?? []).map(s => settleSession({ ...s, last_checkpoint_at: s.last_checkpoint_at ?? null }, nowMs))
  const ongoingGameIds = Array.from(new Set(settledSessions.filter(s => !s.ended_at && s.game_id).map(s => s.game_id!)))
  const completedGameIds = (allGames ?? []).filter(g => g.status === 'completed').map(g => g.id)

  const [{ data: sessionHistory }, { data: ticketRows }] = await Promise.all([
    ongoingGameIds.length > 0
      ? supabase
          .from('play_sessions')
          .select('user_id, game_id, started_at')
          .in('game_id', ongoingGameIds) as unknown as Promise<{ data: { user_id: string; game_id: string | null; started_at: string }[] | null }>
      : Promise.resolve({ data: [] as { user_id: string; game_id: string | null; started_at: string }[] }),
    completedGameIds.length > 0
      ? supabase
          .from('ticket_transactions')
          .select('game_id, amount')
          .in('game_id', completedGameIds)
          .gt('amount', 0) as unknown as Promise<{ data: { game_id: string; amount: number }[] | null }>
      : Promise.resolve({ data: [] as { game_id: string; amount: number }[] }),
  ])
  const sessions = suppressRepeatedStarts(settledSessions, sessionHistory ?? [])

  const ticketsByGame = (ticketRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.game_id] = (acc[r.game_id] ?? 0) + r.amount
    return acc
  }, {})

  const achievementLookup = new Map(ACHIEVEMENTS.map(a => [a.id, a]))
  const achievementUnlocks: RawAchievementUnlock[] = (rawUnlocks ?? []).flatMap(r => {
    const ach = achievementLookup.get(r.achievement_id)
    if (!ach) return []
    return [{ user_id: r.user_id, achievement_id: r.achievement_id, achievement_name: ach.name, achievement_icon: ach.icon, xp: ach.xp, unlocked_at: r.unlocked_at }]
  })

  const allProfiles = [...(friendProfiles ?? []), ...(myProfile ? [myProfile] : [])]
  const profileMap = new Map(allProfiles.map(p => [
    p.id,
    { displayName: p.display_name ?? p.username, username: p.username, accentColour: p.accent_colour ?? null },
  ]))

  return groupActivityItems(
    buildActivityItems(allGames ?? [], allSpins ?? [], profileMap, ticketsByGame, userId, achievementUnlocks, sessions),
  ).slice(0, limit)
}
