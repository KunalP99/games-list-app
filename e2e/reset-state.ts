import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

// Puts the two seeded test accounts into a known state before a test run.
//
// This exists precisely *because* wheel_session persistence works: a turn
// left in progress by one run (or a manual session) is faithfully resumed by
// the next, which is correct product behaviour but breaks test isolation. A
// full `db:reset` would also fix this but is far heavier than these tests need
// and would wipe backlog games the suite depends on.
export async function resetTestWheelState() {
  const envPath = path.join(process.cwd(), '.env.local')
  const env: Record<string, string> = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase credentials in .env.local')

  // Belt and braces alongside global-setup.ts's EnvBanner check: never touch
  // anything that isn't the local stack.
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    throw new Error(`Refusing to reset wheel state against a non-local URL: ${url}`)
  }

  const supabase = createClient(url, serviceKey)

  const { error } = await supabase
    .from('profiles')
    .update({
      wheel_turn: 'spin',
      wheel_session: null,
      pending_wheel_game_id: null,
      pending_wheel_turn: null,
      ticket_balance: 100,
    } as never)
    .in('username', ['test-alex', 'test-sam'])

  if (error) throw new Error(`Failed to reset test wheel state: ${error.message}`)

  // The seeded games are linked to IGDB (scripts/seed-dev.mjs), so accepting a
  // wheel win really moves that backlog game into Playing. Put any game the
  // wheel moved back, or each run would use up a backlog game and the accounts
  // would soon drop below the wheel's 5-game minimum. Only wheel wins carry
  // assigned_by; the seeded games don't.
  const { data: testUsers } = await supabase.from('profiles').select('id').in('username', ['test-alex', 'test-sam'])
  const ids = ((testUsers ?? []) as { id: string }[]).map(u => u.id)
  if (ids.length > 0) {
    const { error: gamesError } = await supabase
      .from('games')
      .update({ status: 'backlog', start_date: null, assigned_by: null, locks_wheel: false } as never)
      .in('user_id', ids)
      .eq('status', 'playing')
      .not('assigned_by', 'is', null)
    if (gamesError) throw new Error(`Failed to reset wheel-won games: ${gamesError.message}`)
  }
}
