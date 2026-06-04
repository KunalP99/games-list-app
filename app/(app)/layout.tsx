import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/data/profile'
import Nav from '@/components/layout/Nav'
import AchievementProvider from '@/components/layout/AchievementProvider'
import ThemeInitialiser from '@/components/layout/ThemeInitialiser'
import WhatsNewModal from '@/components/layout/WhatsNewModal'
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: latestChangelog } = await supabase
    .from('changelog_entries')
    .select('id, version, title, body')
    .gte('released_at', sevenDaysAgo)
    .order('released_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <AchievementProvider initialAchievements={pendingAchievements}>
      <ThemeInitialiser preference={(profile as any).theme_preference ?? 'system'} accentColour={profile.accent_colour ?? null} />
      <div className="min-h-screen bg-surface-page">
        <Nav profile={profile} />
        <main className="max-w-6xl mx-auto px-4 pt-24 pb-8">{children}</main>
        <WhatsNewModal entry={latestChangelog ?? null} />
      </div>
    </AchievementProvider>
  )
}
