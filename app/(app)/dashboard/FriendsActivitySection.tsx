import { createClient } from '@/lib/supabase/server'
import RecommendationsCarousel from '@/components/users/RecommendationsCarousel'
import FriendActivityFeed from '@/components/dashboard/FriendActivityFeed'
import { buildActivityItems, type RawAchievementUnlock } from '@/lib/activity'
import { ACHIEVEMENTS } from '@/lib/achievements'
import { providerIdOf } from '@/lib/rawg'

type Props = {
  userId: string
  friendIds: string[]
  myTitles: Set<string>
  genreCounts: Record<string, number>
  friendProfileMap: Map<string, { displayName: string; username: string; accentColour: string | null }>
  // Rendered beside the recommendations carousel (the dashboard's Upcoming Events card).
  eventsSlot?: React.ReactNode
}

export default async function FriendsActivitySection({ userId, friendIds, myTitles, genreCounts, friendProfileMap, eventsSlot }: Props) {
  // Recommendations + activity need friends; the events card does not, so still
  // render the top row (with the events slot) even when the user has no friends.
  if (friendIds.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {eventsSlot}
      </div>
    )
  }

  const supabase = createClient()

  // Wave A — all independent of each other
  const [
    friendCompletedGamesRes,
    friendGamesRes,
    friendSpinsRes,
    rawFriendUnlocksRes,
  ] = await Promise.all([
    supabase
      .from('games')
      .select('id, title, genres, rating, image_url, developer, user_id, rawg_id, igdb_id, release_date')
      .in('user_id', friendIds)
      .eq('status', 'completed'),
    supabase
      .from('games')
      .select('id, user_id, title, status, image_url, cover_image_url, completion_date, created_at, updated_at, hours_played, achievement_progress')
      .in('user_id', friendIds)
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase
      .from('wheel_spins')
      .select('id, user_id, spin_type, result_name, created_at')
      .in('user_id', friendIds)
      .order('created_at', { ascending: false })
      .limit(20),
    (supabase.from('user_achievements') as any)
      .select('user_id, achievement_id, unlocked_at')
      .in('user_id', friendIds)
      .order('unlocked_at', { ascending: false })
      .limit(20),
  ])

  const friendCompletedGames = friendCompletedGamesRes.data as { id: string; title: string; genres: string[] | null; rating: number | null; image_url: string | null; developer: string | null; user_id: string; rawg_id: number | null; igdb_id: number | null; release_date: string | null }[] | null
  const friendGames = friendGamesRes.data as { id: string; user_id: string; title: string; status: string; image_url: string | null; cover_image_url: string | null; completion_date: string | null; created_at: string; updated_at: string; hours_played: number | null; achievement_progress: number | null }[] | null
  const friendSpins = friendSpinsRes.data as { id: string; user_id: string; spin_type: string; result_name: string | null; created_at: string }[] | null
  const rawFriendUnlocks = rawFriendUnlocksRes.data as { user_id: string; achievement_id: string; unlocked_at: string }[] | null

  // Wave B — needs friendGames to compute the IDs
  const completedFriendGameIds = (friendGames ?? []).filter(g => g.status === 'completed').map(g => g.id)
  const { data: friendTicketRows } = completedFriendGameIds.length > 0
    ? await supabase
        .from('ticket_transactions')
        .select('game_id, amount')
        .in('game_id', completedFriendGameIds)
        .gt('amount', 0) as { data: { game_id: string; amount: number }[] | null }
    : { data: [] as { game_id: string; amount: number }[] }

  const friendTicketsByGame = (friendTicketRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.game_id] = (acc[r.game_id] ?? 0) + r.amount
    return acc
  }, {})

  const friendMap = Object.fromEntries(
    Array.from(friendProfileMap.entries()).map(([id, p]) => [id, p.displayName])
  )

  const recommendationPool = (friendCompletedGames ?? [])
    .filter(g => !myTitles.has(g.title.trim().toLowerCase()))
    .filter(g => g.rating == null || g.rating >= 3)
    .map(g => {
      const base = g.rating ?? 3
      const bonus = (g.genres ?? []).reduce((s: number, genre: string) => s + (genreCounts[genre] ?? 0) * 0.5, 0)
      // Normalise to the active provider's id so the add-to-backlog review modal can look it up.
      return { ...g, rawg_id: providerIdOf(g), score: base + bonus, recommendedBy: friendMap[g.user_id] ?? 'A friend' }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 25)

  const recommendations = seededShuffle(recommendationPool, weekSeed()).slice(0, 10)

  const achievementLookup = new Map(ACHIEVEMENTS.map(a => [a.id, a]))
  const friendAchievementUnlocks: RawAchievementUnlock[] = (rawFriendUnlocks ?? []).flatMap(r => {
    const ach = achievementLookup.get(r.achievement_id)
    if (!ach) return []
    return [{ user_id: r.user_id, achievement_id: r.achievement_id, achievement_name: ach.name, achievement_icon: ach.icon, xp: ach.xp, unlocked_at: r.unlocked_at }]
  })

  const friendActivityItems = buildActivityItems(
    friendGames ?? [],
    friendSpins ?? [],
    friendProfileMap,
    friendTicketsByGame,
    userId,
    friendAchievementUnlocks,
  )

  if (recommendations.length === 0 && friendActivityItems.length === 0 && !eventsSlot) return null

  // Recommendations are temporarily hidden — flip to true to bring the carousel back.
  const SHOW_RECOMMENDATIONS = false

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
      {SHOW_RECOMMENDATIONS && recommendations.length > 0 && (
        <div className="flex flex-col min-h-0">
          <h2 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">Recommended by your friends</h2>
          <RecommendationsCarousel games={recommendations} />
        </div>
      )}

      {/* Friends activity — beside the Upcoming Events card */}
      {friendActivityItems.length > 0 && (
        <FriendActivityFeed items={friendActivityItems.slice(0, 6)} />
      )}

      {eventsSlot}
    </div>
  )
}

function weekSeed(): number {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const week = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7)
  return now.getFullYear() * 53 + week
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    s = Math.imul(1664525, s) + 1013904223 | 0
    const j = (s >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function FriendsActivitySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
      <div className="h-64 bg-surface-base border border-edge-base rounded-xl animate-pulse" />
      <div className="h-64 bg-surface-base border border-edge-base rounded-xl animate-pulse" />
    </div>
  )
}
