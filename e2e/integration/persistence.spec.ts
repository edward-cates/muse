import { test, expect, type Page } from '@playwright/test'

async function drawShape(page: Page, x: number, y: number, w: number, h: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + w, y + h, { steps: 10 })
  await page.mouse.up()
}

async function openDrawingsPanel(page: Page) {
  await page.locator('button[title="Drawings"]').click()
  // Wait for panel to animate in and content to load
  await page.waitForTimeout(300)
}

async function navigateToDrawing(page: Page, title: string) {
  await openDrawingsPanel(page)
  // Click the drawing in the list — scoped to the drawings container
  const container = page.locator('button[title="Drawings"]').locator('..')
  await container.getByText(title, { exact: true }).click()
  // Wait for Yjs to load state from DB
  await page.waitForTimeout(800)
}

test('drawing titles and content persist across navigation', async ({ page }) => {
  // ── Navigate to the app — auto-creates a new drawing ──
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

  // ── Doc 1: rename and draw shapes ──

  // Rename to "Doc 1"
  await page.locator('.drawing-title__display').click()
  await page.locator('.drawing-title__input').fill('Doc 1')
  await page.locator('.drawing-title__input').press('Enter')

  // Draw a rectangle
  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 200, 150, 100)

  // Draw an ellipse
  await page.locator('[data-testid="tool-ellipse"]').click()
  await drawShape(page, 450, 200, 120, 80)

  // Wait for persistence debounce to flush
  await page.waitForTimeout(800)

  // ── Create Doc 2 ──

  await openDrawingsPanel(page)
  await page.getByText('New').click()
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
  // Wait for registration to complete
  await page.waitForTimeout(500)

  // Rename to "Doc 2"
  await page.locator('.drawing-title__display').click()
  await page.locator('.drawing-title__input').fill('Doc 2')
  await page.locator('.drawing-title__input').press('Enter')

  // Draw a diamond
  await page.locator('[data-testid="tool-diamond"]').click()
  await drawShape(page, 300, 300, 120, 120)

  // Wait for persistence debounce
  await page.waitForTimeout(800)

  // ── Navigate back to Doc 1 — verify title + shapes survived ──

  await navigateToDrawing(page, 'Doc 1')

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1')
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(1, { timeout: 5000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)

  // ── Draw a third shape on Doc 1 ──

  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 400, 100, 80)

  // Wait for persistence
  await page.waitForTimeout(800)

  // ── Navigate to Doc 2 — verify title + shapes ──

  await navigateToDrawing(page, 'Doc 2')

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 2')
  await expect(page.locator('[data-testid="shape-diamond"]')).toHaveCount(1, { timeout: 5000 })

  // ── Navigate back to Doc 1 — verify ALL shapes including the new one ──

  await navigateToDrawing(page, 'Doc 1')

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1')
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(2, { timeout: 5000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
})
