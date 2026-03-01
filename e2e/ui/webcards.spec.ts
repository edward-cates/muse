import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Helper: inject a web card via the Yjs doc exposed by TestRoot */
async function createWebCard(
  page: Page,
  opts: { id: string; x: number; y: number; title: string; url: string; snippet: string },
) {
  await page.evaluate((o) => {
    const doc = (window as any).__testDoc
    const Y = (window as any).__testY
    if (!doc || !Y) throw new Error('__testDoc or __testY not found')
    const elements = doc.getArray('elements')
    const yEl = new Y.Map()
    yEl.set('id', o.id)
    yEl.set('type', 'webcard')
    yEl.set('x', o.x)
    yEl.set('y', o.y)
    yEl.set('width', 280)
    yEl.set('height', 160)
    yEl.set('url', o.url)
    yEl.set('title', o.title)
    yEl.set('snippet', o.snippet)
    yEl.set('faviconUrl', '')
    yEl.set('content', '')
    yEl.set('sourceType', 'manual')
    elements.push([yEl])
  }, opts)
}

test.describe('WebCard elements', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('WebCard renders with title and URL visible', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-1', x: 200, y: 200,
      title: 'Example Site', url: 'https://example.com',
      snippet: 'An example website for testing',
    })

    const card = canvas.webCardElements.first()
    await expect(card).toBeVisible()
    await expect(card.locator('.webcard__title')).toContainText('Example Site')
    await expect(card.locator('.webcard__url')).toContainText('https://example.com')
  })

  test('WebCard is selectable', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-2', x: 200, y: 200,
      title: 'Selectable Card', url: 'https://example.com',
      snippet: 'Test snippet',
    })

    const card = canvas.webCardElements.first()
    const box = await card.boundingBox()
    // Click via mouse coordinates to avoid pointer interception
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)
  })

  test('WebCard is draggable', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-3', x: 200, y: 200,
      title: 'Draggable Card', url: 'https://example.com',
      snippet: 'Test snippet',
    })

    const card = canvas.webCardElements.first()
    const startBox = await card.boundingBox()
    const cx = startBox!.x + startBox!.width / 2
    const cy = startBox!.y + startBox!.height / 2

    // Drag the card 100px right, 100px down
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 100, cy + 100, { steps: 5 })
    await page.mouse.up()

    const endBox = await card.boundingBox()
    expect(endBox!.x).toBeGreaterThan(startBox!.x + 50)
    expect(endBox!.y).toBeGreaterThan(startBox!.y + 50)
  })

  test('WebCard is resizable via handles', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-4', x: 200, y: 200,
      title: 'Resizable Card', url: 'https://example.com',
      snippet: 'Test snippet',
    })

    // Select the card first via mouse
    const card = canvas.webCardElements.first()
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)

    const startBox = await card.boundingBox()

    // Drag the SE handle
    const handle = page.locator('[data-handle="se"]')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + 104, handleBox!.y + 54, { steps: 5 })
    await page.mouse.up()

    const endBox = await card.boundingBox()
    expect(endBox!.width).toBeGreaterThan(startBox!.width + 50)
    expect(endBox!.height).toBeGreaterThan(startBox!.height + 20)
  })

  test('WebCard URL is a clickable link with target=_blank', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-link', x: 200, y: 200,
      title: 'Link Card', url: 'https://example.com/article',
      snippet: 'Test snippet',
    })

    const card = canvas.webCardElements.first()
    const link = card.locator('.webcard__url')
    await expect(link).toHaveAttribute('href', 'https://example.com/article')
    await expect(link).toHaveAttribute('target', '_blank')
  })

  test('WebCard shows snippet text', async ({ page }) => {
    await createWebCard(page, {
      id: 'wc-5', x: 200, y: 200,
      title: 'Snippet Card', url: 'https://example.com',
      snippet: 'This is a detailed description of the web resource',
    })

    const card = canvas.webCardElements.first()
    await expect(card.locator('.webcard__snippet')).toContainText('detailed description')
  })
})
