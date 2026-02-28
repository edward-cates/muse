import { test, expect, type Page } from '@playwright/test'

async function drawShape(page: Page, x: number, y: number, w: number, h: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + w, y + h, { steps: 10 })
  await page.mouse.up()
}

/** Wait for a POST /api/drawings registration to complete. */
function waitForRegistration(page: Page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/drawings') &&
      !resp.url().includes('/api/drawings/') &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  )
}

/** Wait for a PATCH /api/drawings/:id rename to complete. */
function waitForRename(page: Page) {
  return page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/drawings/') &&
      resp.request().method() === 'PATCH' &&
      resp.status() === 200,
  )
}

async function renameDrawing(page: Page, title: string) {
  const patchDone = waitForRename(page)
  await page.locator('.drawing-title__display').click()
  await page.locator('.drawing-title__input').fill(title)
  await page.locator('.drawing-title__input').press('Enter')
  await patchDone
}

async function navigateToDrawing(page: Page, title: string) {
  await page.locator('button[title="Drawings"]').click()
  const container = page.locator('button[title="Drawings"]').locator('..')
  await container.getByText(title, { exact: true }).click()
  // Wait for title component to reflect the navigation
  await expect(page.locator('.drawing-title__display')).toHaveText(title, { timeout: 10_000 })
}

test('drawing titles and content persist across navigation', async ({ page }) => {
  // ── Navigate to the app — auto-creates a new drawing ──
  const firstReg = waitForRegistration(page)
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
  await firstReg

  // ── Doc 1: rename and draw shapes ──

  await renameDrawing(page, 'Doc 1')

  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 200, 150, 100)

  await page.locator('[data-testid="tool-ellipse"]').click()
  await drawShape(page, 450, 200, 120, 80)

  // Wait for persistence debounce (500ms) to flush
  await page.waitForTimeout(800)

  // ── Create Doc 2 ──

  const secondReg = waitForRegistration(page)
  await page.locator('button[title="Drawings"]').click()
  await page.getByText('New').click()
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
  await secondReg

  await renameDrawing(page, 'Doc 2')

  await page.locator('[data-testid="tool-diamond"]').click()
  await drawShape(page, 300, 300, 120, 120)

  // Wait for persistence debounce
  await page.waitForTimeout(800)

  // ── Navigate back to Doc 1 — verify title + shapes survived ──

  await navigateToDrawing(page, 'Doc 1')

  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)

  // ── Draw a third shape on Doc 1 ──

  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 400, 100, 80)

  // Wait for persistence
  await page.waitForTimeout(800)

  // ── Navigate to Doc 2 — verify title + shapes ──

  await navigateToDrawing(page, 'Doc 2')

  await expect(page.locator('[data-testid="shape-diamond"]')).toHaveCount(1, { timeout: 10_000 })

  // ── Navigate back to Doc 1 — verify ALL shapes including the new one ──

  await navigateToDrawing(page, 'Doc 1')

  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(2, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
})
