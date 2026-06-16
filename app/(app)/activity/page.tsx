import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { buildActivityItems, activityVerb, formatActivityDate, getInitials, type RawAchievementUnlock } from '@/lib/activity'

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
    .select('id, user_id, title, status, image_url, completion_date, created_at, updated_at, hours_played, achievement_progress')
    .in('user_id', allUserIds)
    .order('updated_at', { ascending: false })
    .limit(60) as { data: { id: string; user_id: string; title: string; status: string; image_url: string | null; completion_date: string | null; created_at: string; updated_at: string; hours_played: number | null; achievement_progress: number | null }[] | null }

  const { data: allSpins } = await supabase
    .from('wheel_spins')
    .select('id, user_id, spin_type, result_name, created_at')
    .in('user_id', allUserIds)
    .order('created_at', { ascending: false })
    .limit(30) as { data: { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }[] | null }

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

  const items = buildActivityItems(allGames ?? [], allSpins ?? [], profileMap, ticketsByGame, user!.id, achievementUnlocks).slice(0, 40)

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
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: item.accentColour ?? '#7c3aed' }}
                >
                  {getInitials(item.displayName)}
                </div>

                {/* Game thumbnail (not for wheel spins, choose skips, or achievement unlocks) */}
                {item.gameImageUrl && item.type !== 'wheel_spin' && item.type !== 'choose_skip' && item.type !== 'achievement_unlock' && (
                  <img
                    src={item.gameImageUrl}
                    alt={item.gameTitle}
                    className="w-9 h-9 rounded object-cover shrink-0"
                  />
                )}

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg-base leading-snug truncate">
                    <span className="font-semibold">
                      {item.isSelf ? 'You' : item.displayName}
                    </span>
                    {' '}
                    <span className="text-fg-muted">{activityVerb(item)}</span>
                    {item.gameTitle && item.type !== 'wheel_spin' && item.type !== 'choose_skip' && (
                      <>{' '}<span className="font-medium">{item.gameTitle}</span></>
                    )}
                    {item.achievementName && (
                      <>{' '}<span className="font-medium">{item.achievementIcon} {item.achievementName}</span></>
                    )}
                  </p>
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
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
