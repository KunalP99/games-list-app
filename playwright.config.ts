import { defineConfig, devices } from '@playwright/test'

// Real-browser tests for flows that structurally can't be verified by Vitest —
// persistence across a real page/tab close, in particular. See e2e/README.md.
//
// These are NEVER meant to run against production. `e2e/global-setup.ts`
// hard-refuses to proceed unless the app it can reach is showing the "TEST
// DATABASE" pill — the same EnvBanner used everywhere else to make the active
// environment unmistakable.

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false, // tests share two seeded accounts; parallel runs would race each other's wheel_session
  retries: 0, // a flaky e2e test hiding a real bug is worse than a red run
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
