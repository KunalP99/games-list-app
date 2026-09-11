import { test, expect } from '@playwright/test'
import { login, closeAndReopen, addAllBacklogGames, readTicketBalance, TEST_USER_2 } from './helpers'
import { resetTestWheelState } from './reset-state'

// These prove what lib/__tests__/wheel-session.test.ts structurally cannot:
// that the whole save → close tab → reopen → render loop actually works
// end to end, against a real browser and a real database.
//
// Each test starts from a clean wheel turn — the app has no "reset" affordance
// by design (see CLAUDE.md), so tests finish their turn (Skip on a Choose turn,
// or by never spending past what they verify) rather than relying on the
// previous test's end state.

test.beforeEach(async () => {
  // Each test starts a fresh turn — otherwise a previous test's saved session
  // (correctly!) resumes instead of landing on an empty setup screen. Login is
  // left to each test: middleware redirects an already-authenticated visit to
  // /login straight to /dashboard, so a shared login-as-Alex here would break
  // the one test that needs to sign in as Sam instead.
  await resetTestWheelState()
})

test.afterEach(async () => {
  // saveWheelSession is deliberately fire-and-forget on the client (by
  // design — the feature it tests must survive the very tab close that would
  // otherwise cancel an awaited request). That means a save triggered right
  // before a test's last assertion can still be in flight when the test ends,
  // and could land on the server after the *next* test's beforeEach reset,
  // silently resurrecting this test's state. Give it a moment to land, then
  // reset again so the next test starts from a genuinely clean slate.
  await new Promise(r => setTimeout(r, 800))
  await resetTestWheelState()
})

test('a half-built entry list survives closing the tab', async ({ page }) => {
  await login(page)
  await page.goto('/wheel')
  await addAllBacklogGames(page)

  const countBefore = await page.getByText(/^\d+ \/ \d+\+$/).innerText()
  expect(countBefore).not.toBe('0 / 5+')

  // Setup edits are saved debounced (~600ms) rather than on every keystroke —
  // wait it out, otherwise this test would be racing the app's own save timer
  // rather than testing persistence.
  await page.waitForTimeout(800)
  const resumedPage = await closeAndReopen(page, '/wheel')

  await expect(resumedPage.getByText(countBefore, { exact: true })).toBeVisible()
  // Still on the setup screen with a spin available — not reset to empty.
  await expect(resumedPage.getByRole('button', { name: '🎰 Spin!' })).toBeEnabled()
})

test('an elimination run survives closing the tab mid-run', async ({ page }) => {
  await login(page)
  await page.goto('/wheel')
  await addAllBacklogGames(page)
  // Elimination is the default mode; explicit for clarity.
  await page.getByRole('button', { name: 'Elimination', exact: false }).click()

  await page.getByRole('button', { name: '🎰 Spin!' }).click()

  // The animation is 4s; elim_step is the settled, waiting-for-input phase.
  await expect(page.getByText('Eliminated')).toBeVisible({ timeout: 8_000 })
  const eliminatedGame = await page.locator('p.text-lg.font-bold').first().innerText()
  const remainingBefore = await page.getByText(/remaining$/).innerText()

  const resumedPage = await closeAndReopen(page, '/wheel')

  // Same game still eliminated, same count remaining — proves elimQueue and
  // elimIndex were persisted verbatim rather than regenerated.
  await expect(resumedPage.getByText('Eliminated')).toBeVisible()
  await expect(resumedPage.locator('p.text-lg.font-bold').first()).toHaveText(eliminatedGame)
  await expect(resumedPage.getByText(remainingBefore, { exact: true })).toBeVisible()
})

test('a spin result awaiting Accept survives closing the tab', async ({ page }) => {
  await login(page)
  await page.goto('/wheel')
  await addAllBacklogGames(page)
  await page.getByRole('button', { name: 'First Land' }).click() // single spin, no elimination loop
  await page.getByRole('button', { name: '🎰 Spin!' }).click()

  await expect(page.getByText('You got')).toBeVisible({ timeout: 8_000 })
  const winner = await page.locator('p.text-2xl.font-bold').first().innerText()

  const resumedPage = await closeAndReopen(page, '/wheel')

  await expect(resumedPage.getByText('You got')).toBeVisible()
  await expect(resumedPage.locator('p.text-2xl.font-bold').first()).toHaveText(winner)
  await expect(resumedPage.getByRole('button', { name: '✅ Accept this game' })).toBeEnabled()
})

// The bug this whole feature exists to fix: paySpinAgain used to deduct
// tickets and return the winner only in the HTTP response, with nothing
// written to the database. Closing the tab before that response was acted on
// meant the tickets were gone and the result was unrecoverable.
test('a paid Spin Again is not lost if the tab closes before its animation finishes', async ({ page }) => {
  await login(page)
  await page.goto('/wheel')
  await addAllBacklogGames(page)
  await page.getByRole('button', { name: 'First Land' }).click()
  await page.getByRole('button', { name: '🎰 Spin!' }).click()
  await expect(page.getByText('You got')).toBeVisible({ timeout: 8_000 })

  const balanceBefore = await readTicketBalance(page)
  test.skip(balanceBefore < 3, 'test-alex needs at least 3 tickets for this test')

  await page.getByRole('button', { name: '🎰 Spin Again' }).click()

  // Close mid-animation — deliberately not waiting for the 4s spin to settle.
  // This is the exact window the original bug lost the result in.
  await page.waitForTimeout(500)
  const resumedPage = await closeAndReopen(page, '/wheel')

  // Landed on the settled result rather than replaying the animation, and
  // charged exactly once.
  await expect(resumedPage.getByText('You got')).toBeVisible({ timeout: 8_000 })
  await expect(resumedPage.getByText('Turn resumed.')).toBeVisible()
  const balanceAfter = await readTicketBalance(resumedPage)
  expect(balanceAfter).toBe(balanceBefore - 3)
})

test('a finalized turn does not resurrect on the next visit', async ({ page }) => {
  // A dedicated account: finalizing advances wheel_turn (spin -> spin_reroll),
  // which would change what every other test in this file sees if they all
  // shared TEST_USER.
  await login(page, TEST_USER_2)
  await page.goto('/wheel')
  await addAllBacklogGames(page)
  await page.getByRole('button', { name: 'First Land' }).click()
  await page.getByRole('button', { name: '🎰 Spin!' }).click()
  await expect(page.getByText('You got')).toBeVisible({ timeout: 8_000 })

  await page.getByRole('button', { name: '✅ Accept this game' }).click()
  // A won game with no RAWG identity (free-text add) skips the review modal
  // and finalizes immediately; a linked game opens it first.
  const platformModal = page.getByRole('heading', { name: /platform/i })
  if (await platformModal.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole('combobox').selectOption({ index: 1 })
    await page.getByRole('button', { name: /confirm/i }).click()
  }
  await expect(page.getByText('Good luck!')).toBeVisible({ timeout: 8_000 }) // 'done' phase settled

  const resumedPage = await closeAndReopen(page, '/wheel')

  // wheel_session was cleared by advanceTurn — no stale "You got" screen.
  await expect(resumedPage.getByRole('button', { name: '🎰 Spin!' }).or(
    resumedPage.getByText('Pick a Game', { exact: false }),
  )).toBeVisible({ timeout: 8_000 })
})
