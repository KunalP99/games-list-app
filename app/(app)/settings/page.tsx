import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SettingsForms from './SettingsForms'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Settings</h1>
        <p className="text-sm text-fg-muted mt-0.5">Manage your account and preferences</p>
      </div>
      <SettingsForms profile={profile} email={user.email ?? ''} />
    </div>
  )
}
