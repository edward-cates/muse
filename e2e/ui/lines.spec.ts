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

    // A line should be rendered in the lines SVG layer
    await expect(canvas.lines).toHaveCount(1)
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

    // The visible line should have a marker-end attribute for the arrowhead
    const visibleLine = page.locator('.canvas__lines line[marker-end]')
    await expect(visibleLine).toHaveCount(1)
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

    await expect(canvas.lines).toHaveCount(0)
  })

  test('cursor shows crosshair on shapes in line mode', async ({ page }) => {
    await canvas.selectTool('line')

    // The canvas should have the line tool cursor class
    await expect(canvas.canvas).toHaveClass(/canvas--tool-line/)
  })
})
