import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@jarvis/core': resolve(__dirname, './packages/core/src/index.ts'),
      '@jarvis/api': resolve(__dirname, './packages/api/src/index.ts')
    }
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80
    }
  }
})
