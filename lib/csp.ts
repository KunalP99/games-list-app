// The site's Content-Security-Policy: which scripts, frames and connections a
// page may use, so that code injected into a page can't run. Built per request
// by proxy.ts, which gives every page a fresh nonce: Next.js puts it on its own
// <script> tags (it reads it from the request's CSP header), the root layout
// puts it on the theme script, and scripts those load are trusted in turn
// ('strict-dynamic': Turnstile's loader is injected that way).
//
// What the site loads from elsewhere: YouTube players (game videos), Cloudflare
// Turnstile (the public edition's sign-up), Supabase (the browser's own client,
// e.g. password reset and OAuth sign-in) and images from many hosts (IGDB,
// RAWG, YouTube thumbnails and whatever URL a game's art came from), hence any
// https image. Fonts are self-hosted by next/font. Inline style attributes are
// used throughout (React's style={...}), so styles stay 'unsafe-inline': they
// can't run code.

export function makeNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
}

export function contentSecurityPolicy(opts: {
  nonce: string
  supabaseUrl?: string
  dev: boolean
}): string {
  const supabase = originOf(opts.supabaseUrl)
  const connect = ["'self'", 'https://challenges.cloudflare.com']
  if (supabase) connect.push(supabase, supabase.replace(/^http/, 'ws'))

  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    // 'unsafe-eval' only in development: React uses eval there to rebuild
    // call stacks for its error overlay. Production code never needs it.
    ['script-src', ["'self'", `'nonce-${opts.nonce}'`, "'strict-dynamic'", 'https://challenges.cloudflare.com', ...(opts.dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:']],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', connect],
    ['frame-src', ['https://www.youtube.com', 'https://www.youtube-nocookie.com', 'https://challenges.cloudflare.com']],
    ['worker-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ]
  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`)
  // Locally the site and Supabase are plain http; upgrading would break them.
  if (!opts.dev) policy.push('upgrade-insecure-requests')
  return policy.join('; ')
}

function originOf(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).origin } catch { return null }
}
