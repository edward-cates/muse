import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Decomposition Cards', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('renders decomposition card created via Yjs', async ({ page }) => {
    // Create a decomposition card programmatically
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-1')
      el.set('type', 'decomposition_card')
      el.set('x', 100)
      el.set('y', 100)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'AI Opportunities')
      el.set('summary', 'Three areas identified for AI integration.')
      el.set('lineRanges', [55, 89, 102, 118])
      el.set('color', '#3b82f6')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const card = page.locator('[data-testid="decomposition-card"]')
    await expect(card).toHaveCount(1)
    await expect(card).toContainText('AI Opportunities')
    await expect(card).toContainText('Three areas identified')
  })

  test('shows line reference pills', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-2')
      el.set('type', 'decomposition_card')
      el.set('x', 100)
      el.set('y', 100)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Business Objectives')
      el.set('summary', 'Expand into 3 new verticals.')
      el.set('lineRanges', [12, 34, 45, 52])
      el.set('color', '#f59e0b')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const refs = page.locator('[data-testid="source-ref"]')
    await expect(refs).toHaveCount(2)
    await expect(refs.nth(0)).toContainText('lines 12-34')
    await expect(refs.nth(1)).toContainText('lines 45-52')
  })

  test('can select decomposition card', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-3')
      el.set('type', 'decomposition_card')
      el.set('x', 200)
      el.set('y', 200)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Data State')
      el.set('summary', 'Current infrastructure review.')
      el.set('lineRanges', [100, 120])
      el.set('color', '#22c55e')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const card = page.locator('[data-testid="decomposition-card"]')
    const box = await card.boundingBox()
    // Click via mouse coordinates to avoid pointer interception issues
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)
  })

  test('shows resize handles when selected', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-4')
      el.set('type', 'decomposition_card')
      el.set('x', 200)
      el.set('y', 200)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Team')
      el.set('summary', 'Hiring plan.')
      el.set('lineRanges', [160, 195])
      el.set('color', '#a855f7')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const card = page.locator('[data-testid="decomposition-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    const handles = card.locator('.resize-handle')
    await expect(handles).toHaveCount(8)
  })

  test('decomposition card is draggable', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-5')
      el.set('type', 'decomposition_card')
      el.set('x', 200)
      el.set('y', 200)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Drag Test')
      el.set('summary', 'Should be draggable.')
      el.set('lineRanges', [1, 10])
      el.set('color', '#ef4444')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const card = page.locator('[data-testid="decomposition-card"]')
    const startBox = await card.boundingBox()
    const cx = startBox!.x + startBox!.width / 2
    const cy = startBox!.y + startBox!.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 100, cy + 100, { steps: 5 })
    await page.mouse.up()

    const endBox = await card.boundingBox()
    expect(endBox!.x).toBeGreaterThan(startBox!.x + 50)
    expect(endBox!.y).toBeGreaterThan(startBox!.y + 50)
  })

  test('decomposition card is resizable via SE handle', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-6')
      el.set('type', 'decomposition_card')
      el.set('x', 200)
      el.set('y', 200)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Resize Test')
      el.set('summary', 'Should be resizable.')
      el.set('lineRanges', [1, 10])
      el.set('color', '#10b981')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    // Select the card first
    const card = page.locator('[data-testid="decomposition-card"]')
    const box = await card.boundingBox()
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(card).toHaveClass(/shape--selected/)

    const startBox = await card.boundingBox()

    // Drag the SE handle
    const handle = card.locator('[data-handle="se"]')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + 104, handleBox!.y + 54, { steps: 5 })
    await page.mouse.up()

    const endBox = await card.boundingBox()
    expect(endBox!.width).toBeGreaterThan(startBox!.width + 50)
    expect(endBox!.height).toBeGreaterThan(startBox!.height + 20)
  })

  test('multiple decomposition cards can coexist with shapes', async ({ page }) => {
    // Create a regular shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 120, 80)

    // Create a decomposition card
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-7')
      el.set('type', 'decomposition_card')
      el.set('x', 300)
      el.set('y', 100)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Risk Factors')
      el.set('summary', 'Key risks identified.')
      el.set('lineRanges', [200, 231])
      el.set('color', '#ef4444')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    await expect(canvas.shapes).toHaveCount(2) // rectangle + decomposition card (both have .shape class)
    await expect(page.locator('[data-testid="decomposition-card"]')).toHaveCount(1)
    await expect(canvas.shapesOfType('rectangle')).toHaveCount(1)
  })

  test('shows colored dot matching the color property', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-8')
      el.set('type', 'decomposition_card')
      el.set('x', 100)
      el.set('y', 100)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'Colored Dot')
      el.set('summary', 'Dot should match color.')
      el.set('lineRanges', [1, 5])
      el.set('color', '#ef4444')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const dot = page.locator('.decomposition-card__dot')
    await expect(dot).toHaveCount(1)
    await expect(dot).toHaveCSS('background-color', 'rgb(239, 68, 68)') // #ef4444
  })

  test('card with no line ranges shows no source refs', async ({ page }) => {
    await page.evaluate(() => {
      const Y = window.__testY!
      const doc = window.__testDoc!
      const elements = doc.getArray('elements')
      const el = new Y.Map()
      el.set('id', 'dc-9')
      el.set('type', 'decomposition_card')
      el.set('x', 100)
      el.set('y', 100)
      el.set('width', 260)
      el.set('height', 180)
      el.set('topic', 'No Refs')
      el.set('summary', 'No source references.')
      el.set('lineRanges', [])
      el.set('color', '#64748b')
      el.set('documentId', 'research-doc-1')
      el.set('expanded', 0)
      el.set('opacity', 100)
      elements.push([el])
    })

    const refs = page.locator('[data-testid="source-ref"]')
    await expect(refs).toHaveCount(0)
  })
})
