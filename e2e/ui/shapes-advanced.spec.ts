import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Additional shape types', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('triangle shape can be created', async ({ page }) => {
    await canvas.selectTool('triangle')
    await canvas.drawShape(200, 200, 100, 80)

    await expect(canvas.shapesOfType('triangle')).toHaveCount(1)
    // Should render as a polygon with 3 points
    const polygon = canvas.shapes.first().locator('polygon')
    await expect(polygon).toHaveCount(1)
  })

  test.fixme('hexagon shape can be created', async ({ page }) => {
    await canvas.selectTool('hexagon')
    await canvas.drawShape(200, 200, 100, 100)

    await expect(canvas.shapesOfType('hexagon')).toHaveCount(1)
  })

  test.fixme('star shape can be created', async ({ page }) => {
    await canvas.selectTool('star')
    await canvas.drawShape(200, 200, 100, 100)

    await expect(canvas.shapesOfType('star')).toHaveCount(1)
  })

  test.fixme('cloud shape can be created', async ({ page }) => {
    await canvas.selectTool('cloud')
    await canvas.drawShape(200, 200, 120, 80)

    await expect(canvas.shapesOfType('cloud')).toHaveCount(1)
  })

  test.fixme('shape picker flyout shows all available shapes', async ({ page }) => {
    const moreShapesBtn = page.locator('[data-testid="more-shapes"]')
    await moreShapesBtn.click()

    const flyout = page.locator('.shape-picker-flyout')
    await expect(flyout).toBeVisible()

    // Should list extended shapes
    await expect(flyout.locator('[data-shape="triangle"]')).toBeVisible()
    await expect(flyout.locator('[data-shape="hexagon"]')).toBeVisible()
    await expect(flyout.locator('[data-shape="star"]')).toBeVisible()
    await expect(flyout.locator('[data-shape="cloud"]')).toBeVisible()
  })

  test.fixme('selecting a shape from flyout activates that tool', async ({ page }) => {
    await page.locator('[data-testid="more-shapes"]').click()
    await page.locator('.shape-picker-flyout [data-shape="triangle"]').click()

    // Drawing should create a triangle
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.shapesOfType('triangle')).toHaveCount(1)
  })

  test.fixme('all shape types support fill and stroke', async ({ page }) => {
    // Create a triangle and check it renders with fill/stroke
    await canvas.selectTool('triangle')
    await canvas.drawShape(200, 200, 100, 80)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const fillInput = page.locator('.property-panel .color-picker--fill input[type="text"]')
    await fillInput.fill('#e74c3c')
    await fillInput.press('Enter')

    await page.mouse.click(600, 50)
    const polygon = canvas.shapes.first().locator('polygon')
    await expect(polygon).toHaveAttribute('fill', '#e74c3c')
  })

  test.fixme('all shape types support text labels', async ({ page }) => {
    await canvas.selectTool('triangle')
    await canvas.drawShape(200, 200, 120, 100)

    await canvas.shapes.first().dblclick()
    await page.keyboard.type('Label')
    await page.keyboard.press('Escape')

    const textarea = canvas.shapes.first().locator('textarea')
    await expect(textarea).toHaveValue('Label')
  })

  test.fixme('all shape types support resize', async ({ page }) => {
    await canvas.selectTool('triangle')
    await canvas.drawShape(200, 200, 100, 80)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.resize-handle')).toHaveCount(8)
  })
})

test.describe('Image elements', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('image can be inserted via toolbar', async ({ page }) => {
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

  test.fixme('image element can be moved', async ({ page }) => {
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

  test.fixme('image element can be resized', async ({ page }) => {
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

  test.fixme('image element can be deleted', async ({ page }) => {
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

  test.fixme('F key activates frame tool', async ({ page }) => {
    await page.keyboard.press('f')
    await expect(canvas.toolButton('frame')).toHaveClass(/toolbar__btn--active/)
  })

  test.fixme('drawing with frame tool creates a frame element', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    await expect(page.locator('[data-testid="frame-element"]')).toHaveCount(1)
  })

  test.fixme('frame has a title/label', async ({ page }) => {
    await page.keyboard.press('f')
    await canvas.drawShape(100, 100, 400, 300)

    const title = page.locator('[data-testid="frame-element"] .frame-title')
    await expect(title).toBeVisible()
  })

  test.fixme('shapes dragged into a frame become children', async ({ page }) => {
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

  test.fixme('moving a frame moves its children', async ({ page }) => {
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

  test.fixme('frame clips overflowing children', async ({ page }) => {
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

  test.fixme('E key activates eraser tool', async ({ page }) => {
    await page.keyboard.press('e')
    await expect(canvas.toolButton('eraser')).toHaveClass(/toolbar__btn--active/)
  })

  test.fixme('clicking a shape with eraser deletes it', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)

    await page.keyboard.press('e')
    await canvas.shapes.first().click()

    await expect(canvas.shapes).toHaveCount(0)
  })

  test.fixme('dragging eraser across multiple shapes deletes them', async ({ page }) => {
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

  test.fixme('eraser works on freehand paths', async ({ page }) => {
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
