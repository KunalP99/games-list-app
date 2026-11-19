'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { ActionResult } from '@/lib/types'
import { generateDeviceToken, hashToken, isLoopbackCallback } from '@/lib/agent-auth'
import { normaliseExeName } from '@/lib/agent-session'
import { writeExeLink } from '@/lib/exe-links'
import { FEATURES } from '@/lib/edition'
import { validatePassword } from '@/lib/username'
import { isPrivacyKey, isPrivacySetting } from '@/lib/friends'

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
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
  const supabase = await createClient()
  const newPassword = formData.get('new_password') as string
  const confirmPassword = formData.get('confirm_password') as string

  if (newPassword !== confirmPassword) return { success: false, error: 'Passwords do not match' }
  // The public edition's stronger rule (lib/username.ts) applies here too, so
  // a password change can't get round what sign-up enforces.
  if (FEATURES.secureAuth) {
    const pw = validatePassword(newPassword)
    if (!pw.ok) return { success: false, error: pw.error }
  } else if (newPassword.length < 6) return { success: false, error: 'Password must be at least 6 characters' }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Ask for the current password, so a session left open on someone else's
  // screen (or a stolen session cookie) can't be turned into a taken-over
  // account (code review SEC-009). Accounts made with Google/Discord have no
  // password yet: for them this form sets their first one.
  if (hasPasswordLogin(user) && user.email) {
    const current = (formData.get('current_password') as string | null) ?? ''
    if (!current) return { success: false, error: 'Enter your current password.' }
    const check = await checkCurrentPassword(user.email, current, captchaToken(formData))
    if (check) return { success: false, error: check }
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { success: false, error: error.message }
  return { success: true, data: undefined }
}

/** Whether the account signs in with a password (not only Google/Discord). */
function hasPasswordLogin(user: { identities?: { provider: string }[] | null }): boolean {
  // Accounts from before identities were recorded have none listed; they're
  // email-and-password accounts.
  if (!user.identities || user.identities.length === 0) return true
  return user.identities.some(i => i.provider === 'email')
}

function captchaToken(formData: FormData): string | undefined {
  if (!FEATURES.secureAuth) return undefined
  return (formData.get('cf-turnstile-response') as string | null) || undefined
}

/**
 * Checks a password by signing in with it on a separate, throwaway client: the
 * caller's own session (cookies) is never touched. Returns an error message,
 * or null when it's right. The public project requires a Turnstile token on
 * every sign-in, hence `captcha`.
 */
async function checkCurrentPassword(email: string, password: string, captcha: string | undefined): Promise<string | null> {
  const { createClient: createPlainClient } = await import('@supabase/supabase-js')
  const probe = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await probe.auth.signInWithPassword({ email, password, options: { captchaToken: captcha } })
  if (!error) {
    // Only this throwaway session; 'global' would sign the user out everywhere.
    await probe.auth.signOut({ scope: 'local' }).catch(() => {})
    return null
  }
  if (/captcha/i.test(error.message)) return 'Please complete the check below and try again.'
  if (/rate|too many/i.test(error.message)) return 'Too many attempts. Wait a minute and try again.'
  return 'Your current password is incorrect.'
}

