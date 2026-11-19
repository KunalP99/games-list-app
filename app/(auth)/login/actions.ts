'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { FEATURES } from '@/lib/edition'
import { validatePassword } from '@/lib/username'
import { usernameStatus, type UsernameStatus } from '@/lib/data/usernames'
import { siteOriginFrom } from '@/lib/site-origin'

/** This site's own address, for links Supabase emails out (confirm, reset). See lib/site-origin.ts. */
async function siteOrigin(): Promise<string> {
  const h = await headers()
  return siteOriginFrom(process.env, name => h.get(name))
}

/** The Turnstile token from the form (the widget's own field), in an edition with secure sign-up. */
function captchaToken(formData: FormData): string | undefined {
  if (!FEATURES.secureAuth) return undefined
  return (formData.get('cf-turnstile-response') as string | null) || undefined
}

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
    // Supabase requires a captcha token on every auth call once the project
    // has captcha switched on (the public edition's project).
    options: { captchaToken: captchaToken(formData) },
  })
  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function signUp(formData: FormData) {
  return FEATURES.secureAuth ? signUpSecure(formData) : signUpSimple(formData)
}

/** The friends edition's sign-up: name, email, password. Unchanged. */
async function signUpSimple(formData: FormData) {
  const supabase = await createClient()
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const name = (formData.get('name') as string).trim()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: name } },
  })

  if (error) return { error: error.message }

  // If confirmation is disabled, a session is returned immediately
  if (data.session) redirect('/dashboard')

  // Fallback if confirmation is still enabled
  return { success: 'Check your email to confirm your account.' }
}

/**
 * The public edition's sign-up: a chosen username (re-checked here, whatever
 * the form said), a stronger password, a Turnstile token, and a confirmation
 * email that links back to /auth/callback.
 */
async function signUpSecure(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim() ?? ''
  const password = (formData.get('password') as string | null) ?? ''
  const displayName = ((formData.get('display_name') as string | null) ?? '').trim().slice(0, 50)

  const status = await usernameStatus((formData.get('username') as string | null) ?? '')
  if (status.status === 'invalid') return { error: `Username: ${status.error}` }
  if (status.status === 'taken') return { error: `The username “${status.username}” is taken.` }

  const pw = validatePassword(password)
  if (!pw.ok) return { error: `Password: ${pw.error}` }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: status.username, display_name: displayName || status.username },
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
      captchaToken: captchaToken(formData),
    },
  })
  if (error) return { error: error.message }
  if (data.session) redirect('/dashboard')
  return { success: 'Check your email to confirm your account, then sign in.' }
}

/** The live "is this username free?" check on the sign-up form (public edition). */
export async function checkUsername(raw: string): Promise<UsernameStatus> {
  if (!FEATURES.secureAuth) return { status: 'invalid', error: 'Not available.' }
  return usernameStatus(raw)
}

/**
 * "Forgot password?": emails a reset link, which signs them in through
 * /auth/callback and lands on /reset-password. Always answers the same way,
 * so it can't be used to find out which emails have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  if (!FEATURES.secureAuth) return { error: 'Not available.' }
  const email = ((formData.get('email') as string | null) ?? '').trim()
  if (!email) return { error: 'Enter your email.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
    captchaToken: captchaToken(formData),
  })
  // A captcha failure or rate limit is worth showing; "no such user" never is
  // (Supabase doesn't report it anyway).
  if (error && /captcha|rate|too many/i.test(error.message)) return { error: error.message }
  return { success: 'If that email has an account, we’ve sent a link to reset your password.' }
}

/** Sets a new password from the reset link's session (/reset-password). */
export async function resetPassword(formData: FormData) {
  if (!FEATURES.secureAuth) return { error: 'Not available.' }
  const password = (formData.get('password') as string | null) ?? ''
  const confirm = (formData.get('confirm_password') as string | null) ?? ''
  if (password !== confirm) return { error: 'Passwords do not match.' }
  const pw = validatePassword(password)
  if (!pw.ok) return { error: pw.error }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'This reset link has expired. Ask for a new one.' }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/dashboard')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
