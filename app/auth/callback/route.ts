import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Where Supabase sends people back to: email confirmation, password-reset
 * links and Google/Discord sign-in. Swaps the one-time code for a session,
 * then carries on to `next`.
 *
 * `next` must be a path on this site ("/reset-password"), never another
 * address, so a crafted link can't bounce someone off to a lookalike site.
 * An expired or reused link comes back with an error, which the login page
 * explains.
 */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/dashboard'
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  const description = searchParams.get('error_description')
  const query = description
    ? `error=auth_callback_failed&error_description=${encodeURIComponent(description)}`
    : 'error=auth_callback_failed'
  return NextResponse.redirect(`${origin}/login?${query}`)
}
