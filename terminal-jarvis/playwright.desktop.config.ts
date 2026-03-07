import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /desktop-.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: 'list'
})
