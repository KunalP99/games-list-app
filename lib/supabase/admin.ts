import { createClient } from '@supabase/supabase-js'

// Service-role Supabase client for server-side jobs (e.g. the playlist-sync cron)
// that must bypass RLS and act across every user's rows. Uses the secret service
// role key — NEVER import this into a Client Component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin client missing URL or service role key')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      // Next patches global fetch and puts GET responses in its Data Cache.
      // PostgREST reads are GETs, so without this a route keeps serving the
      // first answer it ever got: /api/agent/state reported a game at 8.4h
      // while the database said 99.9h, and a freshly linked executable never
      // appeared at all. The @supabase/ssr clients opt out already; this one
      // did not, which also left the cron routes reading stale rows.
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
