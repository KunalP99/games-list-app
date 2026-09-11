import type { Page, BrowserContext } from '@playwright/test'

// Seeded by scripts/seed-dev.mjs. If the local stack has been wiped and
// re-seeded, these still hold.
export const TEST_USER = {
  email: 'test-alex@example.com',
  password: 'test-password-123',
}

// A second account so a test that finalizes a turn (advancing wheel_turn:
// spin → spin_reroll → choose) doesn't change what every other test sees when
// they all share TEST_USER. Only use this for tests that must finalize.
export const TEST_USER_2 = {
  email: 'test-sam@example.com',
  password: 'test-password-123',
}

export async function login(page: Page, user: { email: string; password: string } = TEST_USER) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password', { exact: true }).fill(user.password)
  // The signin/signup mode toggle is also labelled "Sign In" — scope to the
  // submit button specifically.
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 15_000 })
}

// Simulates actually closing the tab and opening a fresh one — not a reload.
// A reload keeps whatever the page already fetched; this proves the state
// survives having genuinely gone away and come back, which is the real claim
// the feature makes. Reuses the browser's storage state, so the session stays
// logged in exactly as a real reopened tab would.
export async function closeAndReopen(page: Page, path: string): Promise<Page> {
  const context: BrowserContext = page.context()
  await page.close()
  const fresh = await context.newPage()
  await fresh.goto(path)
  return fresh
}

// Adds every eligible backlog game in one click (components/wheel/WheelClient.tsx
// "Add all") — avoids depending on the RAWG/IGDB search dropdown, which would
// make these tests depend on a live external API.
export async function addAllBacklogGames(page: Page) {
  await page.getByRole('button', { name: 'Add all' }).click()
}

export async function readTicketBalance(page: Page): Promise<number> {
  const text = await page.getByText(/^Balance: \d+/).innerText()
  const match = text.match(/Balance: (\d+)/)
  if (!match) throw new Error(`Could not parse balance from "${text}"`)
  return Number(match[1])
}
