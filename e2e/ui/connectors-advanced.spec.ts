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

  test('arrowhead style picker shows in property panel for connectors', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    const startPicker = page.locator('.property-panel [data-testid="arrowhead-start"]')
    const endPicker = page.locator('.property-panel [data-testid="arrowhead-end"]')
    await expect(startPicker).toBeVisible()
    await expect(endPicker).toBeVisible()
  })

  test('arrowhead style options include triangle, open, diamond, circle, none', async ({ page }) => {
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

  test('changing end arrowhead to diamond renders diamond marker', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-end"]').selectOption('diamond')

    const connector = canvas.connectorPaths.first()
    const markerEnd = await connector.getAttribute('marker-end')
    expect(markerEnd).toContain('diamond')
  })

  test('setting start arrowhead to triangle adds marker-start', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-start"]').selectOption('triangle')

    const connector = canvas.connectorPaths.first()
    const markerStart = await connector.getAttribute('marker-start')
    expect(markerStart).toBeTruthy()
  })

  test('setting arrowhead to none removes marker', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().click()

    await page.locator('.property-panel [data-testid="arrowhead-end"]').selectOption('none')

    const connector = canvas.connectorPaths.first()
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

  test('double-clicking connector opens label editor', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()

    const labelInput = page.locator('.connector-label-editor')
    await expect(labelInput).toBeVisible()
  })

  test('typing in label editor adds text to connector', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.connectors.first().dblclick()

    await page.keyboard.type('connects to')
    await page.keyboard.press('Escape')

    const label = page.locator('.connector-label')
    await expect(label).toContainText('connects to')
  })

  test('connector label is positioned at connector midpoint', async ({ page }) => {
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

  test('connector label follows when shape is moved', async ({ page }) => {
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

  test('connector label can be edited via property panel', async ({ page }) => {
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

  test('connector routes center-to-center and exits at shape edge', async ({ page }) => {
    await canvas.selectTool('arrow')
    // Connect first shape to second shape
    await page.mouse.move(160, 240)
    await page.mouse.down()
    await page.mouse.move(460, 240, { steps: 5 })
    await page.mouse.up()

    // The connector start point should be at the right edge of the first shape
    // (center-to-center routing: exits from edge toward other shape's center)
    const path = await canvas.connectors.first().getAttribute('d')
    const match = path!.match(/^M ([\d.]+) ([\d.]+)/)
    const startX = Number(match![1])
    const startY = Number(match![2])
    // Right edge of first shape (x=100+120=220), center Y (y=200+40=240)
    expect(Math.abs(startX - 220)).toBeLessThan(5)
    expect(Math.abs(startY - 240)).toBeLessThan(5)
  })

  test('connection highlight appears on shape hover', async ({ page }) => {
    await canvas.selectTool('arrow')
    await page.mouse.move(160, 240) // hover over first shape

    // Single connection highlight (border around shape) instead of individual dots
    await expect(page.locator('.connection-highlight')).toHaveCount(1)
  })
})
