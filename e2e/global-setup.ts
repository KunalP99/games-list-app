import { chromium } from '@playwright/test'
import { resetTestWheelState } from './reset-state'

// Hard stop before a single test runs: these tests log in, spin the wheel, and
// spend tickets. That must never happen against the real Supabase project.
//
// Rather than trust an env var (which could be stale, or read from the wrong
// file), this checks the one signal that's guaranteed to reflect what the
// running app is actually pointed at: components/layout/EnvBanner.tsx renders
// a "TEST DATABASE" pill if and only if NEXT_PUBLIC_APP_ENV=development was
// baked into the build the dev server is currently serving.
export default async function globalSetup() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  try {
    await page.goto('http://localhost:3000/login', { timeout: 10_000 })
  } catch {
    await browser.close()
    throw new Error(
      '\n\nCould not reach http://localhost:3000 — start the app first:\n' +
      '  npm run supabase:start && npm run env:dev && npm run dev\n',
    )
  }

  const pill = await page.getByText('TEST DATABASE').isVisible().catch(() => false)
  await browser.close()

  if (!pill) {
    throw new Error(
      '\n\nRefusing to run: the app at localhost:3000 is not showing the ' +
      '"TEST DATABASE" pill, which means it is not pointed at the local ' +
      'Supabase stack. These tests log in and spend tickets — they must ' +
      'never run against production.\n\n' +
      'Fix: npm run env:dev, then restart npm run dev.\n',
    )
  }

  // Clean slate: no leftover wheel_session, wheel_turn back to 'spin', tickets
  // topped up so the paid-spin test can always afford its assertion.
  await resetTestWheelState()
}
