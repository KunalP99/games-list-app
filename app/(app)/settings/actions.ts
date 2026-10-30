'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'
import { generateDeviceToken, hashToken } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'

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

// ── Devices (desktop play-tracking agent) ───────────────────────────────────

/**
 * Issue a device token for the desktop agent.
 *
 * The plaintext token is returned exactly once — only its hash is stored, so
 * it can never be shown again. Losing it means revoking and reissuing, which
 * is the point: a readable token in the database would be a second password.
 */
export async function createDeviceToken(label: string): Promise<ActionResult<{ token: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const trimmed = label.trim()
  if (trimmed.length === 0) return { success: false, error: 'Give the device a name' }
  if (trimmed.length > 60) return { success: false, error: 'That name is too long' }

  const token = generateDeviceToken()
  const { error } = await (supabase.from('device_tokens') as any).insert({
    user_id: user.id,
    token_hash: hashToken(token),
    label: trimmed,
  })
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  return { success: true, data: { token } }
}

export async function revokeDevice(deviceId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('id', deviceId)
    .eq('user_id', user.id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  return { success: true, data: undefined }
}

/** Link an executable to one of the user's games (the agent's "No" path). */
export async function linkExecutable(exeName: string, gameId: string): Promise<ActionResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const normalised = normaliseExeName(exeName)
  if (!normalised) return { success: false, error: 'No executable given' }

  const { data: game } = await supabase
    .from('games')
    .select('id')
    .eq('id', gameId)
    .eq('user_id', user.id)
    .maybeSingle() as { data: { id: string } | null }
  if (!game) return { success: false, error: 'Game not found' }

  const { error } = await (supabase.from('game_executables') as any).upsert({
    user_id: user.id,
    game_id: game.id,
    exe_name: normalised,
  }, { onConflict: 'user_id,exe_name' })
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  return { success: true, data: undefined }
}
