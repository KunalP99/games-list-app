import { test, expect, type Page } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, snapshotUser, tempGames } from './db'

// Deleting a game says exactly what it does to your tickets, from both the
// game page's Delete button and the games list's ⋯ / right-click menu, and the
// balance really moves by that much (below zero too, on purpose). Both
// editions: the ledger rows are written directly, so the edition's reward
// rules don't matter here.

test.describe.configure({ mode: 'serial' })

const TITLE = 'ZZ E2E delete warning'
let page: Page
let uid: string
let restore: () => Promise<void>
const games = { cleanup: async () => {} } as ReturnType<typeof tempGames>

const balance = async () =>
  (await admin().from('profiles').select('ticket_balance').eq('id', uid).single()).data!.ticket_balance as number
const setBalance = (n: number) => admin().from('profiles').update({ ticket_balance: n }).eq('id', uid)
const exists = async (id: string) =>
  ((await admin().from('games').select('id').eq('id', id)).data ?? []).length > 0

/** A completed game that earned `earned` tickets (one ledger row). */
async function completedGame(title: string, earned: number) {
  const id = await games.add({ title, status: 'completed', completion_date: '2026-01-01', hours_played: 60 })
  const { error } = await admin().rpc('award_tickets', {
    p_user_id: uid, p_amount: earned, p_reason: 'game_completed_long', p_game_id: id,
  })
  if (error) throw new Error(error.message)
  return id
}

const dialog = () => page.getByRole('alertdialog')

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

test('game page: names the tickets lost, Cancel keeps the game, Delete takes them', async () => {
  const id = await completedGame(`${TITLE} page`, 3)
  await setBalance(10)

  await page.goto(`/games/${id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await expect(dialog()).toContainText('You lose the 3 tickets you earned for completing it. Your balance goes from 10 to 7.')

  await dialog().getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog()).toHaveCount(0)
  expect(await exists(id)).toBe(true)
  expect(await balance()).toBe(10)

  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await expect(dialog()).toContainText('from 10 to 7')
  await dialog().getByRole('button', { name: 'Delete' }).click()
  await expect(page).toHaveURL(/\/games(\?|$)/)
  await expect.poll(() => exists(id)).toBe(false)
  expect(await balance()).toBe(7)
})

test('games list menu: the same warning, and a balance can go below zero', async () => {
  const title = `${TITLE} menu`
  const id = await completedGame(title, 3)
  await setBalance(0)

  await page.goto(`/games?status=completed&q=${encodeURIComponent(title)}`)
  await page.getByRole('heading', { name: title }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await expect(dialog()).toContainText('You lose the 3 tickets you earned for completing it. Your balance goes from 0 to −3.')
  await dialog().getByRole('button', { name: 'Delete' }).click()

  await expect.poll(() => exists(id)).toBe(false)
  expect(await balance()).toBe(-3)
})

test('a completed game that earned nothing says the balance stays the same', async () => {
  const id = await games.add({ title: `${TITLE} nothing`, status: 'completed', completion_date: '2026-01-01' })
  await setBalance(4)
  await page.goto(`/games/${id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await expect(dialog()).toContainText("It didn't earn any tickets, so your balance stays the same.")
  await dialog().getByRole('button', { name: 'Cancel' }).click()
})

test('a DNF game says its penalty comes back (friends edition)', async () => {
  test.skip(EDITION !== 'friends', 'no DNF penalty in the public edition')
  const id = await games.add({ title: `${TITLE} dnf`, status: 'dnf' })
  await admin().rpc('award_tickets', { p_user_id: uid, p_amount: -5, p_reason: 'assigned_game_incomplete', p_game_id: id })
  await setBalance(-2)
  await page.goto(`/games/${id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  await expect(dialog()).toContainText('The 5 tickets you lost for dropping it are given back. Your balance goes from −2 to 3.')
  await dialog().getByRole('button', { name: 'Cancel' }).click()
})
