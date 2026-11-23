import { test, expect, type Page, type Browser } from '@playwright/test'
import { login, TEST_USER, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, setPrivacy, clearFriends, DEFAULT_PRIVACY, ALEX, SAM } from './db'

// The public edition's profile (FEATURES.newProfile, lib/profile-cards.ts):
// the profile card, cards you add, size, move and remove, the bio, what
// visitors see, and the Games tab. Puts test-alex's layout and bio back.

test.describe.configure({ mode: 'serial' })
test.skip(EDITION !== 'public', 'the card profile is public edition only')

let alexId: string
let samId: string

async function resetProfile() {
  const { error } = await admin().from('profiles').update({ profile_layout: null, bio: null }).eq('id', alexId)
  if (error) throw new Error(`reset failed: ${error.message}`)
}

async function storedLayout() {
  const { data } = await admin().from('profiles').select('profile_layout, bio').eq('id', alexId).single()
  return data as { profile_layout: { card: string; size: string }[] | null; bio: string | null }
}

/** The cards on the page, in order. */
const cardsOnPage = (page: Page) =>
  page.locator('[data-card]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-card')))

async function openOwnProfile(page: Page) {
  await page.goto('/users/test-alex')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1, name: 'Alex (test)' })).toBeVisible()
}

async function signedInAs(browser: Browser, user: typeof TEST_USER) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, user)
  return { page, close: () => context.close() }
}

test.beforeAll(async () => {
  alexId = await userId(ALEX)
  samId = await userId(SAM)
  await clearFriends(alexId, samId)
  await resetProfile()
})

test.afterAll(async () => {
  await resetProfile()
  await setPrivacy(alexId, DEFAULT_PRIVACY)
})

test.beforeEach(async () => {
  await resetProfile()
  await setPrivacy(alexId, DEFAULT_PRIVACY)
})

test('the nav’s Profile opens your profile: the profile card and the default cards', async ({ page }) => {
  await login(page, TEST_USER)
  await page.getByRole('link', { name: 'Profile', exact: true }).first().click()
  await expect(page).toHaveURL(/\/users\/test-alex$/)
  const card = page.getByRole('region', { name: 'Alex (test)' })
  await expect(card.getByText('Hours played')).toBeVisible()
  await expect(card.getByText('Games', { exact: true })).toBeVisible()
  await expect.poll(() => cardsOnPage(page))
    .toEqual(['playing', 'finish_rate', 'achievements', 'recently_completed', 'genres', 'streak'])
})

test('editing: remove, add in a half space, resize and drag, then Done keeps it', async ({ page }) => {
  await login(page, TEST_USER)
  // Tall enough that the first and last cards are both on screen for the drag.
  await page.setViewportSize({ width: 1280, height: 1800 })
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Editing your profile' })
  await expect(toolbar).toBeVisible()

  // Achievements is left alone in its row: a half space opens beside it.
  await page.getByRole('button', { name: 'Remove Finish rate' }).click()
  await page.getByRole('button', { name: /Add a card/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add a card' })
  await expect(dialog.getByText('This is a half-size space.', { exact: false })).toBeVisible()
  await expect(dialog.locator('button[data-card="playing"]')).toBeDisabled()
  await dialog.locator('button[data-card="platforms"]').click()
  await dialog.getByRole('button', { name: 'Add Platforms' }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('group', { name: 'Currently playing size' }).getByRole('button', { name: 'Half' }).click()

  // Drag Play streak (last) onto Currently playing (first).
  const handle = page.getByRole('button', { name: 'Move Play streak', exact: true })
  const target = page.locator('[data-card="playing"]')
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 })
  const to = (await target.boundingBox())!
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 })
  await page.mouse.up()
  await expect(page.getByText('Drop here')).toHaveCount(0)
  // dnd-kit ignores clicks for 50ms after a drop (so the dropped card isn't
  // also clicked); a person never clicks that fast, a test does.
  await page.waitForTimeout(150)

  const expected = ['streak', 'playing', 'achievements', 'platforms', 'recently_completed', 'genres']
  await expect.poll(() => cardsOnPage(page)).toEqual(expected)

  await toolbar.getByRole('button', { name: 'Done' }).click()
  await expect(toolbar).toHaveCount(0)
  await expect.poll(async () => (await storedLayout()).profile_layout?.map(i => i.card)).toEqual(expected)
  expect((await storedLayout()).profile_layout?.find(i => i.card === 'playing')?.size).toBe('half')

  await page.reload()
  await expect.poll(() => cardsOnPage(page)).toEqual(expected)
})

test('a card moves with the keyboard', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  // Achievements sits right of Finish rate: pick it up, go left, put it down.
  await page.getByRole('button', { name: 'Move Achievements', exact: true }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Space')
  await expect.poll(() => cardsOnPage(page))
    .toEqual(['playing', 'achievements', 'finish_rate', 'recently_completed', 'genres', 'streak'])
})

test('Cancel throws the changes away', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByRole('button', { name: 'Remove Achievements' }).click()
  await expect(page.locator('[data-card="achievements"]')).toHaveCount(0)
  await page.getByRole('toolbar', { name: 'Editing your profile' }).getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('[data-card="achievements"]')).toHaveCount(1)
  expect((await storedLayout()).profile_layout).toBeNull()
})

test('a bio saves and shows on the profile card', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByLabel('Bio').fill('  Finishing the backlog,\none game at a time.  ')
  const toolbar = page.getByRole('toolbar', { name: 'Editing your profile' })
  await toolbar.getByRole('button', { name: 'Done' }).click()
  await expect(toolbar).toHaveCount(0)
  await expect(page.getByText('Finishing the backlog, one game at a time.')).toBeVisible()
  await expect.poll(async () => (await storedLayout()).bio).toBe('Finishing the backlog, one game at a time.')
  await page.reload()
  await expect(page.getByText('Finishing the backlog, one game at a time.')).toBeVisible()
})

test('someone else sees the layout without edit controls, minus what privacy hides', async ({ browser }) => {
  await admin().from('profiles').update({ bio: 'Hello from Alex' }).eq('id', alexId)
  const sam = await signedInAs(browser, TEST_USER_2)
  try {
    await sam.page.goto('/users/test-alex')
    await expect(sam.page.getByText('Hello from Alex')).toBeVisible()
    await expect(sam.page.getByRole('button', { name: 'Edit profile' })).toHaveCount(0)
    await expect(sam.page.getByRole('button', { name: /Move / })).toHaveCount(0)
    // By default activity is friends-only, and Sam isn't a friend.
    await expect.poll(() => cardsOnPage(sam.page))
      .toEqual(['finish_rate', 'achievements', 'recently_completed', 'genres'])

    await setPrivacy(alexId, { ...DEFAULT_PRIVACY, privacy_activity: 'everyone', privacy_achievements: 'only_me' })
    await sam.page.reload()
    await expect.poll(() => cardsOnPage(sam.page))
      .toEqual(['playing', 'finish_rate', 'recently_completed', 'genres', 'streak'])
  } finally {
    await sam.close()
  }
})

test('the Games tab lists their games and its filters work', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  await page.getByRole('navigation', { name: 'Profile' }).getByRole('link', { name: /Games/ }).click()
  await expect(page).toHaveURL(/\/users\/test-alex\/games/)
  await expect(page.getByText('Persona 5 Royal').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Backlog' }).click()
  await expect(page).toHaveURL(/status=backlog/)
  await expect(page.getByText('Persona 5 Royal')).toHaveCount(0)
})
