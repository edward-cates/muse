import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Helper: inject a markdown document card via the Yjs doc exposed by TestRoot */
async function createMarkdownCard(
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
    yEl.set('documentType', 'markdown')
    yEl.set('title', o.title)
    yEl.set('contentVersion', o.contentVersion ?? 0)
    yEl.set('opacity', 100)
    elements.push([yEl])
  }, opts)
}

test.describe('Markdown Document Card', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('renders markdown document card with title', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-1', x: 100, y: 100,
      title: 'Project Notes',
      documentId: 'doc-md-1',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('Project Notes')
  })

  test('markdown card has markdown CSS modifier class', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-2', x: 100, y: 100,
      title: 'Design Spec',
      documentId: 'doc-md-2',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card).toHaveClass(/document-card--markdown/)
  })

  test('markdown card shows Markdown type label', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-3', x: 100, y: 100,
      title: 'Meeting Notes',
      documentId: 'doc-md-3',
    })

    const card = page.locator('[data-testid="document-card"]')
    await expect(card.locator('.document-card__type')).toContainText('Markdown')
  })

  test('markdown card does NOT show browser chrome dots', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-4', x: 100, y: 100,
      title: 'No Chrome',
      documentId: 'doc-md-4',
    })

    const card = page.locator('[data-testid="document-card"]')
    const chromeDots = card.locator('.document-card__chrome-dot')
    await expect(chromeDots).toHaveCount(0)
  })

  test('can select markdown card', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-5', x: 200, y: 200,
      title: 'Selectable Markdown',
      documentId: 'doc-md-5',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)
  })

  test('can drag markdown card', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-6', x: 200, y: 200,
      title: 'Draggable Markdown',
      documentId: 'doc-md-6',
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
    await createMarkdownCard(page, {
      id: 'md-7', x: 200, y: 200,
      title: 'Resizable Markdown',
      documentId: 'doc-md-7',
    })

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)

    const handles = card.locator('.resize-handle')
    await expect(handles).toHaveCount(8)
  })

  test('markdown and html_artifact cards can coexist', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-coexist', x: 100, y: 100,
      title: 'Markdown Card',
      documentId: 'doc-md-coexist',
    })

    await page.evaluate(() => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'html-coexist-2')
      yEl.set('type', 'document_card')
      yEl.set('x', 450)
      yEl.set('y', 100)
      yEl.set('width', 300)
      yEl.set('height', 220)
      yEl.set('documentId', 'doc-html-coexist-2')
      yEl.set('documentType', 'html_artifact')
      yEl.set('title', 'HTML Card')
      yEl.set('contentVersion', 0)
      yEl.set('opacity', 100)
      elements.push([yEl])
    })

    const cards = page.locator('[data-testid="document-card"]')
    await expect(cards).toHaveCount(2)

    // Only the html_artifact card should have chrome dots
    const allChromeDots = page.locator('.document-card__chrome-dot')
    await expect(allChromeDots).toHaveCount(3)

    // Only the markdown card should have the markdown class
    const mdCards = page.locator('.document-card--markdown')
    await expect(mdCards).toHaveCount(1)
  })

  test('markdown and canvas cards can coexist', async ({ page }) => {
    await createMarkdownCard(page, {
      id: 'md-canvas-coexist', x: 100, y: 100,
      title: 'Markdown Card',
      documentId: 'doc-md-canvas',
    })

    await page.evaluate(() => {
      const doc = window.__testDoc!
      const Y = window.__testY!
      const elements = doc.getArray('elements')
      const yEl = new Y.Map()
      yEl.set('id', 'canvas-coexist-2')
      yEl.set('type', 'document_card')
      yEl.set('x', 450)
      yEl.set('y', 100)
      yEl.set('width', 280)
      yEl.set('height', 200)
      yEl.set('documentId', 'doc-canvas-coexist-2')
      yEl.set('documentType', 'canvas')
      yEl.set('title', 'Canvas Card')
      yEl.set('contentVersion', 0)
      yEl.set('opacity', 100)
      elements.push([yEl])
    })

    const cards = page.locator('[data-testid="document-card"]')
    await expect(cards).toHaveCount(2)

    const mdCards = page.locator('.document-card--markdown')
    await expect(mdCards).toHaveCount(1)
    await expect(mdCards).toContainText('Markdown Card')
  })
})
