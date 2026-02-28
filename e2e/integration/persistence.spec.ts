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

/** Extract drawing ID from the current URL hash. */
function getDrawingId(url: string): string {
  const match = url.match(/#\/d\/(.+)/)
  if (!match) throw new Error(`No drawing ID in URL: ${url}`)
  return match[1]
}

test('drawing titles and content persist across navigation', async ({ page }) => {
  // ── Create Doc 1 ──
  const firstReg = waitForRegistration(page)
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
  await firstReg
  const doc1Id = getDrawingId(page.url())

  await renameDrawing(page, 'Doc 1')

  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 200, 150, 100)

  await page.locator('[data-testid="tool-ellipse"]').click()
  await drawShape(page, 450, 200, 120, 80)

  // Wait for persistence debounce (500ms) to flush to DB
  await page.waitForTimeout(800)

  // ── Create Doc 2 (full page load → new drawing) ──
  const secondReg = waitForRegistration(page)
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })
  await secondReg
  const doc2Id = getDrawingId(page.url())

  await renameDrawing(page, 'Doc 2')

  await page.locator('[data-testid="tool-diamond"]').click()
  await drawShape(page, 300, 300, 120, 120)

  // Wait for persistence debounce
  await page.waitForTimeout(800)

  // ── Navigate to Doc 1 via URL — verify title + shapes ──
  await page.goto(`/#/d/${doc1Id}`)
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)

  // ── Draw a third shape on Doc 1 ──
  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 400, 100, 80)

  // Wait for persistence
  await page.waitForTimeout(800)

  // ── Navigate to Doc 2 — verify title + shapes ──
  await page.goto(`/#/d/${doc2Id}`)
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 2', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-diamond"]')).toHaveCount(1, { timeout: 10_000 })

  // ── Navigate back to Doc 1 — verify ALL shapes ──
  await page.goto(`/#/d/${doc1Id}`)
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible' })

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(2, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
})
