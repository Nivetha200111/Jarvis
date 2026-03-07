import { test, expect } from '@playwright/test'

test('marketing page renders downloads and freemium pricing', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /your machine\./i })).toBeVisible()
  await expect(page.getByRole('link', { name: /download recommended build|download for linux|download for windows|open releases/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /free to try\. paid when it saves real time\./i })).toBeVisible()
  await expect(page.getByRole('heading', { name: /pro beta/i })).toBeVisible()
  await expect(page.locator('#stripe-checkout')).toBeVisible()
  await expect(page.locator('#stripe-status')).toContainText(/stripe checkout is ready to wire|stripe checkout is live/i)
})
