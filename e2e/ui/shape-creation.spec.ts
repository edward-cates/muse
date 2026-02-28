import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Shape creation', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('creates a rectangle by dragging', async () => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    await expect(canvas.shapesOfType('rectangle')).toHaveCount(1)
    await expect(canvas.selectedShape).toHaveCount(1)
  })

  test('creates an ellipse by dragging', async () => {
    await canvas.selectTool('ellipse')
    await canvas.drawShape(200, 200, 120, 80)

    await expect(canvas.shapesOfType('ellipse')).toHaveCount(1)
    // Verify the SVG contains an <ellipse> element
    const svgEllipse = canvas.page.locator('[data-testid="shape-ellipse"] .shape__outline ellipse')
    await expect(svgEllipse).toHaveCount(1)
  })

  test('creates a diamond by dragging', async () => {
    await canvas.selectTool('diamond')
    await canvas.drawShape(200, 200, 120, 80)

    await expect(canvas.shapesOfType('diamond')).toHaveCount(1)
    // Verify the SVG contains a <polygon> element
    const svgPolygon = canvas.page.locator('[data-testid="shape-diamond"] .shape__outline polygon')
    await expect(svgPolygon).toHaveCount(1)
  })

  test('does not create shape when drag is too small', async () => {
    await canvas.selectTool('rectangle')
    // Drag only 5px — below MIN_SHAPE_SIZE of 10
    await canvas.drawShape(200, 200, 5, 5)

    await expect(canvas.shapes).toHaveCount(0)
  })

  test('auto-switches to select tool after creating a shape', async () => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('can create multiple shapes', async () => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 80, 60)

    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 100, 80, 60)

    await canvas.selectTool('ellipse')
    await canvas.drawShape(100, 300, 80, 60)

    await expect(canvas.shapes).toHaveCount(3)
    await expect(canvas.shapesOfType('rectangle')).toHaveCount(2)
    await expect(canvas.shapesOfType('ellipse')).toHaveCount(1)
  })
})
