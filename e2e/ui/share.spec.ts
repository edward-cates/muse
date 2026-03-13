import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Share button', () => {
  test('clicking share button opens share dialog', async ({ page }) => {
    const cp = new CanvasPage(page)
    await cp.goto()

    const shareBtn = page.locator('button[title="Share document"]')
    await expect(shareBtn).toBeVisible()
    await shareBtn.click()

    const dialog = page.locator('.share-dialog')
    await expect(dialog).toBeVisible()
  })

  test('share dialog can be closed', async ({ page }) => {
    const cp = new CanvasPage(page)
    await cp.goto()

    await page.locator('button[title="Share document"]').click()
    const dialog = page.locator('.share-dialog')
    await expect(dialog).toBeVisible()

    await page.locator('.share-dialog__close').click()
    await expect(dialog).not.toBeVisible()
  })

  test('share dialog renders share list with correct email field', async ({ page }) => {
    const cp = new CanvasPage(page)
    await cp.goto()

    // Mock the shares API to return data matching the real DB schema
    await page.route('**/api/documents/*/shares', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shares: [
            { id: 'share-1', shared_with_email: 'alice@example.com', created_at: '2025-01-01T00:00:00Z' },
            { id: 'share-2', shared_with_email: 'bob@example.com', created_at: '2025-01-02T00:00:00Z' },
          ],
        }),
      })
    })

    await page.locator('button[title="Share document"]').click()
    const dialog = page.locator('.share-dialog')
    await expect(dialog).toBeVisible()

    // Verify both emails render without crashing
    await expect(dialog.getByText('alice@example.com')).toBeVisible()
    await expect(dialog.getByText('bob@example.com')).toBeVisible()
  })
})
