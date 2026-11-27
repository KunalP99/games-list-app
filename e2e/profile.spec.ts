import { test, expect, type Page, type Browser } from '@playwright/test'
import { login, TEST_USER, TEST_USER_2, EDITION } from './helpers'
import { admin, userId, setPrivacy, clearFriends, DEFAULT_PRIVACY, ALEX, SAM } from './db'

// The public edition's profile (FEATURES.newProfile, lib/profile-cards.ts):
// the profile card, cards you add, size, move and remove, the bio, what
// visitors see, and the games list under the cards. Puts test-alex's layout and bio back.

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
  await expect(card.getByText('played', { exact: true })).toBeVisible()
  await expect(card.getByText('completed', { exact: true })).toBeVisible()
  await expect.poll(() => cardsOnPage(page))
    .toEqual(['playing', 'finish_rate', 'achievements', 'streak', 'completed_this_year', 'genres', 'recently_completed', 'platforms'])
})

test('editing: remove, add in a square space, resize and drag, then Done keeps it', async ({ page }) => {
  await login(page, TEST_USER)
  // Tall enough that the first and last cards are both on screen for the drag.
  await page.setViewportSize({ width: 1280, height: 1800 })
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  const toolbar = page.getByRole('toolbar', { name: 'Editing your profile' })
  await expect(toolbar).toBeVisible()

  // The second row (two squares and Favourite genres) loses a square: a square
  // space opens at its end. Up next doesn't come as a square, so it goes in
  // full width on the next row.
  await page.getByRole('button', { name: 'Remove Completed this year' }).click()
  await page.getByRole('button', { name: /Add a card/ }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add a card' })
  await expect(dialog.getByText('This is a square space.', { exact: false })).toBeVisible()
  await expect(dialog.locator('button[data-card="playing"]')).toBeDisabled()
  await dialog.locator('button[data-card="up_next"]').click()
  await dialog.getByRole('button', { name: 'Add Up next' }).click()
  await expect(dialog).toHaveCount(0)

  await page.getByRole('group', { name: 'Achievements size' }).getByRole('button', { name: 'Half' }).click()

  // Drag Platforms (last) onto Currently playing (first): both half, so they swap.
  const handle = page.getByRole('button', { name: 'Move Platforms', exact: true })
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

  const expected = ['platforms', 'finish_rate', 'achievements', 'streak', 'genres', 'up_next', 'recently_completed', 'playing']
  await expect.poll(() => cardsOnPage(page)).toEqual(expected)

  await toolbar.getByRole('button', { name: 'Done' }).click()
  await expect(toolbar).toHaveCount(0)
  await expect.poll(async () => (await storedLayout()).profile_layout?.map(i => i.card)).toEqual(expected)
  const sizes = Object.fromEntries(((await storedLayout()).profile_layout ?? []).map(i => [i.card, i.size]))
  expect(sizes).toMatchObject({ playing: 'half', finish_rate: 'small', achievements: 'half', up_next: 'full' })

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
  // Nothing moves until it's put down; Finish rate lights up as the target.
  await expect(page.locator('[data-card="finish_rate"]')).toHaveAttribute('data-over', 'true')
  await page.keyboard.press('Space')
  await expect.poll(() => cardsOnPage(page))
    .toEqual(['playing', 'achievements', 'finish_rate', 'streak', 'completed_this_year', 'genres', 'recently_completed', 'platforms'])
})

test('an empty space splits into halves, then squares, and a card goes in a square', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  // Free up a square-sized card, then split the full space at the end.
  await page.getByRole('button', { name: 'Remove Play streak' }).click()
  const spaces = () => page.locator('[data-space]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-space')))
  await expect.poll(spaces).toEqual(['small', 'full'])

  await page.getByRole('button', { name: 'Split into halves' }).click()
  await expect.poll(spaces).toEqual(['small', 'half', 'half'])
  await page.getByRole('button', { name: 'Split into squares' }).first().click()
  await expect.poll(spaces).toEqual(['small', 'small', 'small', 'half'])

  // The first square at the end (the row's own gap comes first).
  await page.locator('[data-space="small"]').nth(1).getByRole('button', { name: /Add a card/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Add a card' })
  await expect(dialog.getByText('This is a square space.', { exact: false })).toBeVisible()
  await dialog.locator('button[data-card="streak"]').click()
  await dialog.getByRole('button', { name: 'Add Play streak' }).click()

  await page.getByRole('toolbar', { name: 'Editing your profile' }).getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await storedLayout()).profile_layout?.at(-1)).toEqual({ card: 'streak', size: 'small' })
})

