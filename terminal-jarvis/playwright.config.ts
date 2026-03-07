import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    headless: true,
    baseURL: 'http://127.0.0.1:4173'
  },
  webServer: {
    command: 'node ./scripts/site-dev.mjs',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000
  }
})
