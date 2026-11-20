import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { contentSecurityPolicy, makeNonce } from '@/lib/csp'

export async function proxy(request: NextRequest) {
  // Content-Security-Policy with a fresh nonce per request (lib/csp.ts). Next.js
  // reads the policy off the request to put the nonce on its own scripts; the
  // root layout reads x-nonce for the theme script.
  const nonce = makeNonce()
  const csp = contentSecurityPolicy({
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    dev: process.env.NODE_ENV === 'development',
  })
  // Rebuilt from the request's current headers each time, so cookies the
  // session refresh below writes onto the request are passed on too.
  const next = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('content-security-policy', csp)
    const response = NextResponse.next({ request: { headers } })
    response.headers.set('Content-Security-Policy', csp)
    return response
  }

  let supabaseResponse = next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = next()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must not add logic between createServerClient and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirect authenticated users away from auth pages
  if (user && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Redirect unauthenticated users away from protected pages. Every signed-in
  // page is listed (app/(app)/layout.tsx also sends a signed-out visitor to
  // /login; this is the first of the two checks, not the only one).
  // /reset-password and /welcome need the session their link or sign-in just
  // created (public edition's secure sign-up; both 404 in the friends edition).
  const protectedPrefixes = [
    '/dashboard', '/games', '/users', '/tickets', '/wheel', '/changelog',
    '/stats', '/achievements', '/activity', '/settings', '/import', '/admin', '/discover',
    '/reset-password', '/welcome',
  ]
  const isProtected = protectedPrefixes.some((p) => pathname.startsWith(p))
  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
