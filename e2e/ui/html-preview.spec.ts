import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Helper: inject an html_artifact document card via the Yjs doc exposed by TestRoot */
async function createHtmlArtifactCard(
  page: Page,
  opts: { id: string; x: number; y: number; title: string; documentId: string; contentVersion?: number },
) {
  await page.evaluate((o) => {
    const doc = window.__testDoc!
    const Y = window.__testY!
    const elements = doc.getArray('elements')
    const yEl = new Y.Map()
    yEl.set('id', o.id)
    yEl.set('type', 'document_card')
    yEl.set('x', o.x)
    yEl.set('y', o.y)
    yEl.set('width', 300)
    yEl.set('height', 220)
    yEl.set('documentId', o.documentId)
    yEl.set('documentType', 'html_artifact')
    yEl.set('title', o.title)
    yEl.set('contentVersion', o.contentVersion ?? 0)
    yEl.set('opacity', 100)
    elements.push([yEl])
  }, opts)
}

test.describe('HTML Wireframe Preview', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('renders html_artifact document card with title', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-1', x: 100, y: 100,
      title: 'Login Page Wireframe',
      documentId: 'doc-html-1',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Login Page Wireframe')
  })

  test('html_artifact card shows browser chrome dots', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-2', x: 100, y: 100,
      title: 'Dashboard Wireframe',
      documentId: 'doc-html-2',
    })

    const card = page.locator('[data-testid="document-card"]')
    const chromeDots = card.locator('.document-card__chrome-dot')
    await expect(chromeDots).toHaveCount(3)
  })

  test('html_artifact card has html CSS modifier class', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-3', x: 100, y: 100,
      title: 'Settings Page',
      documentId: 'doc-html-3',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveClass(/document-card--html/)
  })

  test('html_artifact card shows HTML Wireframe type label', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-4', x: 100, y: 100,
      title: 'Profile Page',
      documentId: 'doc-html-4',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__type')).toContainText('HTML Wireframe')
  })

  test('can select html_artifact card', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-5', x: 200, y: 200,
      title: 'Selectable Wireframe',
      documentId: 'doc-html-5',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)
  })

  test('can drag html_artifact card', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-6', x: 200, y: 200,
      title: 'Draggable Wireframe',
      documentId: 'doc-html-6',
    })

    const card = page.locator('[data-testid="document-card"]')
    const startBox = await card.boundingBox()
    const cx = startBox!.x + startBox!.width / 2
    const cy = startBox!.y + startBox!.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy + 60, { steps: 5 })
    await page.mouse.up()

    const endBox = await card.boundingBox()
    expect(endBox!.x).toBeGreaterThan(startBox!.x + 40)
    expect(endBox!.y).toBeGreaterThan(startBox!.y + 30)
  })

  test('shows resize handles when selected', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-7', x: 200, y: 200,
      title: 'Resizable Wireframe',
      documentId: 'doc-html-7',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)

    const handles = card.locator('.resize-handle')
    await expect(handles).toHaveCount(8)
  })

  test('canvas type card does NOT show browser chrome dots', async ({ page }) => {
    // Only html_artifact should get the chrome dots
    await page.evaluate(() => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'canvas-nodots')
      yEl.set('type', 'document_card')
      yEl.set('x', 100)
      yEl.set('y', 100)
      yEl.set('width', 280)
      yEl.set('height', 200)
      yEl.set('documentId', 'doc-canvas-nodots')
      yEl.set('documentType', 'canvas')
      yEl.set('title', 'Plain Canvas')
      yEl.set('contentVersion', 0)
      yEl.set('opacity', 100)
      elements.push([yEl])
    })

    const card = page.locator('[data-testid="document-card"]')
    const chromeDots = card.locator('.document-card__chrome-dot')
    await expect(chromeDots).toHaveCount(0)
  })

  test('html_artifact and canvas cards can coexist', async ({ page }) => {
    await createHtmlArtifactCard(page, {
      id: 'html-coexist', x: 100, y: 100,
      title: 'HTML Card',
      documentId: 'doc-html-coexist',
    })

    await page.evaluate(() => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'canvas-coexist')
      yEl.set('type', 'document_card')
      yEl.set('x', 450)
      yEl.set('y', 100)
      yEl.set('width', 280)
      yEl.set('height', 200)
      yEl.set('documentId', 'doc-canvas-coexist')
      yEl.set('documentType', 'canvas')
      yEl.set('title', 'Canvas Card')
      yEl.set('contentVersion', 0)
      yEl.set('opacity', 100)
      elements.push([yEl])
    })

    const cards = page.locator('[data-testid="document-card"]')
    await expect(cards).toHaveCount(2)

    // Only the html_artifact card should have chrome dots
    const allChromeDots = page.locator('.document-card__chrome-dot')
    await expect(allChromeDots).toHaveCount(3) // 3 dots from the single html_artifact card
  })
})
