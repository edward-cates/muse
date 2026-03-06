import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Helper: inject a document card via the Yjs doc exposed by TestRoot */
async function createDocumentCard(
  page: Page,
  opts: { id: string; x: number; y: number; title: string; documentId: string; documentType: string; contentVersion?: number },
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
    yEl.set('width', 280)
    yEl.set('height', 200)
    yEl.set('documentId', o.documentId)
    yEl.set('documentType', o.documentType)
    yEl.set('title', o.title)
    yEl.set('contentVersion', o.contentVersion ?? 0)
    yEl.set('opacity', 100)
    elements.push([yEl])
  }, opts)
}

test.describe('Research Nodes', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('renders research document card with title', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-1', x: 100, y: 100,
      title: 'Q1 Strategy Doc',
      documentId: 'doc-research-1',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Q1 Strategy Doc')
  })

  test('research document card shows Research type label', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-2', x: 100, y: 100,
      title: 'Market Research',
      documentId: 'doc-research-2',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__type')).toContainText('Research')
  })

  test('research document card has research CSS modifier class', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-3', x: 100, y: 100,
      title: 'Competitor Analysis',
      documentId: 'doc-research-3',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveClass(/document-card--research/)
  })

  test('can select research document card', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-4', x: 200, y: 200,
      title: 'Competitor Analysis',
      documentId: 'doc-research-4',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)
  })

  test('can drag research document card', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-5', x: 200, y: 200,
      title: 'Draggable Research',
      documentId: 'doc-research-5',
      documentType: 'research',
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
    await createDocumentCard(page, {
      id: 'research-6', x: 200, y: 200,
      title: 'Resizable Research',
      documentId: 'doc-research-6',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)

    const handles = card.locator('.resize-handle')
    await expect(handles).toHaveCount(8)
  })

  test('document card shows hint text', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'research-7', x: 100, y: 100,
      title: 'Hint Test',
      documentId: 'doc-research-7',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__hint')).toContainText('Double-click to open')
  })

  test('canvas document card shows Canvas type label', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'canvas-1', x: 100, y: 100,
      title: 'Sub Canvas',
      documentId: 'doc-canvas-1',
      documentType: 'canvas',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__type')).toContainText('Canvas')
  })

  test('untitled document card shows Untitled', async ({ page }) => {
    await createDocumentCard(page, {
      id: 'untitled-1', x: 100, y: 100,
      title: '',
      documentId: 'doc-untitled-1',
      documentType: 'research',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__title')).toContainText('Untitled')
  })

  test('multiple document cards coexist with shapes', async ({ page }) => {
    // Create a regular shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 120, 80)

    // Create two document cards of different types
    await createDocumentCard(page, {
      id: 'multi-1', x: 300, y: 100,
      title: 'Research Doc',
      documentId: 'doc-multi-1',
      documentType: 'research',
    })
    await createDocumentCard(page, {
      id: 'multi-2', x: 300, y: 350,
      title: 'Canvas Doc',
      documentId: 'doc-multi-2',
      documentType: 'canvas',
    })

    await expect(page.locator('[data-testid="document-card"]')).toHaveCount(2)
    await expect(canvas.shapesOfType('rectangle')).toHaveCount(1)
  })
})
