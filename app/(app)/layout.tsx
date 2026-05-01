import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Nav from '@/components/layout/Nav'
import AchievementProvider from '@/components/layout/AchievementProvider'
import ThemeInitialiser from '@/components/layout/ThemeInitialiser'
import { readFlashAchievements } from '@/lib/achievements'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    await supabase.auth.signOut()
    redirect('/login')
  }

  const pendingAchievements = readFlashAchievements()

  const profileData = profile as any

  return (
    <AchievementProvider initialAchievements={pendingAchievements}>
      <ThemeInitialiser preference={profileData.theme_preference ?? 'system'} accentColour={profileData.accent_colour ?? null} />
      <div className="min-h-screen bg-surface-page">
        <Nav profile={profile} />
        <main className="max-w-6xl mx-auto px-4 pt-24 pb-8">{children}</main>
      </div>
    </AchievementProvider>
  )
}
