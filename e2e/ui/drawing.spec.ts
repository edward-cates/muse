import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Freehand drawing', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('draw tool creates a path on the canvas', async ({ page }) => {
    await canvas.selectTool('draw')

    // Draw a stroke across the canvas
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 15 })
    await page.mouse.move(400, 200, { steps: 15 })
    await page.mouse.up()

    // A visible path should appear in the paths SVG layer
    await expect(canvas.paths).toHaveCount(1)
  })

  test('draw tool works over existing shapes', async ({ page }) => {
    // Create a shape first
    await canvas.selectTool('rectangle')
    await canvas.drawShape(150, 150, 200, 150)

    // Now draw over it
    await canvas.selectTool('draw')
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(250, 225, { steps: 15 })
    await page.mouse.move(400, 200, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    // Shape should still exist
    await expect(canvas.shapes).toHaveCount(1)
  })

  test('short draw (fewer than 2 points) does not create a path', async ({ page }) => {
    await canvas.selectTool('draw')

    // Just a click, no real drag
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(0)
  })

  test('draw tool stays active for multiple strokes', async ({ page }) => {
    await canvas.selectTool('draw')

    // First stroke
    await page.mouse.move(100, 100)
    await page.mouse.down()
    await page.mouse.move(200, 150, { steps: 15 })
    await page.mouse.up()

    // Second stroke (draw tool should still be active)
    await page.mouse.move(100, 300)
    await page.mouse.down()
    await page.mouse.move(200, 350, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(2)
    // Draw tool should remain active (unlike shape tools which auto-switch)
    await expect(canvas.toolButton('draw')).toHaveClass(/toolbar__btn--active/)
  })
})
