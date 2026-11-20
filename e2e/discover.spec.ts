import { test, expect, type Page } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, befriend, clearFriends, setPrivacy, DEFAULT_PRIVACY, ALEX, SAM } from './db'

// The dashboard's game search and the store page (/discover/<igdbId>), public
// edition only. Uses the real IGDB (The Witcher 3, IGDB 1942), so it needs
// internet and the IGDB keys. Signed in as test-sam.

test.describe.configure({ mode: 'serial' })
test.skip(EDITION !== 'public', 'game search and store pages are public edition only')

const W3 = 1942
let page: Page
let samId: string
let alexId: string

async function clearW3(...ids: string[]) {
  await admin().from('games').delete().eq('igdb_id', W3).in('user_id', ids)
}

test.beforeAll(async ({ browser }) => {
  samId = await userId(SAM)
  alexId = await userId(ALEX)
  await clearW3(samId, alexId)
  await clearFriends(samId, alexId)
  page = await (await browser.newContext()).newPage()
  await login(page, TEST_USER_2)
})

test.afterAll(async () => {
  await clearW3(samId, alexId)
  await clearFriends(samId, alexId)
  await setPrivacy(alexId, DEFAULT_PRIVACY)
  await page?.context().close()
})

test('search on the dashboard opens the game\'s page', async () => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.getByRole('combobox', { name: 'Search every game' }).fill('witcher 3 wild hunt')
  const option = page.getByRole('option').filter({ hasText: 'The Witcher 3: Wild Hunt' }).first()
  await expect(option).toBeVisible({ timeout: 20_000 })
  await option.click()
  await expect(page).toHaveURL(new RegExp(`/discover/${W3}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'The Witcher 3: Wild Hunt' })).toBeVisible()
})

test('the page shows the trailer, ratings, facts, shops and DLC', async () => {
  await page.goto(`/discover/${W3}`)
  await expect(page.getByRole('button', { name: /^Play / })).toBeVisible()
  await expect(page.getByText('IGDB rating')).toBeVisible()
  await expect(page.getByText('PEGI 18')).toBeVisible()
  await expect(page.getByText('CD Projekt RED').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Steam' })).toHaveAttribute('href', /store\.steampowered\.com/)
  await expect(page.getByRole('heading', { name: 'DLC and editions' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Blood and Wine/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /^More from / })).toBeVisible()
})

test('Add to Backlog puts it in your library, and the page then says so', async () => {
  await page.goto(`/discover/${W3}`)
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Add to Backlog', exact: true }).click()
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Select…' }) }).selectOption('Steam')
  await page.getByRole('button', { name: 'Add to backlog', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Open in your library' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/^In your library/)).toBeVisible()
  const { data } = await admin().from('games').select('status, igdb_id, platform').eq('user_id', samId).eq('igdb_id', W3)
  expect(data).toEqual([{ status: 'backlog', igdb_id: W3, platform: 'Steam' }])
})

test('friends who have it: a friend\'s copy shows, with status and hours', async () => {
  await befriend(samId, alexId)
  await admin().from('games').insert({ user_id: alexId, title: 'The Witcher 3: Wild Hunt', status: 'completed', igdb_id: W3, platform: 'Steam', hours_played: 120, completion_date: '2020-01-01' })
  await page.goto(`/discover/${W3}`)
  await page.getByRole('button', { name: /1 friend has this/ }).click()
  await expect(page.getByRole('link', { name: /Alex \(test\).*Completed · 120h/ })).toBeVisible()

  // Their privacy still applies: games set to Only me aren't shown.
  await setPrivacy(alexId, { privacy_games: 'only_me' })
  await page.goto(`/discover/${W3}`)
  await expect(page.getByRole('button', { name: /friend has this/ })).toHaveCount(0)
})

// The page has a loading skeleton (loading.tsx), so Next.js has already sent
// a 200 when it finds the game doesn't exist: check what the visitor sees.
test('an unknown game is not found', async () => {
  await page.goto('/discover/999999999')
  await expect(page.getByText('This page could not be found.')).toBeVisible({ timeout: 20_000 })
})

test('picking a game shows a skeleton while its page loads', async () => {
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  // Hold the page's own request back a moment, so the skeleton is there to see.
  await page.route(/\/discover\/\d+/, async route => { await new Promise(r => setTimeout(r, 1500)); await route.continue() })
  await page.getByRole('combobox', { name: 'Search every game' }).fill('witcher 3 wild hunt')
  const option = page.getByRole('option').filter({ hasText: 'The Witcher 3: Wild Hunt' }).first()
  await expect(option).toBeVisible({ timeout: 20_000 })
  await option.click()
  await expect(page.getByLabel('Loading game')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'The Witcher 3: Wild Hunt' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('Loading game')).toHaveCount(0)
  await page.unroute(/\/discover\/\d+/)
})
