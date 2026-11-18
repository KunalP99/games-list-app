'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FEATURES } from '@/lib/edition'
import { canChangeUsername } from '@/lib/username'
import { usernameStatus, type UsernameStatus } from '@/lib/data/usernames'

/**
 * Choosing and changing usernames (public edition's secure sign-up). The
 * `username` column isn't writable by users directly (db/security-hardening.sql),
 * so every change goes through here, on the service role, scoped to the
 * caller's own id from auth.getUser().
 */

type Me = { id: string; username: string; username_chosen: boolean; username_changed_at: string | null }

async function me(): Promise<Me | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (createAdminClient().from('profiles') as any)
    .select('id, username, username_chosen, username_changed_at')
    .eq('id', user.id)
    .single() as { data: Me | null }
  return data
}

/** The live check, where your own current name counts as yours. */
export async function checkMyUsername(raw: string): Promise<UsernameStatus> {
  if (!FEATURES.secureAuth) return { status: 'invalid', error: 'Not available.' }
  const profile = await me()
  return usernameStatus(raw, profile?.id)
}

/** Picking a username for the first time, after signing in with Google or Discord (/welcome). */
export async function setInitialUsername(formData: FormData) {
  if (!FEATURES.secureAuth) return { error: 'Not available.' }
  const profile = await me()
  if (!profile) redirect('/login')
  if (profile.username_chosen) redirect('/dashboard')

  const status = await usernameStatus((formData.get('username') as string | null) ?? '', profile.id)
  if (status.status === 'invalid') return { error: status.error }
  if (status.status === 'taken') return { error: `The username “${status.username}” is taken.` }
  const displayName = ((formData.get('display_name') as string | null) ?? '').trim().slice(0, 50)

  const { error } = await (createAdminClient().from('profiles') as any)
    .update({
      username: status.username,
      username_chosen: true,
      ...(displayName ? { display_name: displayName } : {}),
    })
    .eq('id', profile.id)
  if (error) return { error: /duplicate|unique/i.test(error.message) ? 'That username was just taken. Try another.' : error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/**
 * Changing your username from Settings: at most once every 30 days. The old
 * name is kept in `username_redirects`, so profile links shared before still
 * lead to you, and nobody else can take it.
 */
export async function updateUsername(raw: string): Promise<{ success: true; username: string } | { success: false; error: string }> {
  if (!FEATURES.secureAuth) return { success: false, error: 'Not available.' }
  const profile = await me()
  if (!profile) return { success: false, error: 'Not signed in.' }

  const status = await usernameStatus(raw, profile.id)
  if (status.status === 'invalid') return { success: false, error: status.error }
  if (status.status === 'taken') return { success: false, error: `The username “${status.username}” is taken.` }
  if (status.username === profile.username.toLowerCase()) return { success: true, username: profile.username }

  const allowed = canChangeUsername(profile.username_changed_at)
  if (!allowed.ok) {
    const when = allowed.nextAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' })
    return { success: false, error: `You can change your username again on ${when}.` }
  }

  const sb = createAdminClient()
  // Keep the old name pointing at you, and drop any old entry for the name
  // you're taking (it was yours, or isUsernameTaken would have said taken).
  await (sb.from('username_redirects') as any).delete().eq('old_username', status.username)
  const { error: redirectError } = await (sb.from('username_redirects') as any)
    .upsert({ old_username: profile.username.toLowerCase(), user_id: profile.id })
  if (redirectError) return { success: false, error: redirectError.message }

  const { error } = await (sb.from('profiles') as any)
    .update({ username: status.username, username_changed_at: new Date().toISOString(), username_chosen: true })
    .eq('id', profile.id)
  if (error) return { success: false, error: /duplicate|unique/i.test(error.message) ? 'That username was just taken. Try another.' : error.message }

  revalidatePath('/', 'layout')
  return { success: true, username: status.username }
}