test('a card dragged onto an empty space (a split one too) moves into it, and no other card moves', async ({ page }) => {
  // Row 1: Currently playing, Play streak, Achievements. Row 2: two squares
  // and an empty half, which is split into squares and gets Play streak.
  await admin().from('profiles').update({
    profile_layout: [
      { card: 'playing', size: 'half' }, { card: 'streak', size: 'small' }, { card: 'achievements', size: 'small' },
      { card: 'completed_this_year', size: 'small' }, { card: 'finish_rate', size: 'small' },
    ],
  }).eq('id', alexId)
  await login(page, TEST_USER)
  await page.setViewportSize({ width: 1280, height: 1400 })
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByRole('button', { name: 'Split into squares' }).first().click()
  const square = page.locator('[data-space="small"]').first()
  await expect(square).toBeVisible()
  // Where the other cards sit, measured from Currently playing (the edit bar
  // above the grid comes and goes).
  const others = ['achievements', 'completed_this_year', 'finish_rate']
  // (Null while the page is still drawing them, so checks poll.)
  const where = async () => {
    const origin = await page.locator('[data-card="playing"]').boundingBox()
    const boxes = await Promise.all(others.map(card => page.locator(`[data-card="${card}"]`).boundingBox()))
    if (!origin || boxes.some(b => !b)) return null
    return boxes.map(b => [Math.round(b!.x - origin.x), Math.round(b!.y - origin.y)])
  }
  await expect.poll(where).not.toBeNull()
  const before = await where()

  const handle = page.getByRole('button', { name: 'Move Play streak', exact: true })
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 })
  const to = (await square.boundingBox())!
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
  await expect(square).toHaveAttribute('data-over', 'true')
  await page.mouse.up()
  await page.waitForTimeout(150)

  await expect.poll(() => cardsOnPage(page)).toEqual(['playing', 'achievements', 'completed_this_year', 'finish_rate', 'streak'])
  // Play streak's old place is kept as an empty space, so nothing else moved.
  await expect.poll(where).toEqual(before)
  await expect(page.locator('[data-space="small"]').first()).toBeVisible()

  await page.getByRole('toolbar', { name: 'Editing your profile' }).getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await storedLayout()).profile_layout?.map(i => i.card))
    .toEqual(['playing', 'empty', 'achievements', 'completed_this_year', 'finish_rate', 'streak'])
  // And for everyone else too: the empty space holds its place on the page.
  await page.reload()
  await expect.poll(() => cardsOnPage(page)).toEqual(['playing', 'achievements', 'completed_this_year', 'finish_rate', 'streak'])
  await expect.poll(where).toEqual(before)
})

