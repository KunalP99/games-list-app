import { test, expect, type Page, type Browser } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, snapshotUser, tempGames, minutesAgo } from './db'

// Completion rewards: completion XP is taken back when a game stops being
// completed (both editions); two tabs completing at once pay once; and the
// public edition's verified rules (tracked hours, IGDB-linked, 5 untracked a
// day). Code review batches 2 and 3.

test.describe.configure({ mode: 'serial' })

let page: Page
let uid: string
let restore: () => Promise<void>
const games = {} as ReturnType<typeof tempGames>

test.beforeAll(async ({ browser }) => {
  uid = await userId(TEST_USER_2.email)
  restore = await snapshotUser(uid)
  Object.assign(games, tempGames(uid))
  page = await (await browser.newContext()).newPage()
  await login(page, TEST_USER_2)
})

test.afterAll(async () => {
  await games.cleanup()
  await restore()
  await page?.context().close()
})

const reward = async (id: string) => (await admin().from('completion_rewards').select('tickets, xp, why, untracked').eq('game_id', id).maybeSingle()).data
const xp = () => admin().from('profiles').select('xp').eq('id', uid).single().then(r => r.data!.xp as number)

async function complete(p: Page, id: string) {
  await p.goto(`/games/${id}`)
  await p.getByRole('button', { name: /Mark as Completed/ }).first().click()
  await p.getByRole('button', { name: 'Mark as Completed', exact: true }).last().click()
  await expect.poll(() => reward(id), { timeout: 20_000 }).not.toBeNull()
}

test('completion XP is taken back on un-completing, and given once on completing again', async () => {
  const id = await games.add({ title: 'ZZ E2E XP Loop', status: 'playing', hours_played: 30, igdb_id: 1942 })
  await complete(page, id)
  const first = await reward(id)
  // Friends: not a wheel game, so its 30 untracked hours pay 1 per 25 (hours_typed).
  if (EDITION === 'friends') expect(first).toMatchObject({ tickets: 1, xp: 100, why: 'full' })
  else expect(first).toMatchObject({ tickets: 1, xp: 50, why: 'untracked' })
  const afterFirst = await xp()

  await page.goto(`/games/${id}/edit`)
  await page.waitForLoadState('networkidle')
  await page.locator('select[name="status"]').selectOption('playing')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect.poll(() => reward(id)).toBeNull()
  expect(afterFirst - await xp(), 'its XP is taken back').toBe(first!.xp)
  const { data: tickets } = await admin().from('ticket_transactions').select('id').eq('game_id', id)
  expect(tickets, 'and its tickets').toEqual([])

  await complete(page, id)
  expect(await xp(), 'completing again gives the XP once, not twice').toBe(afterFirst)
})

test('two tabs completing the same game at once pay once', async ({ browser }: { browser: Browser }) => {
  const id = await games.add({ title: 'ZZ E2E Double Complete', status: 'playing', hours_played: 30, igdb_id: 1942 })
  const second = await page.context().newPage()
  for (const p of [page, second]) {
    await p.goto(`/games/${id}`)
    await p.getByRole('button', { name: /Mark as Completed/ }).first().click()
    await p.getByRole('button', { name: 'Mark as Completed', exact: true }).last().waitFor()
  }
  await Promise.all([page, second].map(p => p.getByRole('button', { name: 'Mark as Completed', exact: true }).last().click()))
  await expect.poll(() => reward(id), { timeout: 20_000 }).not.toBeNull()
  await page.waitForTimeout(2_500) // let the slower request finish
  const { data: tx } = await admin().from('ticket_transactions').select('amount').eq('game_id', id)
  // Friends: 30 untracked hours on a non-wheel game pay 1 (1 per 25). Public: untracked +1.
  const expected = 1
  expect(tx!.reduce((s, t) => s + t.amount, 0)).toBe(expected)
  await second.close()
  void browser
})

test.describe('public edition: verified rewards', () => {
  test.skip(EDITION !== 'public', 'Verified rewards are the public edition\'s rules.')

  test('tracked hours set the XP and pay no completion tickets (they paid as played); typed hours are ignored', async () => {
    const id = await games.add({ title: 'ZZ E2E Tracked', status: 'playing', hours_played: 5000, igdb_id: 1942 })
    await admin().from('play_sessions').insert({ user_id: uid, game_id: id, client_session_id: 'e2e-t-' + id, minutes: 1800, started_at: minutesAgo(40 * 60), applied_hours: 30 })
    await complete(page, id)
    expect(await reward(id)).toMatchObject({ tickets: 0, xp: 100, why: 'tracked' })
    await expect(page.getByText(/from the hours the desktop app tracked/)).toBeVisible()
  })

  test('a game not picked from search earns nothing', async () => {
    const id = await games.add({ title: 'ZZ E2E Made Up', status: 'playing', hours_played: 50 })
    await complete(page, id)
    expect(await reward(id)).toMatchObject({ tickets: 0, xp: 0, why: 'not_linked' })
  })

  test('untracked completions earn 5 times a day, then nothing', async () => {
    const { data: today } = await admin().from('completion_rewards').select('awarded_at').eq('user_id', uid).eq('untracked', true)
    let used = (today ?? []).length // made by this file, so all today
    while (used < 5) {
      const id = await games.add({ title: `ZZ E2E Cap ${used}`, status: 'playing', igdb_id: 1942 })
      await complete(page, id)
      expect((await reward(id))!.why).toBe('untracked')
      used++
    }
    const id = await games.add({ title: 'ZZ E2E Cap over', status: 'playing', igdb_id: 1942 })
    await complete(page, id)
    expect(await reward(id)).toMatchObject({ tickets: 0, why: 'daily_limit' })
  })
})
