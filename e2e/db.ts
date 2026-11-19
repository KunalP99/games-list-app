// Direct database access for e2e tests: setting up test data and checking what
// the app wrote. LOCAL ONLY — refuses anything that isn't the local stack
// (global-setup.ts separately refuses to run without the TEST DATABASE pill).
import { createHash, randomBytes } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { localEnv } from './helpers'

export const BASE = 'http://localhost:3000'
export const PASSWORD = 'test-password-123'
export const ALEX = 'test-alex@example.com'
export const SAM = 'test-sam@example.com'

let adminClient: SupabaseClient | null = null

/** Service-role client for the local stack. Throws on any other database. */
export function admin(): SupabaseClient {
  if (adminClient) return adminClient
  const env = localEnv()
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error(`Refusing to touch a non-local database: ${env.NEXT_PUBLIC_SUPABASE_URL}`)
  }
  adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  return adminClient
}

/** A signed-in client as one of the seeded users, using the browser's (anon) key: what a user could do directly. */
export async function asUser(email: string): Promise<{ client: SupabaseClient; id: string }> {
  const env = localEnv()
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`${email}: ${error.message}`)
  return { client, id: data.user.id }
}

/** A client with the browser's key and no session: a logged-out visitor. */
export function anonymous(): SupabaseClient {
  const env = localEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
}

export async function userId(email: string): Promise<string> {
  const { data } = await admin().auth.admin.listUsers({ perPage: 200 })
  const user = data.users.find(u => u.email === email)
  if (!user) throw new Error(`${email} not found — run npm run seed:dev`)
  return user.id
}

/**
 * Records a user's balance, XP and achievements, and returns a function that
 * puts them back, removing any achievement unlocked in between. Tests that
 * complete games or spend tickets call it in beforeAll/afterAll.
 */
export async function snapshotUser(id: string): Promise<() => Promise<void>> {
  const db = admin()
  const { data: profile } = await db.from('profiles').select('ticket_balance, xp, tickets_earned_total').eq('id', id).single()
  const { data: unlocked } = await db.from('user_achievements').select('achievement_id').eq('user_id', id)
  const before = new Set((unlocked ?? []).map((a: { achievement_id: string }) => a.achievement_id))
  return async () => {
    const { data: now } = await db.from('user_achievements').select('achievement_id').eq('user_id', id)
    const added = (now ?? []).map((a: { achievement_id: string }) => a.achievement_id).filter(a => !before.has(a))
    if (added.length) await db.from('user_achievements').delete().eq('user_id', id).in('achievement_id', added)
    await db.from('profiles').update(profile as never).eq('id', id)
  }
}

/** Temporary games for one test file; removes them (and anything hanging off them) afterwards. */
export function tempGames(ownerId: string) {
  const ids: string[] = []
  return {
    async add(fields: Record<string, unknown>): Promise<string> {
      const { data, error } = await admin().from('games').insert({ user_id: ownerId, platform: 'PC', ...fields }).select('id').single()
      if (error) throw new Error(`insert game failed: ${error.message}`)
      ids.push(data.id)
      return data.id
    },
    async cleanup() {
      const db = admin()
      for (const id of ids) {
        await db.from('ticket_transactions').delete().eq('game_id', id)
        await db.from('completion_rewards').delete().eq('game_id', id)
        await db.from('play_sessions').delete().eq('game_id', id)
        await db.from('games').delete().eq('id', id)
      }
      ids.length = 0
    },
  }
}

/** A device token for the desktop app's API, removed by `cleanup`. */
export async function tempDevice(ownerId: string) {
  const token = 'glk_' + randomBytes(24).toString('base64url')
  const { data, error } = await admin().from('device_tokens')
    .insert({ user_id: ownerId, token_hash: createHash('sha256').update(token).digest('hex'), label: 'e2e' })
    .select('id').single()
  if (error) throw new Error(`insert device failed: ${error.message}`)
  return {
    token,
    post: (path: string, body: unknown) => fetch(BASE + path, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    cleanup: async () => { await admin().from('device_tokens').delete().eq('id', data.id) },
  }
}

export const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
