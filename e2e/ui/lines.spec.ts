import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Line connections', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes to connect
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)
  })

  test('line tool connects two shapes', async ({ page }) => {
    await canvas.selectTool('line')

    // Get positions of the two shapes
    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('Shapes have no bounding boxes')

    // Drag from center of first shape to center of second shape
    const x1 = box1.x + box1.width / 2
    const y1 = box1.y + box1.height / 2
    const x2 = box2.x + box2.width / 2
    const y2 = box2.y + box2.height / 2

    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(x2, y2, { steps: 10 })
    await page.mouse.up()

    // A connector path should be rendered in the lines SVG layer
    await expect(canvas.connectors).toHaveCount(1)
  })

  test('line tool shows connection dots on shape hover', async ({ page }) => {
    await canvas.selectTool('line')

    // Hover over first shape
    const shape1 = canvas.shapes.first()
    const box1 = await shape1.boundingBox()
    if (!box1) throw new Error('Shape has no bounding box')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)

    // Connection dots should appear (4 anchors: top, right, bottom, left)
    const dots = page.locator('.connection-dot')
    await expect(dots).toHaveCount(4)
  })

  test('line has arrowhead marker', async ({ page }) => {
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('Shapes have no bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // The visible connector path should have a marker-end attribute for the arrowhead
    const connectorWithArrow = page.locator('.canvas__lines path.connector[marker-end]')
    await expect(connectorWithArrow).toHaveCount(1)
  })

  test('dragging to empty canvas does not create a line', async ({ page }) => {
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const box1 = await shape1.boundingBox()
    if (!box1) throw new Error('Shape has no bounding box')

    // Drag from shape to empty canvas
    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(350, 50, { steps: 5 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(0)
  })

  test('cursor shows crosshair on shapes in line mode', async ({ page }) => {
    await canvas.selectTool('line')

    // The canvas should have the line tool cursor class
    await expect(canvas.canvas).toHaveClass(/canvas--tool-line/)
  })
})

test.describe('Line types', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes to connect
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)
  })

  test('elbow connector renders with right-angle path', async ({ page }) => {
    // Select elbow line type
    await canvas.selectTool('line')
    await page.locator('[data-testid="line-type-elbow"]').click()

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // The path d attribute should contain H and V commands (right-angle segments)
    const connector = canvas.connectors.first()
    const d = await connector.getAttribute('d')
    expect(d).toMatch(/[HV]/)
  })

  test('curve connector renders with bezier path', async ({ page }) => {
    // Select curve line type
    await canvas.selectTool('line')
    await page.locator('[data-testid="line-type-curve"]').click()

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // The path d attribute should contain C command (cubic bezier)
    const connector = canvas.connectors.first()
    const d = await connector.getAttribute('d')
    expect(d).toMatch(/C/)
  })

  test('line type sub-selector appears when line/arrow tool active', async ({ page }) => {
    const subSelector = page.locator('[data-testid="line-type-selector"]')

    // Not visible initially
    await expect(subSelector).not.toBeVisible()

    // Visible when line tool is active
    await canvas.selectTool('line')
    await expect(subSelector).toBeVisible()

    // Also visible when arrow tool is active
    await canvas.selectTool('arrow')
    await expect(subSelector).toBeVisible()

    // Hidden when switching to other tools
    await canvas.selectTool('select')
    await expect(subSelector).not.toBeVisible()
  })

  test('selecting elbow type then drawing creates elbow connector', async ({ page }) => {
    await canvas.selectTool('line')
    await page.locator('[data-testid="line-type-elbow"]').click()

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)

    // Verify it's an elbow (has H or V commands)
    const d = await canvas.connectors.first().getAttribute('d')
    expect(d).toMatch(/[HV]/)
  })

  test('line type can be changed via property panel after creation', async ({ page }) => {
    // Create a straight line first
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Verify it's straight (M...L only)
    let d = await canvas.connectors.first().getAttribute('d')
    expect(d).toMatch(/^M .* L /)

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Change to curve via property panel
    const lineTypeSelect = page.locator('[data-testid="prop-line-type"]')
    await lineTypeSelect.selectOption('curve')

    // Now it should be a curve (has C command)
    d = await canvas.connectors.first().getAttribute('d')
    expect(d).toMatch(/C/)
  })
})

test.describe('Connector lifecycle', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes and connect them
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)

    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()
  })

  test('deleting a shape removes attached connectors', async ({ page }) => {
    await expect(canvas.connectors).toHaveCount(1)

    // Select the first shape and delete it
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    await shape1.click()
    await page.keyboard.press('Delete')

    // The connector should be gone too (cascade delete)
    await expect(canvas.connectors).toHaveCount(0)
  })

  test('connector follows shape when shape is dragged', async ({ page }) => {
    // Get initial connector path
    const connector = canvas.connectors.first()
    const initialD = await connector.getAttribute('d')

    // Select and drag the first shape
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    const box = await shape1.boundingBox()
    if (!box) throw new Error('No bounding box')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 50, { steps: 5 })
    await page.mouse.up()

    // The connector's path should have changed (following the shape)
    const newD = await connector.getAttribute('d')
    expect(newD).not.toEqual(initialD)
  })
})

