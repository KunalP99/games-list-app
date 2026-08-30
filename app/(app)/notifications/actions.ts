'use server'

import { createClient } from '@/lib/supabase/server'
import { NOTIFICATIONS_PAGE_SIZE, type NotificationWithGame } from '@/lib/notifications'

// One page of the current user's notifications (newest first), for "Load more".
// Embeds the linked game's portrait cover.
export async function fetchNotifications(offset: number): Promise<NotificationWithGame[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('notifications')
    .select('*, game:games(cover_image_url)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + NOTIFICATIONS_PAGE_SIZE - 1)

  return (data ?? []) as unknown as NotificationWithGame[]
}

// Mark all of the current user's unread notifications as read.
export async function markNotificationsRead(): Promise<{ success: boolean }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false }

  await (supabase.from('notifications') as any)
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false)

  // No revalidate: the badge is cleared client-side, and the next navigation
  // re-fetches the read state naturally. Revalidating here would reset the open
  // dropdown mid-view and make the unread dots vanish.
  return { success: true }
}
