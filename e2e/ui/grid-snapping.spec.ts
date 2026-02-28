import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Grid', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('grid can be toggled visible via keyboard shortcut', async ({ page }) => {
    // Grid off by default
    await expect(page.locator('.canvas__grid')).toHaveCount(0)

    await page.keyboard.press('Meta+Shift+g')
    await expect(page.locator('.canvas__grid')).toBeVisible()

    await page.keyboard.press('Meta+Shift+g')
    await expect(page.locator('.canvas__grid')).toHaveCount(0)
  })

  test.fixme('grid lines are visible when enabled', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+g')
    const grid = page.locator('.canvas__grid')
    await expect(grid).toBeVisible()
    // Grid should render as SVG pattern or similar
    const hasPattern = await grid.evaluate(el => el.querySelector('pattern, line') !== null)
    expect(hasPattern).toBeTruthy()
  })

  test.fixme('grid follows canvas pan', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+g')
    const gridBefore = await page.locator('.canvas__grid').boundingBox()

    // Pan canvas
    await page.keyboard.down('Space')
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Space')

    const gridAfter = await page.locator('.canvas__grid').boundingBox()
    // Grid should have moved with the canvas
    expect(gridAfter!.x).not.toEqual(gridBefore!.x)
  })

  test.fixme('grid scales with zoom', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+g')

    // Zoom in
    await canvas.canvas.dispatchEvent('wheel', { deltaY: -200, clientX: 400, clientY: 300 })

    // Grid should still be visible and pattern should scale
    await expect(page.locator('.canvas__grid')).toBeVisible()
  })
})

test.describe('Snap to grid', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('shapes snap to grid when grid snapping is enabled', async ({ page }) => {
    // Enable grid + snap
    await page.keyboard.press('Meta+Shift+g')

    await canvas.selectTool('rectangle')
    // Draw at non-grid-aligned position
    await canvas.drawShape(203, 207, 100, 80)

    // Shape position should snap to nearest grid point
    const shape = canvas.shapes.first()
    const x = await shape.evaluate(el => parseFloat((el as HTMLElement).style.left))
    const y = await shape.evaluate(el => parseFloat((el as HTMLElement).style.top))
    // Grid default is 20px, so positions should be multiples of 20
    expect(x % 20).toBe(0)
    expect(y % 20).toBe(0)
  })

  test.fixme('dragged shapes snap to grid', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+g') // enable grid

    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    const shape = canvas.shapes.first()
    await shape.click()

    // Drag to non-aligned position
    await page.mouse.move(250, 240)
    await page.mouse.down()
    await page.mouse.move(313, 327, { steps: 5 })
    await page.mouse.up()

    const x = await shape.evaluate(el => parseFloat((el as HTMLElement).style.left))
    const y = await shape.evaluate(el => parseFloat((el as HTMLElement).style.top))
    expect(x % 20).toBe(0)
    expect(y % 20).toBe(0)
  })

  test.fixme('resized shapes snap dimensions to grid', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+g')

    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const handle = page.locator('[data-handle="se"]')
    await handle.hover()
    await page.mouse.down()
    await page.mouse.move(417, 393, { steps: 5 })
    await page.mouse.up()

    const shape = canvas.shapes.first()
    const w = await shape.evaluate(el => parseFloat((el as HTMLElement).style.width))
    const h = await shape.evaluate(el => parseFloat((el as HTMLElement).style.height))
    expect(w % 20).toBe(0)
    expect(h % 20).toBe(0)
  })
})

test.describe('Smart alignment guides', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a reference shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
  })

  test.fixme('alignment guide appears when dragging shape near another shape edge', async ({ page }) => {
    // Create second shape
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 300, 100, 80)

    // Drag second shape to align with first shape's left edge
    await canvas.selectTool('select')
    await canvas.shapes.nth(1).click()
    await page.mouse.move(450, 340)
    await page.mouse.down()
    // Move to x=200 (same left edge as first shape)
    await page.mouse.move(250, 340, { steps: 10 })

    // Alignment guide should be visible
    await expect(page.locator('.alignment-guide')).toBeVisible()
    await page.mouse.up()
  })

  test.fixme('shape snaps to alignment guide position', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 300, 100, 80)

    await canvas.selectTool('select')
    await canvas.shapes.nth(1).click()
    await page.mouse.move(450, 340)
    await page.mouse.down()
    // Move close to x=200 but not exact
    await page.mouse.move(253, 340, { steps: 10 })
    await page.mouse.up()

    // Should have snapped to 200
    const shape = canvas.shapes.nth(1)
    const x = await shape.evaluate(el => parseFloat((el as HTMLElement).style.left))
    expect(x).toBe(200)
  })

  test.fixme('center alignment guide appears when shapes are center-aligned', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 300, 100, 80)

    await canvas.selectTool('select')
    await canvas.shapes.nth(1).click()
    await page.mouse.move(450, 340)
    await page.mouse.down()
    // Move to center-align vertically with first shape (y center = 240)
    await page.mouse.move(450, 240, { steps: 10 })

    await expect(page.locator('.alignment-guide--center')).toBeVisible()
    await page.mouse.up()
  })
})
