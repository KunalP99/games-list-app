import { FEATURES } from '@/lib/edition'

type Supabase = { from: (t: string) => any }

/**
 * The wheel game holding the wheel, if any (friends edition, FEATURES.wheelLock):
 * a game won since the lock came in (games.locks_wheel) that's still Playing.
 * The wheel can't be spun until it's completed, DNF'd or deleted. Null when
 * nothing locks it, or in an edition without the lock.
 */
export async function wheelLockGame(supabase: Supabase, userId: string): Promise<{ id: string; title: string } | null> {
  if (!FEATURES.wheelLock) return null
  const { data } = await supabase
    .from('games')
    .select('id, title')
    .eq('user_id', userId)
    .eq('status', 'playing')
    .eq('locks_wheel', true)
    .order('start_date', { ascending: false, nullsFirst: false })
    .limit(1)
  return (data?.[0] as { id: string; title: string } | undefined) ?? null
}
