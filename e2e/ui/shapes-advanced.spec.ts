import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Image elements', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('image can be inserted via toolbar', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('[data-testid="insert-image"]').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(100), // minimal PNG
    })

    await expect(page.locator('[data-testid="image-element"]')).toHaveCount(1)
  })

  test('image element can be moved', async ({ page }) => {
    // Insert image (simplified)
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('[data-testid="insert-image"]').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(100),
    })

    const img = page.locator('[data-testid="image-element"]')
    const boxBefore = await img.boundingBox()

    await canvas.selectTool('select')
    await img.click()
    await page.mouse.move(boxBefore!.x + 20, boxBefore!.y + 20)
    await page.mouse.down()
    await page.mouse.move(boxBefore!.x + 120, boxBefore!.y + 120, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await img.boundingBox()
    expect(boxAfter!.x).toBeGreaterThan(boxBefore!.x)
  })

  test('image element can be resized', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('[data-testid="insert-image"]').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(100),
    })

    await canvas.selectTool('select')
    await page.locator('[data-testid="image-element"]').click()
    await expect(page.locator('.resize-handle')).toHaveCount(8)
  })

  test('image element can be deleted', async ({ page }) => {
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('[data-testid="insert-image"]').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(100),
    })

    await canvas.selectTool('select')
    await page.locator('[data-testid="image-element"]').click()
    await page.keyboard.press('Delete')

    await expect(page.locator('[data-testid="image-element"]')).toHaveCount(0)
  })
})

test.describe('Frame / container', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('F key activates frame tool', async ({ page }) => {
    await page.keyboard.press('f')
    await expect(canvas.toolButton('frame')).toHaveClass(/toolbar__btn--active/)
  })

  test('drawing with frame tool creates a frame element', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    await expect(page.locator('[data-testid="frame-element"]')).toHaveCount(1)
  })

  test('frame has a title/label', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    const title = page.locator('[data-testid="frame-element"] .frame-title')
    await expect(title).toBeVisible()
  })

  test('shapes dragged into a frame become children', async ({ page }) => {
    // Create frame first
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    // Create shape outside
    await canvas.selectTool('rectangle')
    await canvas.drawShape(600, 200, 80, 60)

    // Drag shape into frame
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.mouse.move(640, 230)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 10 })
    await page.mouse.up()

    // Shape should be a child of the frame
    const frame = page.locator('[data-testid="frame-element"]')
    const childShapes = frame.locator('.shape')
    await expect(childShapes).toHaveCount(1)
  })

  test('moving a frame moves its children', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    // Create shape inside the frame
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 80, 60)

    const childBefore = await canvas.shapes.first().boundingBox()

    // Select and move the frame
    await canvas.selectTool('select')
    const frame = page.locator('[data-testid="frame-element"]')
    await frame.click()
    await page.mouse.move(300, 250)
    await page.mouse.down()
    await page.mouse.move(400, 350, { steps: 5 })
    await page.mouse.up()

    const childAfter = await canvas.shapes.first().boundingBox()
    expect(childAfter!.x).toBeGreaterThan(childBefore!.x)
  })

  test('frame clips overflowing children', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 200, 150)

    // Create a shape that extends beyond the frame
    await canvas.selectTool('rectangle')
    await canvas.drawShape(250, 150, 200, 100) // half outside

    const frame = page.locator('[data-testid="frame-element"]')
    const overflow = await frame.evaluate(el => getComputedStyle(el).overflow)
    expect(overflow).toBe('hidden')
  })
})

test.describe('Eraser tool', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('E key activates eraser tool', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(canvas.toolButton('eraser')).toHaveClass(/toolbar__btn--active/)
  })

  test('clicking a shape with eraser deletes it', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)

    await page.keyboard.press('e')
    await canvas.shapes.first().click()

    await expect(canvas.shapes).toHaveCount(0)
  })

  test('dragging eraser across multiple shapes deletes them', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(250, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 80, 60)

    await page.keyboard.press('e')
    await page.mouse.move(80, 230)
    await page.mouse.down()
    await page.mouse.move(500, 230, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.shapes).toHaveCount(0)
  })

  test('eraser works on freehand paths', async ({ page }) => {
    await canvas.selectTool('draw')
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(400, 300, { steps: 15 })
    await page.mouse.up()
    await expect(canvas.paths).toHaveCount(1)

    await page.keyboard.press('e')
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(400, 300, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(0)
  })
})
