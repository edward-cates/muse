import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Clipboard', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('Cmd+C then Cmd+V duplicates selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')
    await expect(canvas.shapes).toHaveCount(2)
  })

  test('pasted shape is offset from original', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')

    const box1 = await canvas.shapes.first().boundingBox()
    const box2 = await canvas.shapes.nth(1).boundingBox()
    // Pasted shape should be offset (not exactly on top)
    expect(box2!.x).not.toEqual(box1!.x)
    expect(box2!.y).not.toEqual(box1!.y)
  })

  test('Cmd+X cuts selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.keyboard.press('Meta+x')
    await expect(canvas.shapes).toHaveCount(0)

    await page.keyboard.press('Meta+v')
    await expect(canvas.shapes).toHaveCount(1)
  })

  test('Cmd+D duplicates selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.keyboard.press('Meta+d')
    await expect(canvas.shapes).toHaveCount(2)
  })

  test('copy preserves shape styling', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Change fill color
    const fillInput = page.locator('.property-panel input[type="color"]').first()
    await fillInput.fill('#ff0000')

    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')

    // Deselect to see true colors
    await page.mouse.click(600, 50)
    const pastedRect = canvas.shapes.nth(1).locator('rect')
    await expect(pastedRect).toHaveAttribute('fill', '#ff0000')
  })

  test('copy-paste works with multiple selected shapes', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(300, 200, 80, 60)

    // Select both
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })

    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')
    await expect(canvas.shapes).toHaveCount(4)
  })

  test('copy-paste includes connected connectors', async ({ page }) => {
    // Create two connected shapes
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('line')
    await page.mouse.move(180, 230)
    await page.mouse.down()
    await page.mouse.move(300, 230, { steps: 5 })
    await page.mouse.up()

    // Select all, copy, paste
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Meta+c')
    await page.keyboard.press('Meta+v')

    await expect(canvas.shapes).toHaveCount(4)
    await expect(canvas.connectors).toHaveCount(2)
  })

  test('Alt+drag clones shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Alt+drag
    await page.mouse.move(250, 240)
    await page.keyboard.down('Alt')
    await page.mouse.down()
    await page.mouse.move(450, 240, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    await expect(canvas.shapes).toHaveCount(2)
  })

  test.fixme('paste image from clipboard creates image element', async ({ page }) => {
    // This tests pasting an image blob from the system clipboard
    // Simulate by dispatching a paste event with image data
    await page.evaluate(() => {
      const canvas = new Uint8Array([137, 80, 78, 71]) // PNG header stub
      const blob = new Blob([canvas], { type: 'image/png' })
      const item = new ClipboardItem({ 'image/png': blob })
      const event = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      })
      document.dispatchEvent(event)
    })
    // Should create an image element on the canvas
    await expect(page.locator('.canvas__world img, [data-testid="image-element"]')).toHaveCount(1)
  })
})
