import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { validateUsername } from '@/lib/username'
import AuthShell from '@/components/auth/AuthShell'
import WelcomeForm from './WelcomeForm'

/**
 * "Pick your username", the first time someone signs in with Google or
 * Discord (their account was made with a stand-in name; profiles.username_chosen
 * is false). The app layout sends them here until they've chosen. Lives
 * outside the (app) layout so that redirect can't loop. Public edition only.
 */
export default async function WelcomePage() {
  if (!FEATURES.secureAuth) notFound()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase.from('profiles') as any)
    .select('username, display_name, username_chosen')
    .eq('id', user.id)
    .single() as { data: { username: string; display_name: string | null; username_chosen: boolean } | null }
  if (!profile) redirect('/login')
  if (profile.username_chosen) redirect('/dashboard')

  // Prefill the stand-in name when it already follows the rules (it came from
  // their email, so it's often a decent starting point); otherwise leave it blank.
  const suggestion = validateUsername(profile.username)
  return (
    <AuthShell title="Welcome! Pick your username" subtitle="This is how friends will find you, and it’s in your profile’s address. You can change it later, once a month.">
      <WelcomeForm defaultUsername={suggestion.ok ? suggestion.value : ''} defaultDisplayName={profile.display_name ?? ''} />
    </AuthShell>
  )
}
