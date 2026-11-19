import { test, expect, type Page, type Browser } from '@playwright/test'
import { login, TEST_USER, TEST_USER_2, EDITION } from './helpers'
import {
  admin, asUser, anonymous, userId, tempGames, snapshotUser, befriend, clearFriends, setPrivacy,
  DEFAULT_PRIVACY, ALEX, SAM, type Privacy,
} from './db'

// The public edition's friends system (db/friends.sql, lib/friends.ts):
// requests, friendships, blocks, and per-person privacy that the database
// itself enforces. Public edition only: the friends edition has none of it
// (its unchanged read rules are checked in permissions.spec.ts).

test.describe.configure({ mode: 'serial' })
test.skip(EDITION !== 'public', 'the friends system is public edition only')

let alexId: string
let samId: string
let restoreAlex: () => Promise<void>

test.beforeAll(async () => {
  alexId = await userId(ALEX)
  samId = await userId(SAM)
  restoreAlex = await snapshotUser(alexId)
  await clearFriends(alexId, samId)
})

test.afterAll(async () => {
  await clearFriends(alexId, samId)
  await setPrivacy(alexId, DEFAULT_PRIVACY)
  await setPrivacy(samId, DEFAULT_PRIVACY)
  await restoreAlex()
})

test.beforeEach(async () => {
  await clearFriends(alexId, samId)
  await setPrivacy(alexId, DEFAULT_PRIVACY)
  await setPrivacy(samId, DEFAULT_PRIVACY)
})

// ── What the database lets people read ──────────────────────────────────────

