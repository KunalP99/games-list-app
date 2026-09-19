'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const display_name = (formData.get('display_name') as string).trim() || null

  const { error } = await supabase
    .from('profiles')
    .update({ display_name } as never)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/', 'layout')
  return { success: true, data: undefined }
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const supabase = createClient()
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (newPassword !== confirmPassword) return { success: false, error: 'Passwords do not match' }
  if (newPassword.length < 6) return { success: false, error: 'Password must be at least 6 characters' }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

export async function updateWheelEnabled(enabled: boolean): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({
      wheel_enabled: enabled,
      // Turning the wheel off discards any half-finished spin — resuming one
      // from months ago would be more confusing than starting the turn fresh.
      // `wheel_turn` is deliberately untouched, so re-enabling puts them back
      // on the same turn they left on.
      ...(enabled ? {} : { wheel_session: null }),
    } as never)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  // Layout-wide: the nav reads wheel_enabled, so it has to re-render too.
  revalidatePath('/', 'layout')
  return { success: true, data: undefined }
}

export async function updateAppearance(formData: FormData): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const theme_preference = formData.get('theme_preference') as 'light' | 'dark' | 'system'
  const accent_colour = (formData.get('accent_colour') as string) || null

  const { error } = await supabase
    .from('profiles')
    .update({ theme_preference, accent_colour } as never)
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  revalidatePath('/', 'layout')
  return { success: true, data: undefined }
}