export async function updateWheelEnabled(enabled: boolean): Promise<ActionResult> {
  if (!FEATURES.wheel) return { success: false, error: 'The wheel isn’t available here' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  // Service-role: clearing wheel_session touches a wheel column the browser
  // roles can't write (db/security-hardening.sql). Scoped to the caller's id.
  const { error } = await (createAdminClient()
    .from('profiles') as any)
    .update({
      wheel_enabled: enabled,
      // Turning the wheel off discards any half-finished spin — resuming one
      // from months ago would be more confusing than starting the turn fresh.
      // `wheel_turn` is deliberately untouched, so re-enabling puts them back
      // on the same turn they left on.
      ...(enabled ? {} : { wheel_session: null }),
    })
    .eq('id', user.id)

  if (error) return { success: false, error: error.message }
  // Layout-wide: the nav reads wheel_enabled, so it has to re-render too.
  revalidatePath('/', 'layout')
  return { success: true, data: undefined }
}

export async function updateAppearance(formData: FormData): Promise<ActionResult> {
  const supabase = await createClient()
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
  const supabase = await createClient()
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
  const supabase = await createClient()
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
  const supabase = await createClient()
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

  // No folder known from the website: repoints the exe's link as it always
  // did when there's one, without disturbing per-folder links (lib/exe-links.ts).
  const error = await writeExeLink(supabase as any, { userId: user.id, gameId: game.id, exeName: normalised, pathSuffix: null })
  if (error) return { success: false, error }

  revalidatePath('/settings')
  return { success: true, data: undefined }
}

/**
 * Approve a desktop app's pairing request and hand it a token.
 *
 * The callback is re-validated here, not only on the page that rendered the
 * button: a server action is callable directly, so a check that lives only in
 * the UI is not a check at all.
 */
export async function approveDevicePairing(
  label: string,
  callback: string,
): Promise<ActionResult<{ redirectTo: string }>> {
  if (!isLoopbackCallback(callback)) {
    return { success: false, error: 'That pairing link does not point at this computer.' }
  }

  const issued = await createDeviceToken(label)
  if (!issued.success) return issued

  const target = new URL(callback)
  target.searchParams.set('token', issued.data.token)
  return { success: true, data: { redirectTo: target.toString() } }
}

/** Forget an executable → game link, from the website. */
export async function unlinkExecutable(exeName: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('game_executables')
    .delete()
    .eq('user_id', user.id)
    .eq('exe_name', normaliseExeName(exeName))
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings/devices/link')
  return { success: true, data: undefined }
}

// ── Ignored executables ──────────────────────────────────────────────────────
// The escape hatch for a wrong identification (a launcher misidentified as an
// unrelated game, say): never touches the game row that may already have been
// created, only stops a program from ever being auto-tracked again.

/**
 * Stop a program from ever being tracked. Removes any current link for it
 * too, so something already (wrongly) being tracked actually stops, rather
 * than just going un-asked-about.
 */
export async function ignoreExecutable(exeName: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const normalised = normaliseExeName(exeName)
  if (!normalised) return { success: false, error: 'No executable given' }

  await supabase
    .from('game_executables')
    .delete()
    .eq('user_id', user.id)
    .eq('exe_name', normalised)

  const { error } = await (supabase.from('ignored_executables') as any).upsert({
    user_id: user.id,
    exe_name: normalised,
  }, { onConflict: 'user_id,exe_name' })
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/settings/devices/link')
  return { success: true, data: undefined }
}

/** Undo `ignoreExecutable` — the program can be detected again from here on. */
export async function unignoreExecutable(exeName: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('ignored_executables')
    .delete()
    .eq('user_id', user.id)
    .eq('exe_name', normaliseExeName(exeName))
  if (error) return { success: false, error: error.message }

  revalidatePath('/settings')
  return { success: true, data: undefined }
}

/**
 * One Settings → Privacy choice (public edition). Written with the user's own
 * session: db/friends.sql grants them update on just these columns.
 */
export async function updatePrivacy(key: string, value: string): Promise<ActionResult> {
  if (!FEATURES.friendSystem) return { success: false, error: 'Privacy settings aren’t part of this site.' }
  if (!isPrivacyKey(key) || !isPrivacySetting(value)) return { success: false, error: 'That isn’t a privacy setting.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const { error } = await supabase
    .from('profiles')
    .update({ [key]: value } as never)
    .eq('id', user.id)
  if (error) return { success: false, error: 'Couldn’t save that. Please try again.' }
  revalidatePath('/settings')
  revalidatePath('/users', 'layout')
  return { success: true, data: undefined }
}
