import { test, expect } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { resetTestWheelState } from './reset-state'
import { admin, userId, tempGames } from './db'

// The Main Game (friends edition): a game the wheel picked shows on its own
// above Playing, and one won since the lock came in (games.locks_wheel) holds
// the wheel until it's completed or dropped, and can't go back to the Backlog.

test.skip(EDITION === 'public', 'The public edition has no wheel.')
test.describe.configure({ mode: 'serial' })

let uid: string
const games = {} as ReturnType<typeof tempGames>
test.beforeAll(async () => {
  uid = await userId(TEST_USER_2.email)
  Object.assign(games, tempGames(uid))
})
test.beforeEach(async () => { await resetTestWheelState() })
test.afterAll(async () => {
  await games.cleanup()
  await resetTestWheelState()
})

test('a wheel game is the Main Game and locks the wheel until it is dropped', async ({ page }) => {
  const title = 'ZZ E2E Main Game'
  const id = await games.add({ title, status: 'playing', assigned_by: uid, locks_wheel: true, start_date: '2026-11-27' })
  const other = await games.add({ title: 'ZZ E2E Just Playing', status: 'playing' })
  await login(page, TEST_USER_2)

  // Main Game above Playing, each game in its own section.
  await page.goto('/games')
  const main = page.getByRole('heading', { name: /^Main Game/ })
  const playing = page.getByRole('heading', { name: /^Playing/ })
  await expect(main).toBeVisible()
  await expect(playing).toBeVisible()
  expect((await main.boundingBox())!.y).toBeLessThan((await playing.boundingBox())!.y)
  await expect(page.getByRole('heading', { name: title }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Ambient' })).toHaveCount(0)
  void other

  // The wheel is locked.
  await page.goto('/wheel')
  await expect(page.getByRole('heading', { name: 'The wheel is locked' })).toBeVisible()
  await expect(page.getByRole('link', { name: `Go to ${title}` })).toBeVisible()

  // It can't be put back in the Backlog.
  await page.goto(`/games/${id}/edit`)
  await page.waitForLoadState('networkidle')
  await page.locator('select[name="status"]').selectOption('backlog')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.getByText(/This is your Main Game from the wheel/)).toBeVisible()
  expect((await admin().from('games').select('status').eq('id', id).single()).data!.status).toBe('playing')

  // Dropped (DNF): the wheel is free again.
  await admin().from('games').update({ status: 'dnf' }).eq('id', id)
  await page.goto('/wheel')
  await expect(page.getByRole('heading', { name: 'The wheel is locked' })).toHaveCount(0)
})

test('a game played outside the wheel and its Main Game copy: the Main Game gets the hours unless switched', async ({ page }) => {
  const mp = await games.add({ title: 'ZZ E2E Two Copies', status: 'playing', igdb_id: 9999001 })
  const main = await games.add({ title: 'ZZ E2E Two Copies', status: 'playing', igdb_id: 9999001, assigned_by: uid, locks_wheel: true })
  await login(page, TEST_USER_2)

  await page.goto(`/games/${main}`)
  await expect(page.getByText(/counts your tracked hours on this copy \(your Main Game\)/)).toBeVisible()

  await page.goto(`/games/${mp}`)
  await expect(page.getByText(/counts your tracked hours on your other copy/)).toBeVisible()
  await page.getByRole('button', { name: 'Count tracked hours here' }).click()
  await expect(page.getByText(/counts your tracked hours on this copy/)).toBeVisible()
  const flags = await admin().from('games').select('id, tracks_hours').in('id', [mp, main])
  expect(Object.fromEntries(flags.data!.map(r => [r.id, r.tracks_hours]))).toEqual({ [mp]: true, [main]: false })
})

test('deleting the Main Game counts as dropping it: the DNF charge applies and stays', async ({ page }) => {
  const id = await games.add({ title: 'ZZ E2E Delete Main', status: 'playing', assigned_by: uid, locks_wheel: true })
  const balance = async () => (await admin().from('profiles').select('ticket_balance').eq('id', uid).single()).data!.ticket_balance as number
  const before = await balance()
  await login(page, TEST_USER_2)
  await page.goto(`/games/${id}`)
  await page.getByRole('button', { name: 'Delete', exact: true }).first().click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText(/counts as dropping it \(DNF\)/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect.poll(async () => (await admin().from('games').select('id').eq('id', id)).data!.length).toBe(0)
  expect(await balance(), 'the DNF charge stays').toBe(before - 5)
  await page.goto('/wheel')
  await expect(page.getByRole('heading', { name: 'The wheel is locked' })).toHaveCount(0)
})
