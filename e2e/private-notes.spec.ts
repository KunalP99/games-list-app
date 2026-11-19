import { test, expect, type Page } from '@playwright/test'
import { login, TEST_USER, TEST_USER_2 } from './helpers'
import { admin, userId, tempGames } from './db'

// Private notes are readable only by their owner — not just hidden by the
// page — and switching a note to public moves it back into the game's row.
// Both editions. (Code review batch 3, SEC-003.)

test.describe.configure({ mode: 'serial' })

let owner: Page
let other: Page
let gameId: string
const games = {} as ReturnType<typeof tempGames>

test.beforeAll(async ({ browser }) => {
  Object.assign(games, tempGames(await userId(TEST_USER_2.email)))
  gameId = await games.add({ title: 'ZZ E2E Notes', status: 'backlog' })
  owner = await (await browser.newContext()).newPage()
  await login(owner, TEST_USER_2)
  other = await (await browser.newContext()).newPage()
  await login(other, TEST_USER)
})

test.afterAll(async () => {
  await games.cleanup()
  await owner?.context().close()
  await other?.context().close()
})

async function saveNotes(text: string, visibility: 'public' | 'private') {
  await owner.goto(`/games/${gameId}/edit`)
  await owner.locator('textarea[name="notes"]').waitFor()
  // Let React take over the page first, or it puts the box's original text
  // back on top of what was typed.
  await owner.waitForLoadState('networkidle')
  await owner.locator('textarea[name="notes"]').fill(text)
  await owner.locator('select[name="notes_public"]').selectOption(visibility)
  await owner.getByRole('button', { name: 'Save Changes' }).click()
  await expect(owner).toHaveURL(new RegExp(`/games/${gameId}$`))
}

const row = () => admin().from('games').select('notes').eq('id', gameId).single().then(r => r.data!.notes)
const privateRow = () => admin().from('game_private_notes').select('notes').eq('game_id', gameId).then(r => r.data ?? [])

test('a private note is stored apart from the game, and only its owner sees it', async () => {
  await saveNotes('my secret plan', 'private')
  expect(await row()).toBeNull()
  expect(await privateRow()).toEqual([{ notes: 'my secret plan' }])
  await expect(owner.getByText('my secret plan')).toBeVisible()

  await owner.goto(`/games/${gameId}/edit`)
  await expect(owner.locator('textarea[name="notes"]')).toHaveValue('my secret plan')

  await other.goto(`/games/${gameId}`)
  await expect(other.getByRole('heading', { name: 'ZZ E2E Notes' }).first()).toBeVisible()
  await expect(other.getByText('my secret plan')).toHaveCount(0)
})

test('switching it to public moves it into the game, for everyone', async () => {
  await saveNotes('now everyone can see', 'public')
  expect(await row()).toBe('now everyone can see')
  expect(await privateRow()).toEqual([])
  await other.goto(`/games/${gameId}`)
  await expect(other.getByText('now everyone can see')).toBeVisible()
})
