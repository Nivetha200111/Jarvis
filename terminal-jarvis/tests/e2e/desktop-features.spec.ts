import { test, expect } from '@playwright/test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createDesktopE2EConfig, launchDesktopE2E, repoRoot } from './desktop-test-utils.js'

test.setTimeout(180_000)

test('desktop main flows work across chat, queueing, vault, calendar, live screen, save, and audit', async () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'jarvis-desktop-flows-'))
  const vaultDir = mkdtempSync(join(tmpdir(), 'jarvis-vault-'))
  const today = new Date().toISOString().slice(0, 10)
  const vaultName = basename(vaultDir)

  writeFileSync(
    join(vaultDir, 'Tier ZERO.md'),
    '# Tier ZERO\n\nThe story ends when Ava opens the gate and steps into the light.\n',
    'utf8'
  )
  writeFileSync(
    join(vaultDir, 'Planning.md'),
    '# Planning\n\nRemember the design review and sprint planning overlap risk.\n',
    'utf8'
  )

  const electronApp = await launchDesktopE2E({
    homeDir,
    config: createDesktopE2EConfig({
      dialogSelections: {
        folderPaths: [vaultDir],
        filePaths: []
      },
      googleCalendarImport: {
        imported: 3,
        total: 3
      },
      screenCapture: {
        width: 1280,
        height: 720,
        timestamp: '2026-03-07T09:00:00.000Z',
        activeWindow: 'Obsidian - Tier ZERO',
        path: resolve(repoRoot, 'test-results/e2e-screen.png'),
        imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5L2s8AAAAASUVORK5CYII=',
        ocrText: 'Tier ZERO slide. The story ends when Ava opens the gate and steps into the light.'
      }
    }),
    extraEnv: {
      JARVIS_MOCK_STREAM_DELAY_MS: '30'
    }
  })

  try {
    const page = await electronApp.firstWindow()
    const clickSend = async (): Promise<void> => {
      await page.getByTestId('send-button').click({ noWaitAfter: true })
    }

    await expect(page.getByTestId('onboarding-overlay')).toBeVisible()
    await page.getByTestId('onboarding-continue').click()
    await expect(page.getByTestId('chat-input')).toBeVisible()

    await page.getByTestId('vault-toggle').click()
    await expect(page.getByTestId('vault-toggle')).toContainText(vaultName)
    await expect(page.getByText(/2 notes/)).toBeVisible({ timeout: 15_000 })

    await page.getByTestId('chat-input').fill('where does the story end')
    await clickSend()
    await expect(page.getByText(/Context matched|Context ready from broad vault scan|Semantic context ready/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-entry-type="assistant"]').last()).toContainText('where does the story end', { timeout: 20_000 })

    await page.getByTestId('calendar-add').click()
    await expect(page.getByTestId('calendar-modal')).toBeVisible()
    await page.getByTestId('calendar-title-input').fill('Design review')
    await page.getByTestId('calendar-start-input').fill('2026-03-08T10:00')
    await page.getByTestId('calendar-end-input').fill('2026-03-08T11:00')
    await page.getByTestId('calendar-submit').click()
    await expect(page.getByText(/Local event added: Design review/i)).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('calendar-google-sync').click()
    await expect(page.getByText(/Google calendar synced: 3\/3 events imported\./)).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('pin-toggle').click()
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false
    )).toBe(true)

    const longPrompt = Array.from({ length: 160 }, (_, index) => `token${index}`).join(' ')
    await page.getByTestId('chat-input').fill(longPrompt)
    await clickSend()
    await page.getByTestId('chat-input').fill('second queued prompt')
    await clickSend()
    await expect(page.locator('[data-entry-type="user"]').last()).toContainText('second queued prompt', { timeout: 40_000 })
    await expect(page.locator('[data-entry-type="assistant"]').last()).toContainText('second queued prompt', { timeout: 45_000 })

    await page.getByTestId('screen-capture').click()
    await expect(page.getByText(/Screen captured: 1280x720/)).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('pip-toggle').click()
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false
    )).toBe(true)
    await page.getByTestId('pip-toggle').click()
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false
    )).toBe(true)

    await page.getByTestId('live-screen-toggle').click()
    await expect(page.getByTestId('model-select')).toHaveValue('qwen2.5:3b', { timeout: 10_000 })
    await expect(page.getByText(/Live screen enabled/)).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('chat-input').fill('what is on the screen')
    await clickSend()
    await expect(page.getByText(/Live screen context ready/)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-entry-type="assistant"]').last()).toContainText('what is on the screen', { timeout: 20_000 })

    await page.getByTestId('mode-agent').click()
    await page.getByTestId('chat-input').fill('hello from agent mode')
    await clickSend()
    await expect(page.getByText(/Agent tools are unavailable in the current runtime/)).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-entry-type="assistant"]').last()).toContainText('hello from agent mode', { timeout: 20_000 })

    await expect(page.getByTestId('save-reply')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('save-reply').click()

    const savedReplyPath = join(vaultDir, 'Jarvis', `${today}.md`)
    await expect.poll(() => existsSync(savedReplyPath)).toBe(true)
    expect(readFileSync(savedReplyPath, 'utf8')).toContain('hello from agent mode')

    await page.getByTestId('audit-show').click()
    await expect(page.locator('.cv-content--thinking').filter({ hasText: /^Audit / }).first()).toBeVisible({ timeout: 10_000 })

    await page.getByTestId('pin-toggle').click()
    await expect.poll(async () => electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false
    )).toBe(false)
  } finally {
    await electronApp.close()
  }
})