test.describe('privacy is enforced by the database', () => {
  const games = { cleanup: async () => {} } as ReturnType<typeof tempGames>
  let gameId: string
  const ACH = 'zz_e2e_privacy'

  test.beforeAll(async () => {
    Object.assign(games, tempGames(alexId))
    gameId = await games.add({ title: 'ZZ E2E privacy', status: 'playing' })
    const db = admin()
    await db.from('play_sessions').insert({ user_id: alexId, game_id: gameId, client_session_id: 'zz-e2e-privacy', minutes: 30, started_at: new Date().toISOString() })
    await db.rpc('award_tickets', { p_user_id: alexId, p_amount: 1, p_reason: 'admin_adjustment', p_game_id: gameId })
    await db.from('user_achievements').insert({ user_id: alexId, achievement_id: ACH })
  })

  test.afterAll(async () => {
    await admin().from('user_achievements').delete().eq('user_id', alexId).eq('achievement_id', ACH)
    await games.cleanup()
  })

  /** What a viewer (Sam, or logged out) can read of Alex's test rows, per item. */
  async function visible(viewer: 'sam' | 'anon') {
    const client = viewer === 'sam' ? (await asUser(SAM)).client : anonymous()
    const has = async (q: PromiseLike<{ data: unknown[] | null }>) => ((await q).data ?? []).length > 0
    return {
      games: await has(client.from('games').select('id').eq('id', gameId)),
      activity: await has(client.from('play_sessions').select('id').eq('game_id', gameId)),
      tickets: await has(client.from('ticket_transactions').select('id').eq('game_id', gameId)),
      achievements: await has(client.from('user_achievements').select('achievement_id').eq('user_id', alexId).eq('achievement_id', ACH)),
    }
  }
  const all = (setting: 'everyone' | 'friends' | 'only_me'): Privacy => ({
    privacy_games: setting, privacy_activity: setting, privacy_tickets: setting, privacy_achievements: setting,
  })
  const every = (v: boolean) => ({ games: v, activity: v, tickets: v, achievements: v })

  test('Everyone: strangers and logged-out visitors see it', async () => {
    await setPrivacy(alexId, all('everyone'))
    expect(await visible('sam')).toEqual(every(true))
    expect(await visible('anon')).toEqual(every(true))
  })

  test('Friends: only friends see it (a pending request is not enough)', async () => {
    await setPrivacy(alexId, all('friends'))
    expect(await visible('sam')).toEqual(every(false))
    expect(await visible('anon')).toEqual(every(false))
    await admin().from('friend_requests').insert({ from_user: samId, to_user: alexId })
    expect(await visible('sam')).toEqual(every(false))
    await befriend(alexId, samId)
    expect(await visible('sam')).toEqual(every(true))
  })

  test('Only me: not even friends', async () => {
    await setPrivacy(alexId, all('only_me'))
    await befriend(alexId, samId)
    expect(await visible('sam')).toEqual(every(false))
    // The owner always sees their own.
    const alex = (await asUser(ALEX)).client
    expect(((await alex.from('games').select('id').eq('id', gameId)).data ?? []).length).toBe(1)
  })

  test('a block hides everything, whichever way it goes', async () => {
    await setPrivacy(alexId, all('everyone'))
    await admin().from('blocks').insert({ blocker: alexId, blocked: samId })
    expect(await visible('sam')).toEqual(every(false))
    await clearFriends(alexId, samId)
    await admin().from('blocks').insert({ blocker: samId, blocked: alexId })
    expect(await visible('sam')).toEqual(every(false))
    expect(await visible('anon'), 'a block only hides from the people involved').toEqual(every(true))
  })

  test('the defaults: games and achievements public; play activity and tickets friends only', async () => {
    expect(await visible('sam')).toEqual({ games: true, activity: false, tickets: false, achievements: true })
  })

  test('you can read only your own friendships, requests and blocks', async () => {
    await befriend(alexId, samId)
    await admin().from('blocks').insert({ blocker: alexId, blocked: samId }) // (block alongside, for the read check only)
    const sam = (await asUser(SAM)).client
    expect(((await sam.from('friendships').select('user_a')).data ?? []).length).toBe(1)
    expect(((await sam.from('blocks').select('blocker')).data ?? []).length, 'blocks are the blocker\'s alone').toBe(0)
    expect(((await anonymous().from('friendships').select('user_a')).data ?? []).length).toBe(0)
  })

  test('nobody can write friendships, requests or blocks directly, or call the friend functions', async () => {
    const sam = (await asUser(SAM)).client
    expect((await sam.from('friendships').insert({ user_a: alexId < samId ? alexId : samId, user_b: alexId < samId ? samId : alexId })).error).toBeTruthy()
    expect((await sam.from('friend_requests').insert({ from_user: samId, to_user: alexId })).error).toBeTruthy()
    expect((await sam.from('blocks').insert({ blocker: samId, blocked: alexId })).error).toBeTruthy()
    for (const [fn, args] of [
      ['send_friend_request', { p_user: samId, p_to: alexId }],
      ['respond_friend_request', { p_user: alexId, p_from: samId, p_accept: true }],
      ['block_user', { p_user: samId, p_other: alexId }],
    ] as const) {
      expect((await sam.rpc(fn, args)).error, fn).toBeTruthy()
    }
  })

  test('people can change their own privacy settings, and nobody else\'s', async () => {
    const sam = (await asUser(SAM)).client
    expect((await sam.from('profiles').update({ privacy_games: 'only_me' }).eq('id', samId)).error).toBeNull()
    expect((await admin().from('profiles').select('privacy_games').eq('id', samId).single()).data!.privacy_games).toBe('only_me')
    await sam.from('profiles').update({ privacy_games: 'only_me' }).eq('id', alexId)
    expect((await admin().from('profiles').select('privacy_games').eq('id', alexId).single()).data!.privacy_games).toBe('everyone')
    expect((await sam.from('profiles').update({ privacy_games: 'nobody' }).eq('id', samId)).error, 'only the three choices').toBeTruthy()
  })
})

