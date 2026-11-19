import { test, expect, type Page } from '@playwright/test'
import { login, TEST_USER_2, EDITION } from './helpers'
import { admin, anonymous, userId, fillRateLimit, BASE, PASSWORD } from './db'

// Security basics through the real site: headers, signed-out redirects, the
// IGDB rate limits, and changing your password needing the current one.
// Code review batch 4. Runs in either edition.

test.describe.configure({ mode: 'serial' })

test('every response carries the hardening headers', async () => {
  const res = await fetch(`${BASE}/login`)
  expect(res.headers.get('x-frame-options')).toBe('DENY')
  expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  expect(res.headers.get('referrer-policy')).toBeTruthy()
  expect(res.headers.get('permissions-policy')).toContain('camera=()')
})

test('pages only run scripts carrying that request\'s nonce', async () => {
  const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1]
  const [a, b] = await Promise.all([fetch(`${BASE}/login`), fetch(`${BASE}/login`)])
  const csp = a.headers.get('content-security-policy') ?? ''
  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("'strict-dynamic'")
  expect(csp, 'scripts must not be allowed inline').not.toMatch(/script-src[^;]*'unsafe-inline'/)
  const nonce = nonceOf(csp)
  expect(nonce).toBeTruthy()
  expect(nonceOf(b.headers.get('content-security-policy')), 'a fresh nonce per request').not.toBe(nonce)

  const html = await a.text()
  const scripts = html.match(/<script\b[^>]*>/g) ?? []
  expect(scripts.length).toBeGreaterThan(0)
  for (const tag of scripts) expect(tag, 'every script tag carries the nonce').toContain(`nonce="${nonce}"`)
})

// What an injection looks like: markup smuggled into the page with code in an
// attribute. (A script the page's own trusted code creates is allowed on
// purpose, 'strict-dynamic': that's how Turnstile's loader works.)
test('injected markup cannot run code', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const w = window as unknown as { __injected?: boolean }
    let blocked = false
    document.addEventListener('securitypolicyviolation', () => { blocked = true })
    const div = document.createElement('div')
    div.innerHTML = '<img src="data:," onload="window.__injected = true" onerror="window.__injected = true">'
    document.body.appendChild(div)
    await new Promise(r => setTimeout(r, 300))
    return { ran: w.__injected === true, blocked }
  })
  expect(result).toEqual({ ran: false, blocked: true })
})

test('signed-out visitors are sent to /login before any page runs', async () => {
  for (const path of ['/dashboard', '/stats', '/settings', '/achievements', '/activity', '/import', '/admin/exe-links']) {
    const res = await fetch(BASE + path, { redirect: 'manual' })
    expect([302, 303, 307, 308], path).toContain(res.status)
    expect(res.headers.get('location'), path).toMatch(/\/login/)
  }
})

test.describe('signed in', () => {
  let page: Page
  let uid: string
  test.beforeAll(async ({ browser }) => {
    uid = await userId(TEST_USER_2.email)
    await admin().from('rate_limits').delete().eq('user_id', uid)
    page = await (await browser.newContext()).newPage()
    await login(page, TEST_USER_2)
  })
  test.afterAll(async () => {
    await admin().from('rate_limits').delete().eq('user_id', uid)
    // Whatever happened, test-sam keeps the seeded password.
    await admin().auth.admin.updateUserById(uid, { password: PASSWORD })
    await page?.context().close()
  })

  // The counter is pre-filled, so no burst of real IGDB calls. This minute and
  // the next: a slow first request can cross into a new minute's window.
  const fill = (bucket: string, hits: number) => fillRateLimit(uid, bucket, hits)

  test('game search and lookups are rate limited per account', async () => {
    expect((await page.request.get('/api/rawg/search?q=Portal')).status(), 'under the limit').toBe(200)
    await fill('igdb_search', 60)
    const limited = await page.request.get('/api/rawg/search?q=Portal')
    expect(limited.status()).toBe(429)
    expect(limited.headers()['retry-after']).toBe('60')
    await fill('igdb_lookup', 120)
    expect((await page.request.get('/api/rawg/detail/72')).status()).toBe(429)
    expect((await page.request.get('/api/rawg/images/72')).status()).toBe(429)
  })

  async function changePassword(current: string, next: string) {
    await page.goto('/settings')
    await page.locator('input[name="current_password"]').waitFor()
    // Let React take over the form before typing. The public edition's Turnstile
    // widget keeps the network busy, so don't wait for quiet forever.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
    await page.locator('input[name="current_password"]').fill(current)
    await page.locator('input[name="new_password"]').fill(next)
    await page.locator('input[name="confirm_password"]').fill(next)
    await page.getByRole('button', { name: 'Update Password' }).click()
    const msg = page.getByText(/Password updated\.|incorrect|Enter your current password|Please complete/).first()
    await msg.waitFor()
    return msg.innerText()
  }
  const signsInWith = async (pw: string) => !(await anonymous().auth.signInWithPassword({ email: TEST_USER_2.email, password: pw })).error

  test('changing your password needs your current one', async () => {
    test.setTimeout(120_000) // three password changes, each a page load and a sign-in check
    if (EDITION === 'public') {
      await page.goto('/settings')
      const form = page.locator('form').filter({ has: page.locator('input[name="current_password"]') })
      await expect(form.locator('input[name="cf-turnstile-response"]'), 'public: the bot check is on the form').toBeAttached()
    }
    expect(await changePassword('not-my-password', 'temp-pass-456b')).toMatch(/incorrect/)
    expect(await signsInWith(PASSWORD), 'the password did not change').toBe(true)

    expect(await changePassword(PASSWORD, 'temp-pass-456b')).toMatch(/updated/)
    expect(await signsInWith('temp-pass-456b')).toBe(true)
    await page.goto('/dashboard')
    await expect(page, 'still signed in afterwards').toHaveURL(/\/dashboard/)

    expect(await changePassword('temp-pass-456b', PASSWORD)).toMatch(/updated/)
  })
})
