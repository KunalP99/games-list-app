import { createClient } from '@/lib/supabase/server'
import NotificationBell from '@/components/layout/NotificationBell'
import { NOTIFICATIONS_PAGE_SIZE, type NotificationWithGame } from '@/lib/notifications'

/**
 * Fetches the bell's data and renders it.
 *
 * Split out of the app layout so it can sit behind Suspense: the nav and the
 * page render as soon as the profile is known, and the bell streams in a beat
 * later. Previously these queries were awaited in the layout, which put them
 * on the critical path of every single navigation.
 */
export default async function NotificationBellData({
  userId,
  accentColour,
}: {
  userId: string
  accentColour: string
}) {
  const supabase = createClient()

  // Two queries, not three: PostgREST returns the *total* matching count
  // alongside a limited page, so `totalCount` comes free with the rows.
  const [{ data: notifications, count: totalCount }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('notifications')
      .select('*, game:games(cover_image_url)', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATIONS_PAGE_SIZE),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false),
  ])

  return (
    <NotificationBell
      notifications={(notifications ?? []) as unknown as NotificationWithGame[]}
      unreadCount={unreadCount ?? 0}
      totalCount={totalCount ?? 0}
      accentColour={accentColour}
    />
  )
}

/**
 * Placeholder occupying the bell's exact footprint (an 18px icon inside
 * p-1.5 = 30px square), so nothing shifts when the real bell streams in.
 */
export function NotificationBellFallback() {
  return <div className="w-[30px] h-[30px] shrink-0" aria-hidden="true" />
}
