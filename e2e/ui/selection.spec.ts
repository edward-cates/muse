import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Multi-select', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create three shapes
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(500, 200, 80, 60)
  })

  test('shift-click adds to selection', async ({ page }) => {
    // Select first shape
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    await shape1.click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Shift-click second shape
    const shape2 = canvas.shapes.nth(1)
    await shape2.click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)
  })

  test('drag-to-select selects multiple elements', async ({ page }) => {
    await canvas.selectTool('select')

    // Drag a selection rectangle that covers all three shapes
    await page.mouse.move(50, 150)
    await page.mouse.down()
    await page.mouse.move(630, 310, { steps: 10 })
    await page.mouse.up()

    await expect(page.locator('.shape--selected')).toHaveCount(3)
  })

  test('delete removes all selected elements', async ({ page }) => {
    // Select first two shapes with shift-click
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    await shape1.click()
    const shape2 = canvas.shapes.nth(1)
    await shape2.click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Delete — both selected shapes should be removed
    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(1)
  })

  test('Cmd+A selects all elements', async ({ page }) => {
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await expect(page.locator('.shape--selected')).toHaveCount(3)
  })

  test('shift-click on selected shape removes it from selection', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Shift-click the first shape again to deselect it
    await canvas.shapes.first().click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(1)
  })

  test('marquee selection shows selection rectangle while dragging', async ({ page }) => {
    await canvas.selectTool('select')

    await page.mouse.move(50, 150)
    await page.mouse.down()
    await page.mouse.move(300, 300, { steps: 5 })

    await expect(page.locator('.marquee-selection')).toBeVisible()
    await page.mouse.up()
  })

  test('Tab cycles through elements', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const id1 = await page.locator('.shape--selected').getAttribute('data-shape-id')

    await page.keyboard.press('Tab')
    const id2 = await page.locator('.shape--selected').getAttribute('data-shape-id')
    expect(id2).not.toEqual(id1)

    await page.keyboard.press('Tab')
    const id3 = await page.locator('.shape--selected').getAttribute('data-shape-id')
    expect(id3).not.toEqual(id2)
  })

  test('switching to a different tool clears selection', async ({ page }) => {
    // Select a shape
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Switch to arrow tool via toolbar
    await canvas.selectTool('arrow')
    await expect(page.locator('.shape--selected')).toHaveCount(0)
  })

  test('dragging one selected shape moves all and keeps highlights', async ({ page }) => {
    await canvas.selectTool('select')

    // Select first two shapes
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Record initial positions
    const box1Before = await canvas.shapes.first().boundingBox()
    const box2Before = await canvas.shapes.nth(1).boundingBox()
    if (!box1Before || !box2Before) throw new Error('No bounding box')

    // Click down on first shape to start drag — highlights should persist
    await page.mouse.move(box1Before.x + 40, box1Before.y + 30)
    await page.mouse.down()
    // Both should still be highlighted after mousedown
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    await page.mouse.move(box1Before.x + 140, box1Before.y + 130, { steps: 5 })
    await page.mouse.up()

    // Both should still be highlighted after drag
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Both shapes should have moved by the same delta
    const box1After = await canvas.shapes.first().boundingBox()
    const box2After = await canvas.shapes.nth(1).boundingBox()
    if (!box1After || !box2After) throw new Error('No bounding box')

    const dx = box1After.x - box1Before.x
    const dy = box1After.y - box1Before.y
    expect(dx).toBeGreaterThan(50) // verify it actually moved
    expect(Math.abs((box2After.x - box2Before.x) - dx)).toBeLessThan(5)
    expect(Math.abs((box2After.y - box2Before.y) - dy)).toBeLessThan(5)
  })

  test('connector and shapes show highlights simultaneously', async ({ page }) => {
    // Draw a free-floating arrow
    await canvas.selectTool('arrow')
    await page.mouse.move(100, 400)
    await page.mouse.down()
    await page.mouse.move(300, 400, { steps: 5 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)

    // Select all with Cmd+A (3 shapes + 1 arrow)
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')

    // All 3 shapes should be highlighted
    await expect(page.locator('.shape--selected')).toHaveCount(3)

    // The connector should also show selection glow simultaneously
    const glowPaths = page.locator('svg.canvas__lines path[opacity="0.25"]')
    await expect(glowPaths).toHaveCount(1)
  })

  test('free-floating arrow moves with multi-select drag', async ({ page }) => {
    // Draw a free-floating arrow
    await canvas.selectTool('arrow')
    await page.mouse.move(100, 400)
    await page.mouse.down()
    await page.mouse.move(300, 400, { steps: 5 })
    await page.mouse.up()
    await expect(canvas.connectors).toHaveCount(1)

    // Select all (3 shapes + 1 arrow)
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await expect(page.locator('.shape--selected')).toHaveCount(3)

    // Get arrow path's initial d attribute
    const connector = canvas.connectors.first()
    const dBefore = await connector.getAttribute('d')

    // Drag one of the shapes
    const box = await canvas.shapes.first().boundingBox()
    if (!box) throw new Error('No bounding box')
    await page.mouse.move(box.x + 40, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 140, box.y + 130, { steps: 5 })
    await page.mouse.up()

    // Arrow should have moved — its path should be different
    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })

  test('clicking an already-selected shape preserves multi-selection', async ({ page }) => {
    await canvas.selectTool('select')

    // Select all three shapes
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await canvas.shapes.nth(2).click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(3)

    // Click one of the already-selected shapes (no shift)
    await canvas.shapes.nth(1).click()

    // All three should still be selected
    await expect(page.locator('.shape--selected')).toHaveCount(3)
  })

  test('property panel handles multi-select (shared properties)', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })

    // Property panel should show for multi-select with shared fields
    const panel = page.locator('.property-panel')
    await expect(panel).toBeVisible()

    // Changing stroke should apply to all selected
    const strokeInput = page.locator('.property-panel .color-picker--stroke input[type="text"]')
    await strokeInput.fill('#e74c3c')
    await strokeInput.press('Enter')

    await page.mouse.click(600, 50) // deselect
    const rect1 = canvas.shapes.first().locator('rect')
    const rect2 = canvas.shapes.nth(1).locator('rect')
    await expect(rect1).toHaveAttribute('stroke', '#e74c3c')
    await expect(rect2).toHaveAttribute('stroke', '#e74c3c')
  })
})
