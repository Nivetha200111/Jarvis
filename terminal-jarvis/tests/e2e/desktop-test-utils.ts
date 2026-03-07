import { _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
export const repoRoot = resolve(__dirname, '../..')
export const desktopMain = resolve(repoRoot, 'packages/desktop/dist/main.cjs')

export const createDesktopE2EConfig = (overrides = {}) => ({
  ollamaStatus: {
    installed: true,
    running: true,
    provider: 'ollama'
  },
  catalog: {
    source: 'remote',
    installedModelIds: ['qwen2.5:3b', 'qwen2.5vl:3b', 'nomic-embed-text'],
    baselineModelIds: ['qwen2.5:3b', 'qwen2.5vl:3b', 'nomic-embed-text'],
    models: [
      {
        id: 'qwen2.5:3b',
        family: 'chat',
        sizeBytes: 2_400_000_000,
        parameterSize: '3B',
        quantization: 'Q4_K_M',
        modifiedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'qwen2.5vl:3b',
        family: 'vision',
        sizeBytes: 3_200_000_000,
        parameterSize: '3B',
        quantization: 'Q4_K_M',
        modifiedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'nomic-embed-text',
        family: 'embedding',
        sizeBytes: 274_000_000,
        parameterSize: '137M',
        quantization: 'F16',
        modifiedAt: '2026-03-01T00:00:00.000Z'
      },
      {
        id: 'mistral:latest',
        family: 'chat',
        sizeBytes: 4_100_000_000,
        parameterSize: '7B',
        quantization: 'Q4_K_M',
        modifiedAt: '2026-03-05T00:00:00.000Z'
      },
      {
        id: 'deepseek-r1:8b',
        family: 'reasoning',
        sizeBytes: 4_900_000_000,
        parameterSize: '8B',
        quantization: 'Q4_K_M',
        modifiedAt: '2026-03-04T00:00:00.000Z'
      }
    ]
  },
  pullScenarios: {
    'mistral:latest': [
      'Resolving manifest...',
      'Pulling model layers...',
      'Verifying checksum...',
      'mistral:latest ready'
    ]
  },
  ...overrides
})

export const launchDesktopE2E = async ({
  homeDir,
  config,
  extraEnv = {}
}: {
  homeDir: string
  config: Record<string, unknown>
  extraEnv?: Record<string, string | undefined>
}) => {
  const launchArgs = process.platform === 'linux'
    ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', desktopMain]
    : [desktopMain]

  const env = {
    ...process.env,
    HOME: homeDir,
    JARVIS_ENGINE: 'mock',
    JARVIS_OZONE_PLATFORM: process.platform === 'linux' ? 'x11' : process.env.JARVIS_OZONE_PLATFORM,
    JARVIS_DESKTOP_E2E: '1',
    JARVIS_DESKTOP_E2E_CONFIG: JSON.stringify(config),
    ...extraEnv
  }
  delete env.ELECTRON_RUN_AS_NODE

  return electron.launch({
    executablePath: electronBinary,
    args: launchArgs,
    cwd: resolve(repoRoot, 'packages/desktop'),
    env
  })
}