test.describe('Connector endpoints', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes to connect
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)
  })

  test('selected connector shows draggable endpoint handles', async ({ page }) => {
    // Create a connector
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Should show 2 endpoint handles
    const endpoints = page.locator('.endpoint-handle')
    await expect(endpoints).toHaveCount(2)
  })

  test('dragging endpoint handle re-attaches to different shape', async ({ page }) => {
    // Create a third shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 400, 120, 80)

    // Create a connector between first two shapes
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.nth(1)
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Drag the end handle to the third shape
    const endHandle = page.locator('.endpoint-handle[data-endpoint="end"]')
    const handleBox = await endHandle.boundingBox()
    if (!handleBox) throw new Error('No endpoint handle box')

    const shape3 = canvas.shapes.nth(2)
    const box3 = await shape3.boundingBox()
    if (!box3) throw new Error('No third shape box')

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(box3.x + box3.width / 2, box3.y + box3.height / 2, { steps: 10 })
    await page.mouse.up()

    // Connector should still exist (re-attached to third shape)
    await expect(canvas.connectors).toHaveCount(1)
  })

  test('dragging endpoint to empty canvas makes it free-floating', async ({ page }) => {
    // Create a connector between the two shapes
    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Drag the end handle to empty canvas
    const endHandle = page.locator('.endpoint-handle[data-endpoint="end"]')
    const handleBox = await endHandle.boundingBox()
    if (!handleBox) throw new Error('No endpoint handle box')

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(600, 50, { steps: 10 })
    await page.mouse.up()

    // Connector should still exist (now with free endpoint)
    await expect(canvas.connectors).toHaveCount(1)
  })
})

test.describe('Arrow tool', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('arrow tool shows in toolbar', async ({ page }) => {
    const arrowBtn = page.locator('[data-testid="tool-arrow"]')
    await expect(arrowBtn).toBeVisible()
  })

  test('arrow tool draws free-floating arrow on empty canvas', async ({ page }) => {
    await canvas.selectTool('arrow')

    // Drag on empty canvas — no shapes needed
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 10 })
    await page.mouse.up()

    // A connector path should be created
    await expect(canvas.connectors).toHaveCount(1)
  })

  test('arrow tool: start on shape, end on empty canvas', async ({ page }) => {
    // Create a shape first
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)

    await canvas.selectTool('arrow')

    const shape = canvas.shapes.first()
    const box = await shape.boundingBox()
    if (!box) throw new Error('Shape has no bounding box')

    // Start on shape, end on empty canvas
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(500, 100, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)
  })

  test('arrow tool: start on empty canvas, end on shape', async ({ page }) => {
    // Create a shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 120, 80)

    await canvas.selectTool('arrow')

    const shape = canvas.shapes.first()
    const box = await shape.boundingBox()
    if (!box) throw new Error('Shape has no bounding box')

    // Start on empty canvas, end on shape
    await page.mouse.move(50, 100)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)
  })

  test('free arrow can be selected and deleted', async ({ page }) => {
    await canvas.selectTool('arrow')

    // Draw a free arrow
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)

    // Switch to select tool and click on the arrow (midpoint)
    await canvas.selectTool('select')
    await page.mouse.click(200, 200)

    // Delete it
    await page.keyboard.press('Delete')
    await expect(canvas.connectors).toHaveCount(0)
  })

  test('line tool still requires two shapes (no free endpoints)', async ({ page }) => {
    await canvas.selectTool('line')

    // Try to draw on empty canvas — line tool should not create anything
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(0)
  })

  test('arrow keyboard shortcut (a) activates arrow tool', async ({ page }) => {
    await page.keyboard.press('a')
    const arrowBtn = page.locator('[data-testid="tool-arrow"]')
    await expect(arrowBtn).toHaveClass(/toolbar__btn--active/)
  })

  test('arrowhead color matches connector stroke', async ({ page }) => {
    await canvas.selectTool('arrow')

    // Draw a free arrow
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 10 })
    await page.mouse.up()

    // The connector should exist
    await expect(canvas.connectors).toHaveCount(1)

    // Get the connector's stroke color
    const connector = canvas.connectors.first()
    const stroke = await connector.getAttribute('stroke')

    // The arrowhead marker polygon should match the connector stroke color
    // Each connector gets its own marker with a matching fill color
    const arrowPolygon = page.locator('.canvas__lines defs marker polygon').first()
    const arrowFill = await arrowPolygon.getAttribute('fill')
    expect(arrowFill).toBe(stroke)
  })
})
