import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/data/profile'
import Nav from '@/components/layout/Nav'
import AchievementProvider from '@/components/layout/AchievementProvider'
import ThemeInitialiser from '@/components/layout/ThemeInitialiser'
import WhatsNewModal from '@/components/layout/WhatsNewModal'
import { readFlashAchievements } from '@/lib/achievements'
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/notifications'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const profile = await getProfile(user.id)

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const pendingAchievements = readFlashAchievements()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: latestChangelog }, { data: notifications }, { count: unreadCount }, { count: totalCount }] = await Promise.all([
    supabase
      .from('changelog_entries')
      .select('id, version, title, body')
      .gte('released_at', sevenDaysAgo)
      .order('released_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('notifications')
      .select('*, game:games(cover_image_url)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATIONS_PAGE_SIZE),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false),
    supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ])
  const notificationList = (notifications ?? []) as unknown as import('@/lib/notifications').NotificationWithGame[]

  return (
    <AchievementProvider initialAchievements={pendingAchievements}>
      <ThemeInitialiser preference={(profile as any).theme_preference ?? 'system'} accentColour={profile.accent_colour ?? null} />
      <div className="min-h-screen bg-surface-page">
        <Nav profile={profile} notifications={notificationList} unreadCount={unreadCount ?? 0} totalCount={totalCount ?? 0} />
        <main className="max-w-6xl mx-auto px-4 pt-24 pb-8">{children}</main>
        <WhatsNewModal entry={latestChangelog ?? null} />
      </div>
    </AchievementProvider>
  )
}
