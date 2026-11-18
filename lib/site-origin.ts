// This site's own address, for links Supabase emails out (sign-up
// confirmation, password reset).

type Env = Record<string, string | undefined> // reads VERCEL_ENV and VERCEL_PROJECT_PRODUCTION_URL
type HeaderGet = (name: string) => string | null

/**
 * On a production deployment the address comes from Vercel's own
 * `VERCEL_PROJECT_PRODUCTION_URL` (each Vercel project, friends and public, has
 * its own), never from the request: `Origin` and `x-forwarded-host` are
 * request headers, and a link built from them would point wherever the request
 * said. Supabase's redirect allow-list was the only thing standing in the way.
 *
 * Locally and on preview deployments there is no fixed address to use, so the
 * request's own host is the best available answer there.
 */
export function siteOriginFrom(env: Env, header: HeaderGet): string {
  const production = env.VERCEL_ENV === 'production' ? env.VERCEL_PROJECT_PRODUCTION_URL?.trim() : undefined
  if (production) return production.startsWith('http') ? production.replace(/\/+$/, '') : `https://${production}`

  const origin = header('origin')
  if (origin) return origin
  const host = header('x-forwarded-host') ?? header('host') ?? 'localhost:3000'
  const proto = header('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}
