import { test, expect } from '@playwright/test'
import { randomBytes } from 'crypto'
import { TEST_USER, TEST_USER_2 } from './helpers'
import { admin, asUser, anonymous, snapshotUser, tempGames, minutesAgo } from './db'

// What a user can do *directly* with the browser's key — not through the site —
// and the database functions' "only once" rules. These are the checks that
// stop tickets, XP and other people's data being reached by hand.
// Code review batches 2 and 3. No browser needed; runs in either edition.

test.describe.configure({ mode: 'serial' })

let sam: Awaited<ReturnType<typeof asUser>>
let alex: Awaited<ReturnType<typeof asUser>>
let restoreSam: () => Promise<void>
const games = {} as ReturnType<typeof tempGames>
let alexGame: string
let edition: string

test.beforeAll(async () => {
  sam = await asUser(TEST_USER_2.email)
  alex = await asUser(TEST_USER.email)
  restoreSam = await snapshotUser(sam.id)
  Object.assign(games, tempGames(alex.id))
  alexGame = await games.add({ title: 'ZZ E2E Alex Game', status: 'playing', notes_public: false })
  await admin().from('play_sessions').insert({ user_id: alex.id, game_id: alexGame, client_session_id: 'e2e-p-' + alexGame, minutes: 30, started_at: minutesAgo(60), applied_hours: 0.5 })
  await admin().rpc('award_tickets', { p_user_id: alex.id, p_amount: 0, p_reason: 'admin_adjustment', p_game_id: alexGame, p_note: 'e2e' })
  edition = (await admin().from('app_settings').select('value').eq('key', 'edition').single()).data!.value
})

test.afterAll(async () => {
  await admin().from('app_settings').update({ value: edition }).eq('key', 'edition')
  await admin().from('wheel_spins').delete().eq('result_name', 'e2e-probe')
  await admin().from('user_achievements').delete().eq('achievement_id', 'e2e-unlock')
  await games.cleanup()
  await restoreSam()
})

test.describe('things users cannot do by hand', () => {
  test('achievements: read yes; insert or delete no', async () => {
    expect((await sam.client.from('user_achievements').insert({ user_id: sam.id, achievement_id: 'e2e-fake' })).error).toBeTruthy()
    const { data: own } = await admin().from('user_achievements').select('achievement_id').eq('user_id', sam.id).limit(1)
    if (own?.length) {
      const del = await sam.client.from('user_achievements').delete().eq('user_id', sam.id).eq('achievement_id', own[0].achievement_id).select()
      expect(del.data ?? []).toEqual([])
    }
    expect((await sam.client.from('user_achievements').select('achievement_id').limit(1)).error).toBeNull()
  })

  test('ticket ledger: no direct inserts', async () => {
    const ins = await sam.client.from('ticket_transactions').insert({ user_id: sam.id, amount: 1000, reason: 'admin_adjustment' })
    expect(ins.error).toBeTruthy()
  })

  test('wheel history: read your own; no insert, edit or delete', async () => {
    expect((await sam.client.from('wheel_spins').insert({ user_id: sam.id, spin_type: 'choose', finalized_via: 'choose', result_name: 'e2e-probe' })).error).toBeTruthy()
    const { data: row } = await admin().from('wheel_spins').insert({ user_id: sam.id, spin_type: 'choose', finalized_via: 'choose', result_name: 'e2e-probe' }).select('id').single()
    expect((await sam.client.from('wheel_spins').update({ result_name: 'edited' }).eq('id', row!.id).select()).data ?? []).toEqual([])
    expect((await sam.client.from('wheel_spins').delete().eq('id', row!.id).select()).data ?? []).toEqual([])
    expect((await sam.client.from('wheel_spins').select('id').eq('id', row!.id)).data).toHaveLength(1)
  })

  test('completion rewards: no writes', async () => {
    expect((await sam.client.from('completion_rewards').insert({ game_id: alexGame, user_id: sam.id, why: 'full' })).error).toBeTruthy()
  })

  test('private notes: only the owner reads them, and only on their own games', async () => {
    const own = await alex.client.from('game_private_notes').upsert({ game_id: alexGame, user_id: alex.id, notes: 'secret e2e' }, { onConflict: 'game_id' }).select()
    expect(own.error).toBeNull()
    expect((await sam.client.from('game_private_notes').select('notes').eq('game_id', alexGame)).data).toEqual([])
    // A note on someone else's game would block its owner from ever saving one.
    const squatGame = await games.add({ title: 'ZZ E2E Alex Game 2', status: 'backlog' })
    expect((await sam.client.from('game_private_notes').insert({ game_id: squatGame, user_id: sam.id, notes: 'x' })).error).toBeTruthy()
  })

  test('server-only functions refuse the browser roles', async () => {
    const calls: [string, Record<string, unknown>][] = [
      ['award_tickets', { p_user_id: sam.id, p_amount: 1000, p_reason: 'admin_adjustment' }],
      ['award_xp', { p_user_id: sam.id, p_amount: 1000 }],
      ['unlock_achievement', { p_user_id: sam.id, p_achievement_id: 'x', p_xp: 999 }],
      ['spend_tickets', { p_user_id: sam.id, p_amount: 1, p_reason: 'spin' }],
      ['add_game_hours', { p_user_id: sam.id, p_game_id: alexGame, p_delta: 100 }],
      ['record_completion_reward', { p_user_id: sam.id, p_game_id: alexGame, p_tickets: 99, p_xp: 9999, p_untracked: false, p_why: 'full' }],
      ['take_rate_limit', { p_user_id: sam.id, p_bucket: 'x', p_limit: 1, p_window_seconds: 60 }],
    ]
    for (const [fn, args] of calls) {
      expect((await sam.client.rpc(fn, args)).error, fn).toBeTruthy()
    }
  })

  test('a reserved username can\'t be claimed by signing up directly', async () => {
    const email = `e2e-${randomBytes(4).toString('hex')}@example.com`
    const { data } = await anonymous().auth.signUp({ email, password: 'e2e-pass-123', options: { data: { username: 'admin' } } })
    try {
      const { data: profile } = await admin().from('profiles').select('username, username_chosen').eq('id', data.user!.id).single()
      expect(profile!.username).not.toBe('admin')
      expect(profile!.username_chosen).toBe(false)
    } finally {
      if (data.user) await admin().auth.admin.deleteUser(data.user.id)
    }
  })
})

