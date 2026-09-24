import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/data/profile'
import Nav from '@/components/layout/Nav'
import AchievementProvider from '@/components/layout/AchievementProvider'
import ThemeInitialiser from '@/components/layout/ThemeInitialiser'
import NotificationBellData, { NotificationBellFallback } from '@/components/layout/NotificationBellData'
import WhatsNewLoader from '@/components/layout/WhatsNewLoader'
import { readFlashAchievements } from '@/lib/achievements'

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

  // The bell's notifications and the changelog entry used to be awaited right
  // here, which put two more Supabase round trips on the critical path of every
  // navigation — for a bell badge and a modal that usually isn't shown. They
  // now stream in behind Suspense, so the nav and the page render as soon as
  // the profile is known.
  return (
    <AchievementProvider initialAchievements={pendingAchievements}>
      <ThemeInitialiser preference={(profile as any).theme_preference ?? 'system'} accentColour={profile.accent_colour ?? null} />
      <div className="min-h-screen bg-surface-page">
        <Nav
          profile={profile}
          notificationSlot={
            <Suspense fallback={<NotificationBellFallback />}>
              <NotificationBellData userId={user.id} accentColour={profile.accent_colour ?? '#7c3aed'} />
            </Suspense>
          }
        />
        <main className="max-w-6xl mx-auto px-4 pt-24 pb-8">{children}</main>
        <Suspense fallback={null}>
          <WhatsNewLoader />
        </Suspense>
      </div>
    </AchievementProvider>
  )
}
