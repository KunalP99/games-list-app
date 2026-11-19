import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { getFriendIds } from '@/lib/data/friends'
import { computeUserStats } from '@/lib/user-stats'
import { computeWrappedExtras } from '@/lib/stats-wrapped'
import FriendPicker from '@/components/stats/FriendPicker'
import StatsSolo from '@/components/stats/wrapped/StatsSolo'
import StatsVersus from '@/components/stats/wrapped/StatsVersus'

/** The site's default accent, for anyone who hasn't picked one. */
const DEFAULT_ACCENT = '#ff5722'

/**
 * Stats, "Wrapped" style. Opens on your own stats; the dropdown switches to a
 * head-to-head with a friend (`?compare=<username>`), and "Just me" goes back.
 */
export default async function StatsPage(
  props: {
    searchParams: Promise<{ compare?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Who you can compare with: everyone in the friends edition, your friends in
  // the public edition (lib/data/friends.ts).
  const onlyFriends = FEATURES.friendSystem ? await getFriendIds(supabase, user!.id) : null
  let profilesQuery = supabase
    .from('profiles')
    .select('id, display_name, username, accent_colour')
    .neq('id', user!.id)
  if (onlyFriends) profilesQuery = profilesQuery.in('id', onlyFriends)
  const { data: allProfiles } = await (onlyFriends && onlyFriends.length === 0
    ? Promise.resolve({ data: [] })
    : profilesQuery.order('display_name', { ascending: true, nullsFirst: false })) as {
      data: { id: string; display_name: string | null; username: string; accent_colour: string | null }[] | null
    }
  const friends = allProfiles ?? []

  // Only a real friend switches to the head-to-head; anything else is just you.
  const compareTo = friends.find(f => f.username === searchParams.compare?.trim()) ?? null

  const [myStats, myExtras, friendStats, friendExtras] = await Promise.all([
    computeUserStats(supabase, user!.id),
    computeWrappedExtras(supabase, user!.id),
    compareTo ? computeUserStats(supabase, compareTo.id) : null,
    compareTo ? computeWrappedExtras(supabase, compareTo.id) : null,
  ])

  const myAccent = myStats.profile.accent_colour ?? DEFAULT_ACCENT

  return (
    <div className="space-y-6">
      {/* No visible title — the page explains itself — but screen readers
          still get one. The picker sits on the left, above the bands. */}
      <h1 className="sr-only">Stats</h1>
      {friends.length > 0 && (
        <FriendPicker friends={friends} currentCompare={compareTo?.username ?? null} />
      )}

      {compareTo && friendStats && friendExtras ? (
        <StatsVersus
          me={{ stats: myStats, extras: myExtras, accent: myAccent, name: 'You' }}
          friend={{
            stats: friendStats,
            extras: friendExtras,
            accent: compareTo.accent_colour ?? DEFAULT_ACCENT,
            name: compareTo.display_name ?? compareTo.username,
          }}
        />
      ) : (
        <StatsSolo stats={myStats} extras={myExtras} accent={myAccent} />
      )}
    </div>
  )
}