test.describe('database functions do things exactly once', () => {
  test('unlocking an achievement twice at once unlocks it (and its XP) once', async () => {
    const xp = async () => (await admin().from('profiles').select('xp').eq('id', sam.id).single()).data!.xp as number
    const before = await xp()
    const results = await Promise.all([1, 2, 3].map(() => admin().rpc('unlock_achievement', { p_user_id: sam.id, p_achievement_id: 'e2e-unlock', p_xp: 50 })))
    expect(results.filter(r => r.data === true)).toHaveLength(1)
    expect(await xp() - before).toBe(50)
  })

  test('two spends at once never overspend', async () => {
    await admin().from('profiles').update({ ticket_balance: 3 }).eq('id', sam.id)
    const since = new Date().toISOString()
    const results = await Promise.all([1, 2].map(() => admin().rpc('spend_tickets', { p_user_id: sam.id, p_amount: 3, p_reason: 'spin' })))
    expect(results.filter(r => r.data === true)).toHaveLength(1)
    expect((await admin().from('profiles').select('ticket_balance').eq('id', sam.id).single()).data!.ticket_balance).toBe(0)
    await admin().from('ticket_transactions').delete().eq('user_id', sam.id).eq('reason', 'spin').gte('created_at', since)
  })

  test('two completion reversals at once take the tickets back once, and only completion tickets', async () => {
    const samGames = tempGames(sam.id)
    try {
      const id = await samGames.add({ title: 'ZZ E2E Reversal', status: 'completed' })
      await admin().from('profiles').update({ ticket_balance: 10 }).eq('id', sam.id)
      await admin().rpc('award_tickets', { p_user_id: sam.id, p_amount: 3, p_reason: 'game_completed_long', p_game_id: id })
      await admin().rpc('award_tickets', { p_user_id: sam.id, p_amount: -1, p_reason: 'admin_adjustment', p_game_id: id })
      await Promise.all([1, 2].map(() => admin().rpc('reverse_game_completion_tickets', { p_user_id: sam.id, p_game_id: id })))
      expect((await admin().from('profiles').select('ticket_balance').eq('id', sam.id).single()).data!.ticket_balance).toBe(9)
      expect((await admin().from('ticket_transactions').select('reason').eq('game_id', id)).data).toEqual([{ reason: 'admin_adjustment' }])
    } finally {
      await samGames.cleanup()
    }
  })
})

test.describe('who can read what, per edition (database setting)', () => {
  const othersRows = async () => ({
    tickets: ((await sam.client.from('ticket_transactions').select('id').eq('user_id', alex.id).limit(1)).data ?? []).length,
    sessions: ((await sam.client.from('play_sessions').select('id').eq('user_id', alex.id).limit(1)).data ?? []).length,
  })

  test('friends: everyone signed in reads everyone\'s tickets and play sessions', async () => {
    await admin().from('app_settings').update({ value: 'friends' }).eq('key', 'edition')
    expect(await othersRows()).toEqual({ tickets: 1, sessions: 1 })
    expect(((await anonymous().from('games').select('id').eq('id', alexGame)).data ?? []).length, 'logged-out visitors: no games').toBe(0)
  })

  test('public: only your own; games and profiles readable logged out, without private notes', async () => {
    await admin().from('app_settings').update({ value: 'public' }).eq('key', 'edition')
    expect(await othersRows()).toEqual({ tickets: 0, sessions: 0 })
    expect((await anonymous().from('games').select('id, notes').eq('id', alexGame)).data).toEqual([{ id: alexGame, notes: null }])
    expect(((await anonymous().from('profiles').select('username').limit(1)).data ?? []).length).toBe(1)
  })
})
