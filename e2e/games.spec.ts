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

// The search box itself (lib/use-url-search.ts). Its delayed update used to
// undo a tab clicked straight after typing or straight after the page opened.
const backlogTab = () => page.getByRole('link', { name: 'Backlog' }).or(page.getByRole('button', { name: 'Backlog' })).first()

test('typing in the search box filters the list', async () => {
  await page.goto('/games?status=all')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder(/search/i).first().fill('40,000')
  await expect(page).toHaveURL(/[?&]q=40%2C000/)
  await expect(card()).toBeVisible()
})

test('a tab clicked straight after typing keeps both the tab and the search', async () => {
  await page.goto('/games?status=all')
  await page.waitForLoadState('networkidle')
  await page.getByPlaceholder(/search/i).first().fill('Warhammer')
  await backlogTab().click()
  await expect(page).toHaveURL(/status=backlog/)
  await expect(page).toHaveURL(/[?&]q=Warhammer/)
  await page.waitForTimeout(1_500) // past the search box's delay: nothing undoes it
  expect(page.url()).toMatch(/status=backlog/)
  await expect(card()).toBeVisible()
})

test('a tab clicked as soon as the page opens sticks', async () => {
  await page.goto('/games?status=all')
  await backlogTab().click()
  await expect(page).toHaveURL(/status=backlog/)
  await page.waitForTimeout(1_500)
  expect(page.url()).toMatch(/status=backlog/)
})

for (const [where, url] of [['My Games', '/games?status=all'], ['a profile', '/users/test-sam?status=all']]) {
  test(`changing tab on ${where} keeps the page where it is`, async () => {
    // A short window, so the page scrolls even with a small library.
    await page.setViewportSize({ width: 1280, height: 420 })
    try {
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      // Scrolled so the tabs sit near the top of the window.
      const tabsAt = await backlogTab().evaluate(el => el.getBoundingClientRect().top + window.scrollY)
      const y = Math.max(0, Math.round(tabsAt - 80))
      await page.evaluate(to => window.scrollTo(0, to), y)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y)
      expect(y).toBeGreaterThan(0)
      await backlogTab().click()
      await expect(page).toHaveURL(/status=backlog/)
      await expect(card()).toBeVisible()
      expect(await page.evaluate(() => window.scrollY)).toBe(y)
    } finally {
      await page.setViewportSize({ width: 1280, height: 720 })
    }
  })
}

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
  // Friends: not a wheel game, so its 12.5 untracked hours pay 1 per 25 → nothing
  // (lib/hours-tickets.ts). Public: this game isn't linked to IGDB → nothing.
  await expect.poll(async () => (await admin().from('completion_rewards').select('tickets, why').eq('game_id', gameId).maybeSingle()).data)
    .toEqual(EDITION === 'public' ? { tickets: 0, why: 'not_linked' } : { tickets: 0, why: 'full' })
})

// Finished once (2021), then finished again: the second finish is certainly a
// replay, so it's tagged, whatever the copy was before (Playing: neither
// edition has Ambient any more).
test('finishing a game a second time tags that copy as a replay', async () => {
  const title = 'ZZ E2E Second Finish'
  await games.add({ title, status: 'completed', completion_date: '2021-01-01', hours_played: 47.8 })
  const status = 'playing'
  const again = await games.add({ title, status, hours_played: 27.2 })
  // From its ⋯ menu (right-click).
  await page.goto(`/games?status=${status}&q=${encodeURIComponent(title)}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('heading', { name: title }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Mark as Completed…' }).click()
  await page.getByRole('button', { name: 'Mark as Completed', exact: true }).last().click()
  await expect.poll(async () => (await admin().from('games').select('status, is_replay').eq('id', again).single()).data)
    .toEqual({ status: 'completed', is_replay: true })
  await page.goto(`/games/${again}`)
  await expect(page.getByText('Playthrough 2 of 2').first()).toBeVisible()
})

// The May import added each game's newer run a few seconds before the older
// one; playthroughs are numbered by when they were played, not added.
test('playthroughs are numbered by when they were played, not when added', async () => {
  const title = 'ZZ E2E Numbered Runs'
  const replay = await games.add({ title, status: 'completed', completion_date: '2025-09-15', is_replay: true })
  const original = await games.add({ title, status: 'completed', completion_date: '2020-06-14' })
  await page.goto(`/games/${original}`)
  await expect(page.getByText('Playthrough 1 of 2').first()).toBeVisible()
  await page.goto(`/games/${replay}`)
  await expect(page.getByText('Playthrough 2 of 2').first()).toBeVisible()
})
