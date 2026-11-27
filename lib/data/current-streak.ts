import { streakStatus, MAX_PLAY_PERIOD_DAYS } from '@/lib/dashboard'
import { londonDay } from '@/lib/activity'
import { fetchAllRows } from '@/lib/data/fetch-all'

type Supabase = { from: (t: string) => any }

/**
 * Someone's current play streak in days (0 when there's none): consecutive
 * UK days with a tracked session, still alive if they played today or
 * yesterday. The same rule and the same year's look-back as the dashboard's
 * streak pill (NewDashboard), so the two always agree. For the banner on My
 * Games and profiles (ProfileHero). Reads through the caller's client, so the
 * read rules apply.
 */
export async function getCurrentStreak(supabase: Supabase, userId: string, now: Date = new Date()): Promise<number> {
  const from = new Date(now.getTime() - (MAX_PLAY_PERIOD_DAYS + 1) * 86_400_000).toISOString()
  const rows = await fetchAllRows<{ started_at: string }>(() => supabase
    .from('play_sessions')
    .select('started_at')
    .eq('user_id', userId)
    .gte('started_at', from)
    .order('started_at', { ascending: false })
    .order('id'))
  return streakStatus(rows.map(r => londonDay(r.started_at)), now)?.days ?? 0
}