test.describe('the friend functions', () => {
  const send = (from: string, to: string) => admin().rpc('send_friend_request', { p_user: from, p_to: to })
  const friends = async () => ((await admin().from('friendships').select('user_a').or(`user_a.eq.${alexId},user_b.eq.${alexId}`)).data ?? []).length

  test('a request both ways becomes a friendship', async () => {
    expect((await send(samId, alexId)).data).toBe('sent')
    expect((await send(samId, alexId)).data).toBe('already_sent')
    expect((await send(alexId, samId)).data).toBe('friends')
    expect(await friends()).toBe(1)
    expect(((await admin().from('friend_requests').select('id').or(`from_user.eq.${alexId},to_user.eq.${alexId}`)).data ?? []).length).toBe(0)
    expect((await send(alexId, samId)).data).toBe('already_friends')
  })

  test('two accepts at once make one friendship', async () => {
    await send(samId, alexId)
    const accept = () => admin().rpc('respond_friend_request', { p_user: alexId, p_from: samId, p_accept: true })
    const results = await Promise.all([accept(), accept()])
    expect(results.map(r => r.data).sort()).toEqual([false, true])
    expect(await friends()).toBe(1)
  })

  test('a block ends the friendship and stops requests, both ways', async () => {
    await befriend(alexId, samId)
    await admin().rpc('block_user', { p_user: alexId, p_other: samId })
    expect(await friends()).toBe(0)
    expect((await send(samId, alexId)).data).toBe('blocked')
    expect((await send(alexId, samId)).data).toBe('blocked')
    await admin().rpc('unblock_user', { p_user: alexId, p_other: samId })
    expect((await send(samId, alexId)).data).toBe('sent')
  })
})

// ── The screens ─────────────────────────────────────────────────────────────

async function signIn(browser: Browser, user: { email: string; password: string }): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await login(page, user)
  return page
}

const friendsCard = (page: Page) =>
  page.locator('div.rounded-2xl', { has: page.getByRole('heading', { name: 'Friends', exact: true }) })

