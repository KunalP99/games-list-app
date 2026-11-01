import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { buildActivityItems, groupActivityItems, suppressRepeatedStarts, activityVerb, activitySuffix, formatActivityDate, getInitials, type RawAchievementUnlock, type RawPlaySession } from '@/lib/activity'
import ActivityBatchChips from '@/components/activity/ActivityBatchChips'

// How many members of a day's batch get named before the rest collapse into a
// "+N" chip. Three fits one line at the narrowest layout the row has.
const BATCH_SHOWN = 3

export default async function ActivityPage() {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('id, display_name, username, accent_colour')
    .eq('id', user!.id)
    .single() as { data: Profile | null; error: unknown }

  const { data: friendProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, username, accent_colour')
    .neq('id', user!.id)
    .order('display_name', { ascending: true, nullsFirst: false }) as { data: Profile[] | null }

  const friendIds = (friendProfiles ?? []).map(f => f.id)
  const allUserIds = [user!.id, ...friendIds]

  const { data: allGames } = await supabase
    .from('games')
    .select('id, user_id, title, status, image_url, cover_image_url, completion_date, created_at, updated_at, hours_played, achievement_progress')
    .in('user_id', allUserIds)
    .order('updated_at', { ascending: false })
    .limit(60) as { data: { id: string; user_id: string; title: string; status: string; image_url: string | null; cover_image_url: string | null; completion_date: string | null; created_at: string; updated_at: string; hours_played: number | null; achievement_progress: number | null }[] | null }

  const { data: allSpins } = await supabase
    .from('wheel_spins')
    .select('id, user_id, spin_type, result_name, created_at')
    .in('user_id', allUserIds)
    .order('created_at', { ascending: false })
    .limit(30) as { data: { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }[] | null }

  const { data: rawSessions } = await supabase
    .from('play_sessions')
    .select('user_id, game_id, started_at, ended_at, minutes')
    .in('user_id', allUserIds)
    .order('started_at', { ascending: false })
    .limit(30) as { data: RawPlaySession[] | null }

  // "Started playing" is only worth saying the first time — an in-progress
  // session's own row in `rawSessions` can't tell that on its own, since it's
  // only a recent window; this checks every session those specific games
  // have ever had, not just the ones that made the recent-30 cut.
  const ongoingGameIds = Array.from(new Set((rawSessions ?? []).filter(s => !s.ended_at && s.game_id).map(s => s.game_id!)))
  const { data: sessionHistory } = ongoingGameIds.length > 0
    ? await supabase
        .from('play_sessions')
        .select('user_id, game_id, started_at')
        .in('game_id', ongoingGameIds) as { data: { user_id: string; game_id: string | null; started_at: string }[] | null }
    : { data: [] as { user_id: string; game_id: string | null; started_at: string }[] }
  const sessions = suppressRepeatedStarts(rawSessions ?? [], sessionHistory ?? [])

  const { data: rawUnlocks } = await (supabase.from('user_achievements') as any)
    .select('user_id, achievement_id, unlocked_at')
    .in('user_id', allUserIds)
    .order('unlocked_at', { ascending: false })
    .limit(40) as { data: { user_id: string; achievement_id: string; unlocked_at: string }[] | null }

  const completedGameIds = (allGames ?? []).filter(g => g.status === 'completed').map(g => g.id)
  const { data: ticketRows } = completedGameIds.length > 0
    ? await supabase
        .from('ticket_transactions')
        .select('game_id, amount')
        .in('game_id', completedGameIds)
        .gt('amount', 0) as { data: { game_id: string; amount: number }[] | null }
    : { data: [] as { game_id: string; amount: number }[] }

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

  // Group before slicing, so a day of unlocks costs one row of the 40 rather
  // than crowding everything else out.
  const items = groupActivityItems(
    buildActivityItems(allGames ?? [], allSpins ?? [], profileMap, ticketsByGame, user!.id, achievementUnlocks, sessions),
  ).slice(0, 40)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Recent Activity</h1>
        <p className="mt-1 text-fg-muted text-sm">You and your friends</p>
      </div>

      {items.length === 0 ? (
        <p className="text-fg-subtle text-sm">No recent activity yet.</p>
      ) : (
        <div className="bg-surface-base border border-edge-base rounded-xl overflow-hidden">
          <div className="divide-y divide-edge-subtle">
            {items.map((item, i) => {
              // A day's worth of unlocks (or backlog adds) renders as one row:
              // a count in the headline, then named chips with the remainder
              // hidden behind +N.
              const batch = item.batch ?? []
              const isBatch = batch.length > 1
              const batchNoun = item.type === 'backlog' ? 'games' : 'achievements'
              // Your own name goes to My Games, which carries your profile
              // banner and stats; a friend's goes to their profile page.
              const profileHref = item.isSelf ? '/games' : `/users/${encodeURIComponent(item.username)}`

              return (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                {/* Avatar — links to the same place as the name, since an
                    unclickable avatar beside a clickable name is a papercut */}
                <Link
                  href={profileHref}
                  aria-label={item.isSelf ? 'Your games' : `${item.displayName}'s profile`}
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
                >
                  {getInitials(item.displayName)}
                </Link>

                {/* Game thumbnail — portrait box art (falls back to the banner) */}
                {(item.gameCoverUrl ?? item.gameImageUrl) && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'choose_skip' && item.type !== 'achievement_unlock' && (
                  <img
                    src={item.gameCoverUrl ?? item.gameImageUrl}
                    alt={item.gameTitle}
                    className="w-9 h-12 rounded object-cover shrink-0"
                  />
                )}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg-base leading-snug truncate">
                    <Link href={profileHref} className="font-semibold hover:underline">
                      {item.isSelf ? 'You' : item.displayName}
                    </Link>
                    {' '}
                    {/* "added to backlog" reads wrong with a count after it,
                        so a backlog batch splits the verb around the number:
                        "added 4 games to backlog". */}
                    <span className="text-fg-muted">
                      {isBatch && item.type === 'backlog' ? 'added' : activityVerb(item)}
                    </span>
                    {item.gameTitle && !isBatch && item.type !== 'wheel_spin' && item.type !== 'game_chosen' && item.type !== 'choose_skip' && (
                      <>{' '}<span className="font-medium">{item.gameTitle}</span>{activitySuffix(item)}</>
                    )}
                    {isBatch && (
                      <>
                        {' '}<span className="font-medium">{batch.length} {batchNoun}</span>
                        {item.type === 'backlog' && <span className="text-fg-muted"> to backlog</span>}
                      </>
                    )}
                    {!isBatch && item.achievementName && (
                      <>{' '}<span className="font-medium">{item.achievementIcon} {item.achievementName}</span></>
                    )}
                  </p>

                  {isBatch && <ActivityBatchChips entries={batch} shown={BATCH_SHOWN} />}

                  <p className="text-xs text-fg-subtle mt-0.5">{formatActivityDate(item.date)}</p>
                </div>

                {/* Right-side rewards */}
                {(item.ticketsEarned != null && item.ticketsEarned > 0) || item.xpEarned != null ? (
                  <div className="shrink-0 flex flex-col items-end gap-0.5 text-xs font-medium">
                    {item.ticketsEarned != null && item.ticketsEarned > 0 && (
                      <span className="text-emerald-500">+{item.ticketsEarned} 🎟️</span>
                    )}
                    {item.xpEarned != null && (
                      <span style={{ color: item.accentColour ?? 'rgb(var(--brand-500))' }}>+{item.xpEarned} XP</span>
                    )}
                  </div>
                ) : null}
              </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
