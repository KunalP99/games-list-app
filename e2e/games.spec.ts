import { test, expect, type Page } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, snapshotUser, tempGames } from './db'

// Games: search that copes with commas, brackets and wildcards; the hours
// rules on the edit form; editing; the game page. Both editions. (Code review
// batch 1: BUG-001, SEC-001 caps, BUG-007.)

const TITLE = 'ZZ E2E: Warhammer 40,000 (Part_2)'
test.describe.configure({ mode: 'serial' })

let page: Page
let uid: string
let gameId: string
let restore: () => Promise<void>
const games = { cleanup: async () => {} } as ReturnType<typeof tempGames>

test.beforeAll(async ({ browser }) => {
  uid = await userId(TEST_USER_2.email)
  restore = await snapshotUser(uid)
  Object.assign(games, tempGames(uid))
  // Backlog during the searches: Playing games also appear in the friends
  // edition's Now Playing strip whatever the search.
  gameId = await games.add({ title: TITLE, status: 'backlog', hours_played: 5 })
  page = await (await browser.newContext()).newPage()
  await login(page, TEST_USER_2)
})

test.afterAll(async () => {
  await games.cleanup()
  await restore()
  await page?.context().close()
})

const card = () => page.getByRole('heading', { name: TITLE }).first()

test('search finds a title with a comma, brackets and an underscore', async () => {
  for (const q of ['40,000', '(Part_2)', 'Warhammer 40,000 (Part']) {
    await page.goto(`/games?status=all&q=${encodeURIComponent(q)}`)
    await expect(card(), `search "${q}"`).toBeVisible()
  }
})

test('search treats % and _ as plain characters, and really filters', async () => {
  await page.goto(`/games?status=all&q=${encodeURIComponent('Part%2')}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(card()).toHaveCount(0)
  await page.goto(`/games?status=all&q=${encodeURIComponent('Elden Ring')}`)
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(card()).toHaveCount(0)
})

test('search on a profile copes with a comma too', async () => {
  await page.goto(`/users/test-sam?status=all&q=${encodeURIComponent('40,000')}`)
  await expect(card()).toBeVisible()
})

test('hours: big real figures save, impossible ones are refused with a message', async () => {
  const hours = () => admin().from('games').select('hours_played').eq('id', gameId).single().then(r => Number(r.data!.hours_played))
  const input = page.locator('input[name="hours_played"]')

  await page.goto(`/games/${gameId}/edit`)
  await page.waitForLoadState('networkidle') // let React take over before typing
  await expect(input).toHaveAttribute('max', '99999.9')
  await input.fill('15000')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page).toHaveURL(new RegExp(`/games/${gameId}$`))
  expect(await hours()).toBe(15000)

  // Over the column's limit, sent as a crafted request would (the input's own max removed).
  await page.goto(`/games/${gameId}/edit`)
  await page.waitForLoadState('networkidle')
  await input.evaluate(el => el.removeAttribute('max'))
  await input.fill('100000')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText("Hours played can't be more than 99,999.9.")).toBeVisible()
  expect(await hours()).toBe(15000)
})

test('the game page shows the game', async () => {
  await page.goto(`/games/${gameId}`)
  await expect(card()).toBeVisible()
})

test(`completing from the game page (${EDITION} rules)`, async () => {
  await admin().from('games').update({ status: 'playing', hours_played: 12.5 }).eq('id', gameId)
  await page.goto(`/games/${gameId}`)
  await page.getByRole('button', { name: /Mark as Completed/ }).first().click()
  await page.getByRole('button', { name: 'Mark as Completed', exact: true }).last().click()
  await expect.poll(async () => (await admin().from('games').select('status').eq('id', gameId).single()).data!.status).toBe('completed')
  const { data: game } = await admin().from('games').select('hours_played').eq('id', gameId).single()
  expect(Number(game!.hours_played), 'a blank hours box keeps the hours').toBe(12.5)
  // The reward is recorded just after the status changes (same request), so wait for it.
  // Friends: typed hours, 12.5h → +1. Public: this game isn't linked to IGDB → nothing.
  await expect.poll(async () => (await admin().from('completion_rewards').select('tickets, why').eq('game_id', gameId).maybeSingle()).data)
    .toEqual(EDITION === 'public' ? { tickets: 0, why: 'not_linked' } : { tickets: 1, why: 'full' })
})
