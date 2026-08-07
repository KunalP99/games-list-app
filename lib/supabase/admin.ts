import { createClient } from '@supabase/supabase-js'

// Service-role Supabase client for server-side jobs (e.g. the playlist-sync cron)
// that must bypass RLS and act across every user's rows. Uses the secret service
// role key — NEVER import this into a Client Component.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin client missing URL or service role key')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