test.describe('on the site', () => {
  let alex: Page
  let sam: Page

  test.beforeAll(async ({ browser }) => {
    alex = await signIn(browser, TEST_USER)
    sam = await signIn(browser, TEST_USER_2)
  })
  test.afterAll(async () => {
    await alex?.context().close()
    await sam?.context().close()
  })

  test('no friends: the card says so and offers the +', async () => {
    await alex.goto('/dashboard')
    await expect(friendsCard(alex).getByText('No friends yet')).toBeVisible()
    await expect(friendsCard(alex).getByRole('button', { name: 'Add a friend' })).toBeVisible()
  })

  test('search, request, accept: both see each other', async () => {
    await alex.goto('/dashboard')
    await friendsCard(alex).getByRole('button', { name: 'Add a friend' }).click()
    const dialog = alex.getByRole('dialog', { name: 'Add a friend' })
    await dialog.getByPlaceholder('Search by username or name').fill('test-s')
    const row = dialog.getByRole('listitem').filter({ hasText: '@test-sam' })
    await row.getByRole('button', { name: 'Add friend' }).click()
    await expect(row.getByRole('button', { name: 'Requested' })).toBeVisible()
    await expect.poll(async () => ((await admin().from('friend_requests').select('id').eq('from_user', alexId).eq('to_user', samId)).data ?? []).length).toBe(1)
    await alex.keyboard.press('Escape')

    await sam.goto('/dashboard')
    const request = friendsCard(sam).getByRole('listitem').filter({ hasText: '@test-alex' })
    await request.getByRole('button', { name: 'Accept' }).click()
    await expect(friendsCard(sam).getByText('Alex (test)').first()).toBeVisible()
    await expect.poll(async () => ((await admin().from('friendships').select('user_a').or(`user_a.eq.${alexId},user_b.eq.${alexId}`)).data ?? []).length).toBe(1)

    await alex.goto('/dashboard')
    await expect(friendsCard(alex).getByText('Sam (test)')).toBeVisible()
    await expect(friendsCard(alex).getByText('No friends yet')).toHaveCount(0)
  })

  test('decline and take back', async () => {
    await admin().from('friend_requests').insert({ from_user: alexId, to_user: samId })
    await sam.goto('/dashboard')
    await friendsCard(sam).getByRole('listitem').filter({ hasText: '@test-alex' }).getByRole('button', { name: 'Decline' }).click()
    await expect.poll(async () => ((await admin().from('friend_requests').select('id').eq('to_user', samId)).data ?? []).length).toBe(0)

    await alex.goto('/dashboard')
    await friendsCard(alex).getByRole('button', { name: 'Add a friend' }).click()
    const dialog = alex.getByRole('dialog', { name: 'Add a friend' })
    await dialog.getByPlaceholder('Search by username or name').fill('Sam (te')
    const row = dialog.getByRole('listitem').filter({ hasText: '@test-sam' })
    await row.getByRole('button', { name: 'Add friend' }).click()
    await row.getByRole('button', { name: 'Requested' }).click()
    await expect(row.getByRole('button', { name: 'Add friend' })).toBeVisible()
    await expect.poll(async () => ((await admin().from('friend_requests').select('id').eq('from_user', alexId)).data ?? []).length).toBe(0)
  })

  test('remove a friend and block from the profile; unblock in Settings', async () => {
    await befriend(alexId, samId)
    await alex.goto('/users/test-sam')
    await alex.getByRole('button', { name: /More options for Sam/ }).click()
    await alex.getByRole('menuitem', { name: 'Remove friend' }).click()
    await alex.getByRole('alertdialog').getByRole('button', { name: 'Remove friend' }).click()
    await expect(alex.getByRole('button', { name: 'Add friend' })).toBeVisible()

    await alex.getByRole('button', { name: /More options for Sam/ }).click()
    await alex.getByRole('menuitem', { name: 'Block' }).click()
    await alex.getByRole('alertdialog').getByRole('button', { name: 'Block' }).click()
    await expect(alex.getByRole('button', { name: 'Unblock' })).toBeVisible()
    expect(((await admin().from('blocks').select('blocker').eq('blocker', alexId).eq('blocked', samId)).data ?? []).length).toBe(1)

    // Blocked: Sam's search can't find Alex.
    await sam.goto('/dashboard')
    await friendsCard(sam).getByRole('button', { name: 'Add a friend' }).click()
    const dialog = sam.getByRole('dialog', { name: 'Add a friend' })
    await dialog.getByPlaceholder('Search by username or name').fill('test-a')
    await expect(dialog.getByText('Nobody found by that name.')).toBeVisible()
    await sam.keyboard.press('Escape')

    await alex.goto('/settings')
    const blockedRow = alex.getByRole('listitem').filter({ hasText: '@test-sam' })
    await blockedRow.getByRole('button', { name: 'Unblock' }).click()
    await expect.poll(async () => ((await admin().from('blocks').select('blocker').eq('blocker', alexId)).data ?? []).length).toBe(0)
  })

  test('a stranger sees a public profile without the friends-only parts', async () => {
    // Defaults: games public, tickets and play activity friends only.
    await sam.goto('/users/test-alex')
    await expect(sam.getByRole('heading', { name: 'Alex (test)' })).toBeVisible()
    await expect(sam.getByText(/^tickets$/), 'the banner ticket figure is friends only').toHaveCount(0)
    await expect(sam.getByRole('button', { name: 'Add friend' })).toBeVisible()
    await befriend(alexId, samId)
    await sam.goto('/users/test-alex')
    await expect(sam.getByText(/^tickets$/)).toHaveCount(1)
  })

  test('Settings → Privacy: a private profile shows only the private card', async () => {
    await alex.goto('/settings')
    // Not networkidle: the Security section's Turnstile widget keeps the
    // network busy. Click until React has taken over and the choice sticks.
    const profileRow = alex.getByRole('radiogroup', { name: 'Profile' })
    const onlyMe = profileRow.getByRole('radio', { name: 'Only me' })
    await expect(async () => {
      await onlyMe.click()
      await expect(onlyMe).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await expect.poll(async () => (await admin().from('profiles').select('privacy_profile').eq('id', alexId).single()).data!.privacy_profile).toBe('only_me')

    await sam.goto('/users/test-alex')
    await expect(sam.getByText('This profile is private')).toBeVisible()
    await expect(sam.getByRole('button', { name: 'Add friend' })).toBeVisible()

    // Alex still sees all of their own.
    await alex.goto('/users/test-alex')
    await expect(alex.getByText('This profile is private')).toHaveCount(0)
  })
})