test('a full-width card dragged to the line above the first row goes to the top; no row changes', async ({ page }) => {
  await admin().from('profiles').update({
    profile_layout: [
      { card: 'streak', size: 'small' }, { card: 'completed_this_year', size: 'small' }, { card: 'finish_rate', size: 'small' }, { card: 'achievements', size: 'small' },
      { card: 'recently_completed', size: 'half' }, { card: 'playing', size: 'half' },
      { card: 'calendar', size: 'full' },
    ],
  }).eq('id', alexId)
  await login(page, TEST_USER)
  await page.setViewportSize({ width: 1280, height: 1600 })
  await openOwnProfile(page)
  await page.getByRole('button', { name: 'Edit profile' }).click()

  const handle = page.getByRole('button', { name: 'Move Play calendar', exact: true })
  const from = (await handle.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, from.y - 20, { steps: 5 })
  // The line appears above the first row once dragging starts.
  const line = page.locator('[data-row-line="0"]')
  await expect(line).toHaveCount(1)
  const box = (await line.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 })
  await expect(line).toHaveAttribute('data-over', 'true')
  await expect(page.getByRole('status').filter({ hasText: 'Move to the top' })).toBeVisible()
  await page.mouse.up()
  await page.waitForTimeout(150)
  await expect(page.locator('[data-row-line]')).toHaveCount(0)

  await expect.poll(() => cardsOnPage(page))
    .toEqual(['calendar', 'streak', 'completed_this_year', 'finish_rate', 'achievements', 'recently_completed', 'playing'])
  // Each row kept its cards: the four squares share a top, as do the two halves.
  const top = (card: string) => page.locator(`[data-card="${card}"]`).boundingBox().then(b => Math.round(b!.y))
  const squares = await Promise.all(['streak', 'completed_this_year', 'finish_rate', 'achievements'].map(top))
  expect(new Set(squares).size).toBe(1)
  expect(await top('recently_completed')).toBe(await top('playing'))
  expect(squares[0]).toBeGreaterThan(await top('calendar'))

  await page.getByRole('toolbar', { name: 'Editing your profile' }).getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => (await storedLayout()).profile_layout?.[0]).toEqual({ card: 'calendar', size: 'full' })
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
      .toEqual(['finish_rate', 'achievements', 'completed_this_year', 'genres', 'recently_completed', 'platforms'])

    await setPrivacy(alexId, { ...DEFAULT_PRIVACY, privacy_activity: 'everyone', privacy_achievements: 'only_me' })
    await sam.page.reload()
    await expect.poll(() => cardsOnPage(sam.page))
      .toEqual(['playing', 'finish_rate', 'streak', 'completed_this_year', 'genres', 'recently_completed', 'platforms'])
  } finally {
    await sam.close()
  }
})

test('the games list sits under the cards and its filters work', async ({ page }) => {
  await login(page, TEST_USER)
  await openOwnProfile(page)
  const games = page.getByRole('region', { name: 'My Games' })
  await expect(games.getByText('Persona 5 Royal').first()).toBeVisible()
  // Below the last card.
  const lastCard = (await page.locator('[data-card]').last().boundingBox())!
  expect((await games.boundingBox())!.y).toBeGreaterThan(lastCard.y + lastCard.height)
  await page.waitForLoadState('networkidle')
  // Changing tab leaves the page where it is: no jump back to the top.
  await page.getByRole('button', { name: 'Backlog' }).scrollIntoViewIfNeeded()
  const scrolled = await page.evaluate(() => window.scrollY)
  expect(scrolled).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Backlog' }).click()
  await expect(page).toHaveURL(/status=backlog/)
  await expect(games.getByText('Persona 5 Royal')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
  await page.getByRole('button', { name: 'Completed' }).click()
  await expect(page).toHaveURL(/status=completed/)
  await expect(games.getByText('Persona 5 Royal').first()).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled)
})

test('Settings offers only the set accent colours, and saves the one picked', async ({ page }) => {
  const before = (await admin().from('profiles').select('accent_colour').eq('id', alexId).single()).data!.accent_colour
  try {
    await login(page, TEST_USER)
    await page.goto('/settings')
    const colours = page.getByRole('radiogroup', { name: 'Accent colour' })
    await expect(colours).toBeVisible()
    await expect(page.locator('input[type="color"]')).toHaveCount(0)
    // Let React take over before clicking (the Turnstile widget keeps the network busy).
    await expect(async () => {
      await colours.getByRole('radio', { name: 'Teal' }).click()
      await expect(colours.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 })
    }).toPass({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Save Appearance' }).click()
    await expect.poll(async () => (await admin().from('profiles').select('accent_colour').eq('id', alexId).single()).data!.accent_colour)
      .toBe('#0d9488')
  } finally {
    await admin().from('profiles').update({ accent_colour: before }).eq('id', alexId)
  }
})
