import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { login, localEnv, EDITION, TEST_USER } from './helpers'

// Smoke test: opens every main page, signed in, and fails on anything that
// looks broken — an error status, an uncaught JavaScript error, Next.js's error
// screen, or a page with no heading. It doesn't check that numbers or layouts
// are right; it catches "this page crashes / is blank", which is what a
// library upgrade or a change to what pages read tends to cause.
//
// Runs against whichever edition the dev server is serving (see EDITION):
// friends-only pages must 404 in the public edition and vice versa. Run it in
// both after any change that could affect pages:
//   npm run env:dev        → restart npm run dev → npm run test:e2e
//   npm run env:dev-public → restart npm run dev → npm run test:e2e
//
// Read-only: it opens pages, never submits a form.

const PUBLIC = EDITION === 'public'

type Ids = { ownGame: string; otherGame: string }

async function seededIds(): Promise<Ids> {
  const env = localEnv()
  if (!/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
    throw new Error('Refusing to read test data from a non-local database.')
  }
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: users } = await sb.from('profiles').select('id, username').in('username', ['test-alex', 'test-sam'])
  const id = (name: string) => (users ?? []).find((u: { username: string }) => u.username === name)?.id
  const firstGame = async (userId: string | undefined) => {
    const { data } = await sb.from('games').select('id').eq('user_id', userId ?? '').eq('title', 'Hollow Knight').limit(1)
    const any = data?.[0] ?? (await sb.from('games').select('id').eq('user_id', userId ?? '').limit(1)).data?.[0]
    if (!any) throw new Error('No seeded games found. Run: npm run seed:dev')
    return any.id as string
  }
  return { ownGame: await firstGame(id('test-alex')), otherGame: await firstGame(id('test-sam')) }
}

/** Opens a page and checks it rendered properly. */
async function expectPageWorks(page: Page, path: string, errors: string[]) {
  errors.length = 0
  const response = await page.goto(path)
  const status = response?.status() ?? 0
  expect(status, `${path} returned HTTP ${status}`).toBeLessThan(400)
  // Something with a heading, inside the page (not just the nav).
  await expect(page.locator('main h1, main h2, h1').first(), `${path} has no heading`).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(/Application error|Unhandled Runtime Error|Internal Server Error/).first()).toHaveCount(0)
  // Next's dev error screen lives in a <nextjs-portal> element with a dialog.
  expect(await page.locator('nextjs-portal [role="dialog"], nextjs-portal [data-nextjs-dialog]').count(), `${path} shows Next.js's error screen`).toBe(0)
  // Give any client components a moment to throw.
  await page.waitForTimeout(300)
  expect(errors, `${path} threw a JavaScript error`).toEqual([])
}

// Checks what a visitor sees, not only the status: a page with a loading.tsx
// (the wheel pages) has already started streaming with HTTP 200 by the time it
// calls notFound(), so Next.js shows its not-found screen with a 200. Visitors
// get the right page either way.
async function expectNotFound(page: Page, path: string) {
  const response = await page.goto(path)
  if (response?.status() === 404) return
  await expect(
    page.getByText('This page could not be found.'),
    `${path} should not exist in the ${EDITION} edition`,
  ).toBeVisible({ timeout: 20_000 })
}

test.describe.configure({ mode: 'serial' })

test.describe(`smoke (${EDITION} edition), signed in`, () => {
  let context: BrowserContext
  let page: Page
  let ids: Ids
  const errors: string[] = []

  test.beforeAll(async ({ browser }) => {
    ids = await seededIds()
    context = await browser.newContext()
    page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text()}`) })
    await login(page, TEST_USER)
  })
  test.afterAll(async () => { await context?.close() })

  const pages: [string, () => string][] = [
    ['dashboard', () => '/dashboard'],
    ['games (default tab)', () => '/games'],
    ['games: All', () => '/games?status=all'],
    ['games: Playing', () => '/games?status=playing'],
    ['games: Backlog', () => '/games?status=backlog'],
    ['games: Completed', () => '/games?status=completed'],
    ['games: DNF', () => '/games?status=dnf'],
    ['games: search with a comma and brackets', () => '/games?status=all&q=' + encodeURIComponent('Hollow, (Knight)')],
    ['add a game', () => '/games/new'],
    ['your own game', () => `/games/${ids.ownGame}`],
    ['edit your own game', () => `/games/${ids.ownGame}/edit`],
    ['someone else\'s game', () => `/games/${ids.otherGame}`],
    ['your profile', () => '/users/test-alex'],
    ['someone else\'s profile', () => '/users/test-sam'],
    ['someone else\'s profile, searched', () => '/users/test-sam?status=all&q=' + encodeURIComponent('40,000')],
    ['stats', () => '/stats'],
    ['stats head-to-head', () => '/stats?compare=test-sam'],
    ['achievements', () => '/achievements'],
    ['activity', () => '/activity'],
    ['ticket history', () => '/tickets'],
    ['settings', () => '/settings'],
    ['import', () => '/import'],
    ['link a program (desktop app page)', () => '/settings/devices/link?exe=game.exe'],
    ['pair a PC (desktop app page)', () => '/settings/devices/pair?callback=' + encodeURIComponent('http://127.0.0.1:5555/cb')],
  ]
  if (!PUBLIC) {
    pages.push(['games: Ambient', () => '/games?status=ambient'])
    pages.push(['wheel', () => '/wheel'])
    pages.push(['wheel history', () => '/wheel/history'])
  } else {
    pages.push(['reset password', () => '/reset-password'])
  }

  for (const [name, path] of pages) {
    test(`${name} works`, async () => {
      await expectPageWorks(page, path(), errors)
    })
  }

  test('games list in table and cover views works', async () => {
    for (const view of ['table', 'cover', 'grid']) {
      await context.addCookies([{ name: 'gameView', value: view, url: 'http://localhost:3000' }])
      await expectPageWorks(page, '/games?status=all', errors)
    }
  })

  test('admin page sends a non-admin to the dashboard', async () => {
    await page.goto('/admin/exe-links')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  if (PUBLIC) {
    test('wheel pages do not exist in the public edition', async () => {
      await expectNotFound(page, '/wheel')
      await expectNotFound(page, '/wheel/history')
    })
  } else {
    test('public-only pages do not exist in the friends edition', async () => {
      await expectNotFound(page, '/forgot-password')
      await expectNotFound(page, '/reset-password')
      await expectNotFound(page, '/welcome')
    })
  }
})

test.describe(`smoke (${EDITION} edition), signed out`, () => {
  test('login page works', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (/Content Security Policy/i.test(m.text())) errors.push(`CSP: ${m.text()}`) })
    const response = await page.goto('/login')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByLabel('Email')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('protected pages send you to the login page', async ({ page }) => {
    for (const path of ['/dashboard', '/games', '/settings']) {
      await page.goto(path)
      await expect(page, `${path} should redirect to /login`).toHaveURL(/\/login/)
    }
  })

  if (PUBLIC) {
    test('forgot password page works', async ({ page }) => {
      const response = await page.goto('/forgot-password')
      expect(response?.status()).toBeLessThan(400)
      await expect(page.getByLabel(/email/i)).toBeVisible()
    })
  }
})
