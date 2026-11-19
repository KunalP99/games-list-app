import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // e2e/ holds Playwright specs (npm run test:e2e) — a different test runner
    // with its own `test`/`expect`, incompatible with Vitest's.
    exclude: ['**/node_modules/**', 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // `import 'server-only'` (lib/supabase/admin.ts and the API key modules)
      // throws outside Next.js's server build; the unit tests are server code.
      'server-only': path.resolve(__dirname, 'lib/__tests__/server-only-stub.ts'),
    },
  },
})
