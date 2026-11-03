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

  // Paired machines for the Devices section. Tolerates the table not existing
  // yet (the SQL is run by hand in production, per the schema workflow).
  const { data: devices } = await supabase
    .from('device_tokens')
    .select('id, label, last_seen_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true }) as { data: { id: string; label: string; last_seen_at: string | null; created_at: string }[] | null }

  // Programs the user has said to never auto-track. Tolerates the table not
  // existing yet, same as devices above.
  const { data: ignored } = await supabase
    .from('ignored_executables')
    .select('exe_name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true }) as { data: { exe_name: string }[] | null }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-fg-base">Settings</h1>
        <p className="text-sm text-fg-muted mt-0.5">Manage your account and preferences</p>
      </div>
      <SettingsForms
        profile={profile}
        email={user.email ?? ''}
        devices={devices ?? []}
        ignoredExecutables={(ignored ?? []).map(i => i.exe_name)}
      />
    </div>
  )
}
