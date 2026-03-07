import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Auto Layout', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('spreads out overlapping shapes', async ({ page }) => {
    // Create 4 shapes all piled on top of each other at the same position
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 60)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(200, 200, 100, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 60)

    // Deselect
    await page.mouse.click(600, 50)

    // Record initial positions — they should all be very close
    const beforePositions = await canvas.shapes.evaluateAll(els =>
      els.map(el => ({
        left: parseFloat((el as HTMLElement).style.left),
        top: parseFloat((el as HTMLElement).style.top),
      }))
    )
    expect(beforePositions).toHaveLength(4)

    // All shapes start at roughly the same position
    const allSameArea = beforePositions.every(p =>
      Math.abs(p.left - beforePositions[0].left) < 20 &&
      Math.abs(p.top - beforePositions[0].top) < 20
    )
    expect(allSameArea).toBe(true)

    // Click auto layout button
    await page.locator('[data-testid="auto-layout"]').click()

    // Wait for positions to update
    await page.waitForTimeout(200)

    // Get new positions
    const afterPositions = await canvas.shapes.evaluateAll(els =>
      els.map(el => ({
        left: parseFloat((el as HTMLElement).style.left),
        top: parseFloat((el as HTMLElement).style.top),
      }))
    )
    expect(afterPositions).toHaveLength(4)

    // After layout, shapes should NOT all be in the same spot
    const allStillPiled = afterPositions.every(p =>
      Math.abs(p.left - afterPositions[0].left) < 20 &&
      Math.abs(p.top - afterPositions[0].top) < 20
    )
    expect(allStillPiled).toBe(false)

    // Check minimum distance between any two shapes
    for (let i = 0; i < afterPositions.length; i++) {
      for (let j = i + 1; j < afterPositions.length; j++) {
        const dx = afterPositions[i].left - afterPositions[j].left
        const dy = afterPositions[i].top - afterPositions[j].top
        const dist = Math.sqrt(dx * dx + dy * dy)
        expect(dist).toBeGreaterThan(20)
      }
    }
  })
})
