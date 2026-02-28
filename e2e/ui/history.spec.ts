import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Undo / Redo', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('Cmd+Z undoes shape creation', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.shapes).toHaveCount(1)

    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(0)
  })

  test.fixme('Cmd+Shift+Z redoes undone shape creation', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(0)

    await page.keyboard.press('Meta+Shift+z')
    await expect(canvas.shapes).toHaveCount(1)
  })

  test.fixme('undo reverts shape move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    const shape = canvas.shapes.first()
    const boxBefore = await shape.boundingBox()

    // Drag shape
    await canvas.selectTool('select')
    await shape.click()
    await page.mouse.move(250, 240)
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()

    // Undo
    await page.keyboard.press('Meta+z')
    const boxAfter = await shape.boundingBox()
    expect(boxAfter!.x).toBeCloseTo(boxBefore!.x, 0)
    expect(boxAfter!.y).toBeCloseTo(boxBefore!.y, 0)
  })

  test.fixme('undo reverts shape resize', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    const shape = canvas.shapes.first()
    const boxBefore = await shape.boundingBox()

    // Resize via SE handle
    await canvas.selectTool('select')
    await shape.click()
    const handle = page.locator('[data-handle="se"]')
    await handle.hover()
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()

    await page.keyboard.press('Meta+z')
    const boxAfter = await shape.boundingBox()
    expect(boxAfter!.width).toBeCloseTo(boxBefore!.width, 0)
    expect(boxAfter!.height).toBeCloseTo(boxBefore!.height, 0)
  })

  test.fixme('undo reverts text edit', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    const shape = canvas.shapes.first()
    await shape.dblclick()
    await page.keyboard.type('Hello')
    await page.keyboard.press('Escape')

    await page.keyboard.press('Meta+z')
    const textarea = shape.locator('textarea')
    await expect(textarea).toHaveValue('')
  })

  test.fixme('undo reverts shape deletion', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(0)

    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(1)
  })

  test.fixme('undo reverts connector creation', async ({ page }) => {
    // Create two shapes and connect them
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)

    await canvas.selectTool('line')
    await page.mouse.move(180, 230)
    await page.mouse.down()
    await page.mouse.move(300, 230, { steps: 5 })
    await page.mouse.up()
    await expect(canvas.connectors).toHaveCount(1)

    await page.keyboard.press('Meta+z')
    await expect(canvas.connectors).toHaveCount(0)
  })

  test.fixme('undo reverts style change', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Change fill color
    const fillInput = page.locator('.property-panel input[type="color"]').first()
    await fillInput.fill('#ff0000')
    await page.keyboard.press('Meta+z')

    // Check fill reverted to default
    await page.mouse.click(600, 50) // deselect
    const svg = canvas.shapes.first().locator('rect')
    await expect(svg).toHaveAttribute('fill', '#ffffff')
  })

  test.fixme('multiple undos walk back through history', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(500, 200, 80, 60)
    await expect(canvas.shapes).toHaveCount(3)

    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(2)
    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(1)
    await page.keyboard.press('Meta+z')
    await expect(canvas.shapes).toHaveCount(0)
  })

  test.fixme('redo after new action clears redo stack', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 100, 80)

    await page.keyboard.press('Meta+z') // undo second shape
    await expect(canvas.shapes).toHaveCount(1)

    // New action should clear redo stack
    await canvas.selectTool('ellipse')
    await canvas.drawShape(400, 200, 80, 60)
    await page.keyboard.press('Meta+Shift+z') // redo should do nothing
    await expect(canvas.shapes).toHaveCount(2)
    // Second shape should be the ellipse, not the original rectangle
    await expect(canvas.shapesOfType('ellipse')).toHaveCount(1)
  })
})
