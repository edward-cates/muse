import { test, expect, type Page } from '@playwright/test'

// Increase timeout — this test does multiple full page reloads through
// real Supabase + Express + Vite infrastructure.
test.setTimeout(60_000)

async function drawShape(page: Page, x: number, y: number, w: number, h: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + w, y + h, { steps: 10 })
  await page.mouse.up()
}

async function renameDrawing(page: Page, title: string) {
  // Wait for PATCH response so we know the rename was sent
  const patchDone = page.waitForResponse(
    (resp) =>
      resp.url().includes('/api/drawings/') &&
      resp.request().method() === 'PATCH',
  )
  await page.locator('.drawing-title__display').click()
  await page.locator('.drawing-title__input').fill(title)
  await page.locator('.drawing-title__input').press('Enter')
  const resp = await patchDone
  console.log(`[TEST] Rename to "${title}" → status ${resp.status()}`)
}

function getDrawingId(url: string): string {
  const match = url.match(/#\/d\/(.+)/)
  if (!match) throw new Error(`No drawing ID in URL: ${url}`)
  return match[1]
}

/**
 * Navigate to a drawing with a full page reload.
 * Going via about:blank ensures the browser does a fresh load,
 * which is exactly what we want for testing persistence.
 */
async function navigateToDrawing(page: Page, drawingId: string) {
  await page.goto('about:blank')
  await page.goto(`/#/d/${drawingId}`)
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
}

test('drawing titles and content persist across navigation', async ({ page }) => {
  // Log all API responses for debugging
  page.on('response', (resp) => {
    if (resp.url().includes('/api/')) {
      resp.text().then((body) => {
        console.log(`[API] ${resp.request().method()} ${resp.url()} → ${resp.status()} ${body.slice(0, 200)}`)
      }).catch(() => {})
    }
  })

  // ── Create Doc 1 ──
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
  const doc1Id = getDrawingId(page.url())
  console.log(`[TEST] Doc 1 ID: ${doc1Id}`)

  // Wait for registration POST to complete before renaming
  await page.waitForTimeout(1000)

  await renameDrawing(page, 'Doc 1')

  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 200, 150, 100)

  await page.locator('[data-testid="tool-ellipse"]').click()
  await drawShape(page, 450, 200, 120, 80)

  // Wait for persistence debounce (500ms) to flush to DB
  await page.waitForTimeout(800)

  // ── Create Doc 2 (full page reload → new drawing) ──
  await page.goto('about:blank')
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
  const doc2Id = getDrawingId(page.url())

  await page.waitForTimeout(1000)

  await renameDrawing(page, 'Doc 2')

  await page.locator('[data-testid="tool-diamond"]').click()
  await drawShape(page, 300, 300, 120, 120)

  // Wait for persistence debounce
  await page.waitForTimeout(800)

  // ── Navigate to Doc 1 — verify title + shapes survived ──
  await navigateToDrawing(page, doc1Id)

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)

  // ── Draw a third shape on Doc 1 ──
  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 400, 100, 80)

  // Wait for persistence
  await page.waitForTimeout(800)

  // ── Navigate to Doc 2 — verify title + shapes ──
  await navigateToDrawing(page, doc2Id)

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 2', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-diamond"]')).toHaveCount(1, { timeout: 10_000 })

  // ── Navigate back to Doc 1 — verify ALL shapes including the new one ──
  await navigateToDrawing(page, doc1Id)

  await expect(page.locator('.drawing-title__display')).toHaveText('Doc 1', { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-rectangle"]')).toHaveCount(2, { timeout: 10_000 })
  await expect(page.locator('[data-testid="shape-ellipse"]')).toHaveCount(1)
})

test('new drawing resets title to Untitled', async ({ page }) => {
  // Create a drawing and rename it
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(1000)

  await renameDrawing(page, 'Custom Title')

  // Draw something so the drawing isn't empty
  await page.locator('[data-testid="tool-rectangle"]').click()
  await drawShape(page, 200, 200, 150, 100)

  // Create a new drawing via full page reload
  await page.goto('about:blank')
  await page.goto('/')
  await page.locator('[data-testid="canvas"]').waitFor({ state: 'visible', timeout: 15_000 })

  // New drawing should show "Untitled", not the previous drawing's title
  await expect(page.locator('.drawing-title__display')).toHaveText('Untitled', { timeout: 10_000 })
})
