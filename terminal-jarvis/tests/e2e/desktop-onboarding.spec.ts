import { test, expect, _electron as electron } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const desktopMain = resolve(repoRoot, 'packages/desktop/dist/main.cjs')
const screenshotDir = resolve(repoRoot, 'test-results')
const screenshotPath = resolve(screenshotDir, 'desktop-onboarding-e2e.png')

const desktopE2EConfig = {
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
  }
} as const

test('desktop onboarding installs selected extra models from the live catalog', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'jarvis-desktop-e2e-'))
  mkdirSync(screenshotDir, { recursive: true })
  const env = {
    ...process.env,
    HOME: homeDir,
    JARVIS_ENGINE: 'mock',
    JARVIS_OZONE_PLATFORM: process.platform === 'linux' ? 'x11' : process.env.JARVIS_OZONE_PLATFORM,
    JARVIS_DESKTOP_E2E: '1',
    JARVIS_DESKTOP_E2E_CONFIG: JSON.stringify(desktopE2EConfig)
  }
  delete env.ELECTRON_RUN_AS_NODE

  const electronApp = await electron.launch({
    executablePath: electronBinary,
    args: [desktopMain],
    cwd: resolve(repoRoot, 'packages/desktop'),
    env
  })

  try {
    const page = await electronApp.firstWindow()

    await expect(page.getByTestId('onboarding-overlay')).toBeVisible()
    await expect(page.getByText('Choose extra Ollama models')).toBeVisible()
    await expect(page.locator('[data-model-id="qwen2.5:3b"]')).toHaveCount(0)

    const search = page.getByTestId('onboarding-model-search')
    await search.fill('mistral')

    const mistralCard = page.locator('[data-model-id="mistral:latest"]')
    await expect(mistralCard).toBeVisible()
    await mistralCard.getByTestId('onboarding-model-toggle').check()
    await expect(page.getByTestId('onboarding-install-selected')).toContainText('Install 1 + continue')

    await page.screenshot({ path: screenshotPath })

    await page.getByTestId('onboarding-install-selected').click()
    await expect(page.getByTestId('onboarding-overlay')).toHaveCount(0)

    const onboardingStatePath = join(homeDir, '.jarvis', 'desktop-onboarding.json')
    await expect.poll(() => existsSync(onboardingStatePath)).toBe(true)
    const onboardingState = JSON.parse(readFileSync(onboardingStatePath, 'utf8')) as {
      complete: boolean
      selectedExtraModels: string[]
    }

    expect(onboardingState.complete).toBe(true)
    expect(onboardingState.selectedExtraModels).toContain('mistral:latest')

    await page.getByTestId('open-model-hub').click()
    await expect(page.getByTestId('onboarding-overlay')).toBeVisible()
    await expect(page.locator('[data-model-id="mistral:latest"]')).toContainText('Installed')
  } finally {
    await electronApp.close()
  }
})
