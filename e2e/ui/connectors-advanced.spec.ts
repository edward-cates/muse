import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Arrowhead styles', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes connected by an arrow
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('arrow')
    await page.mouse.move(180, 230)
    await page.mouse.down()
    await page.mouse.move(300, 230, { steps: 5 })
    await page.mouse.up()
  })

  test.fixme('arrowhead style picker shows in property panel for connectors', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const startPicker = page.locator('.property-panel [data-testid="arrowhead-start"]')
    const endPicker = page.locator('.property-panel [data-testid="arrowhead-end"]')
    await expect(startPicker).toBeVisible()
    await expect(endPicker).toBeVisible()
  })

  test.fixme('arrowhead style options include triangle, open, diamond, circle, none', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const options = page.locator('.property-panel [data-testid="arrowhead-end"] option')
    const values = await options.allTextContents()
    expect(values).toContain('Triangle')
    expect(values).toContain('Open')
    expect(values).toContain('Diamond')
    expect(values).toContain('Circle')
    expect(values).toContain('None')
  })

  test.fixme('changing end arrowhead to diamond renders diamond marker', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-end"]').selectOption('diamond')

    const connector = canvas.connectors.first()
    const markerEnd = await connector.getAttribute('marker-end')
    expect(markerEnd).toContain('diamond')
  })

  test.fixme('setting start arrowhead to triangle adds marker-start', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-start"]').selectOption('triangle')

    const connector = canvas.connectors.first()
    const markerStart = await connector.getAttribute('marker-start')
    expect(markerStart).toBeTruthy()
  })

  test.fixme('setting arrowhead to none removes marker', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-end"]').selectOption('none')

    const connector = canvas.connectors.first()
    const markerEnd = await connector.getAttribute('marker-end')
    expect(!markerEnd || markerEnd === '' || markerEnd === 'none').toBeTruthy()
  })
})

test.describe('Connector labels', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('line')
    await page.mouse.move(180, 230)
    await page.mouse.down()
    await page.mouse.move(300, 230, { steps: 5 })
    await page.mouse.up()
  })

  test.fixme('double-clicking connector opens label editor', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()

    const labelInput = page.locator('.connector-label-editor')
    await expect(labelInput).toBeVisible()
  })

  test.fixme('typing in label editor adds text to connector', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()

    await page.keyboard.type('connects to')
    await page.keyboard.press('Escape')

    const label = page.locator('.connector-label')
    await expect(label).toContainText('connects to')
  })

  test.fixme('connector label is positioned at connector midpoint', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()
    await page.keyboard.type('mid')
    await page.keyboard.press('Escape')

    const label = page.locator('.connector-label')
    const labelBox = await label.boundingBox()
    const connectorBox = await canvas.connectors.first().boundingBox()

    // Label should be roughly centered on the connector
    const connectorMidX = connectorBox!.x + connectorBox!.width / 2
    expect(labelBox!.x + labelBox!.width / 2).toBeCloseTo(connectorMidX, -1)
  })

  test.fixme('connector label follows when shape is moved', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()
    await page.keyboard.type('label')
    await page.keyboard.press('Escape')

    const labelBefore = await page.locator('.connector-label').boundingBox()

    // Move first shape
    await canvas.shapes.first().click()
    await page.mouse.move(140, 230)
    await page.mouse.down()
    await page.mouse.move(140, 130, { steps: 5 })
    await page.mouse.up()

    const labelAfter = await page.locator('.connector-label').boundingBox()
    expect(labelAfter!.y).not.toEqual(labelBefore!.y)
  })

  test.fixme('connector label can be edited via property panel', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const labelInput = page.locator('.property-panel input[data-testid="connector-label"]')
    await labelInput.fill('via property')
    await labelInput.press('Enter')

    const label = page.locator('.connector-label')
    await expect(label).toContainText('via property')
  })
})

test.describe('Waypoints', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 80, 60)
    await canvas.selectTool('line')
    await page.mouse.move(180, 230)
    await page.mouse.down()
    await page.mouse.move(400, 230, { steps: 5 })
    await page.mouse.up()
  })

  test.fixme('double-clicking connector path adds a waypoint', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    // Double-click on the connector's midpoint
    const box = await canvas.connectors.first().boundingBox()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)

    // Should see waypoint handles
    await expect(page.locator('.waypoint-handle')).toHaveCount(1)
  })

  test.fixme('dragging a waypoint changes connector path', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const box = await canvas.connectors.first().boundingBox()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)

    const pathBefore = await canvas.connectors.first().getAttribute('d')

    // Drag waypoint
    const wpHandle = page.locator('.waypoint-handle').first()
    await wpHandle.hover()
    await page.mouse.down()
    await page.mouse.move(box!.x + box!.width / 2, box!.y - 50, { steps: 5 })
    await page.mouse.up()

    const pathAfter = await canvas.connectors.first().getAttribute('d')
    expect(pathAfter).not.toEqual(pathBefore)
  })

  test.fixme('multiple waypoints can be added to a connector', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const box = await canvas.connectors.first().boundingBox()
    // Add first waypoint
    await page.mouse.dblclick(box!.x + box!.width * 0.33, box!.y + box!.height / 2)
    // Add second waypoint
    await page.mouse.dblclick(box!.x + box!.width * 0.66, box!.y + box!.height / 2)

    await expect(page.locator('.waypoint-handle')).toHaveCount(2)
  })

  test.fixme('deleting a waypoint removes it from the path', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const box = await canvas.connectors.first().boundingBox()
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2)
    await expect(page.locator('.waypoint-handle')).toHaveCount(1)

    // Right-click waypoint to delete (or use some other mechanism)
    await page.locator('.waypoint-handle').first().click()
    await page.keyboard.press('Delete')

    await expect(page.locator('.waypoint-handle')).toHaveCount(0)
  })
})

test.describe('Arbitrary anchor points', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)
  })

  test.fixme('connector attaches at cursor position on shape edge, not just midpoint', async ({ page }) => {
    await canvas.selectTool('arrow')
    // Start from near the top-right area of first shape (not at midpoint)
    await page.mouse.move(190, 210)
    await page.mouse.down()
    await page.mouse.move(410, 250, { steps: 5 })
    await page.mouse.up()

    // The connector start point should be near where we clicked, not snapped to midpoint
    const path = await canvas.connectors.first().getAttribute('d')
    const match = path!.match(/^M ([\d.]+) ([\d.]+)/)
    const startY = Number(match![2])
    // Should be near 210, not 240 (the right midpoint Y)
    expect(Math.abs(startY - 210)).toBeLessThan(20)
  })

  test.fixme('connector snaps to midpoint when cursor is within threshold', async ({ page }) => {
    await canvas.selectTool('arrow')
    // Start from very close to the right midpoint
    await page.mouse.move(219, 241) // right midpoint is at x=220, y=240
    await page.mouse.down()
    await page.mouse.move(400, 240, { steps: 5 })
    await page.mouse.up()

    const path = await canvas.connectors.first().getAttribute('d')
    const match = path!.match(/^M ([\d.]+) ([\d.]+)/)
    const startY = Number(match![2])
    // Should snap to midpoint at y=240
    expect(startY).toBeCloseTo(240, 0)
  })

  test.fixme('connection dots appear along full shape perimeter on hover', async ({ page }) => {
    await canvas.selectTool('arrow')
    await page.mouse.move(160, 240) // hover over first shape

    const dots = page.locator('.connection-dot')
    // Should show more than 4 dots (arbitrary points, not just midpoints)
    const count = await dots.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })
})
