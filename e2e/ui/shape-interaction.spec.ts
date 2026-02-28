import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Shape interaction', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a rectangle to interact with
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    // After creation: tool auto-switched to select, shape is selected
  })

  test('clicking a shape selects it', async ({ page }) => {
    // Deselect first
    await page.keyboard.press('Escape')
    await expect(canvas.selectedShape).toHaveCount(0)

    // Click the shape
    const shape = canvas.shapes.first()
    await shape.click()
    await expect(shape).toHaveClass(/shape--selected/)
  })

  test('clicking empty canvas deselects shape', async () => {
    await expect(canvas.selectedShape).toHaveCount(1)

    // Click far from the shape (top-left corner)
    await canvas.canvas.click({ position: { x: 10, y: 10 } })
    await expect(canvas.selectedShape).toHaveCount(0)
  })

  test('dragging a shape moves it', async ({ page }) => {
    const shape = canvas.shapes.first()
    const initialStyle = await shape.getAttribute('style')

    // Get bounding box and drag the shape
    const box = await shape.boundingBox()
    if (!box) throw new Error('Shape has no bounding box')

    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 50, cy + 30, { steps: 5 })
    await page.mouse.up()

    const newStyle = await shape.getAttribute('style')
    expect(newStyle).not.toEqual(initialStyle)
  })

  test('double-clicking a shape enters text edit mode', async () => {
    const shape = canvas.shapes.first()
    await shape.dblclick()

    const textarea = shape.locator('.shape__text--editing')
    await expect(textarea).toHaveCount(1)
  })

  test('typing in text edit mode updates shape text', async ({ page }) => {
    const shape = canvas.shapes.first()
    await shape.dblclick()

    const textarea = shape.locator('.shape__text')
    await textarea.fill('Hello World')
    await expect(textarea).toHaveValue('Hello World')
  })

  test('keyboard shortcuts do not fire while editing text', async ({ page }) => {
    const shape = canvas.shapes.first()
    await shape.dblclick()

    // Type 'r' which would normally switch to rectangle tool
    const textarea = shape.locator('.shape__text')
    await textarea.press('r')

    // Tool should still be select, not rectangle
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
    await expect(canvas.toolButton('rectangle')).not.toHaveClass(/toolbar__btn--active/)
  })
})

test.describe('Shape resize handles', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a rectangle — auto-selects and switches to select tool
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
  })

  test('selected shape shows resize handles', async ({ page }) => {
    const handles = page.locator('.resize-handle')
    await expect(handles).toHaveCount(8) // 4 corners + 4 edges
  })

  test('dragging corner handle resizes shape', async ({ page }) => {
    const shape = canvas.shapes.first()
    const box = await shape.boundingBox()
    if (!box) throw new Error('No bounding box')

    // Drag the bottom-right corner handle
    const handle = page.locator('.resize-handle[data-handle="se"]')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('No handle bounding box')

    const hx = handleBox.x + handleBox.width / 2
    const hy = handleBox.y + handleBox.height / 2

    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx + 40, hy + 30, { steps: 5 })
    await page.mouse.up()

    // Shape should now be larger
    const newBox = await shape.boundingBox()
    if (!newBox) throw new Error('No bounding box after resize')
    expect(newBox.width).toBeGreaterThan(box.width + 20)
    expect(newBox.height).toBeGreaterThan(box.height + 15)
  })

  test('dragging edge handle resizes in one axis', async ({ page }) => {
    const shape = canvas.shapes.first()
    const box = await shape.boundingBox()
    if (!box) throw new Error('No bounding box')

    // Drag the right edge handle (only width should change)
    const handle = page.locator('.resize-handle[data-handle="e"]')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('No handle bounding box')

    const hx = handleBox.x + handleBox.width / 2
    const hy = handleBox.y + handleBox.height / 2

    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx + 50, hy, { steps: 5 })
    await page.mouse.up()

    const newBox = await shape.boundingBox()
    if (!newBox) throw new Error('No bounding box after resize')
    expect(newBox.width).toBeGreaterThan(box.width + 30)
    // Height should stay roughly the same
    expect(Math.abs(newBox.height - box.height)).toBeLessThan(5)
  })

  test('resize respects minimum shape size', async ({ page }) => {
    const shape = canvas.shapes.first()

    // Drag the bottom-right corner handle inward to make shape tiny
    const handle = page.locator('.resize-handle[data-handle="se"]')
    const handleBox = await handle.boundingBox()
    if (!handleBox) throw new Error('No handle bounding box')

    const hx = handleBox.x + handleBox.width / 2
    const hy = handleBox.y + handleBox.height / 2

    await page.mouse.move(hx, hy)
    await page.mouse.down()
    await page.mouse.move(hx - 200, hy - 200, { steps: 5 })
    await page.mouse.up()

    const newBox = await shape.boundingBox()
    if (!newBox) throw new Error('No bounding box after resize')
    expect(newBox.width).toBeGreaterThanOrEqual(10)
    expect(newBox.height).toBeGreaterThanOrEqual(10)
  })

  test('resize handles disappear on deselect', async ({ page }) => {
    await expect(page.locator('.resize-handle')).toHaveCount(8)

    // Deselect
    await page.keyboard.press('Escape')
    await expect(page.locator('.resize-handle')).toHaveCount(0)
  })

  test('resize handles not shown in non-select tool modes', async ({ page }) => {
    // Shape is selected, handles visible in select mode
    await expect(page.locator('.resize-handle')).toHaveCount(8)

    // Switch to rectangle tool — handles should disappear
    await canvas.selectTool('rectangle')
    await expect(page.locator('.resize-handle')).toHaveCount(0)
  })
})

test.describe('Click-to-select in non-select tool modes', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a shape, then deselect
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await page.mouse.click(600, 50) // deselect
  })

  test('clicking shape while in rectangle tool selects it and switches to select mode', async ({ page }) => {
    await canvas.selectTool('rectangle')
    // Shapes have pointer-events:none in creation modes, so click at shape center coords
    await page.mouse.click(260, 240)

    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('clicking shape while in draw tool selects it and switches to select mode', async ({ page }) => {
    await canvas.selectTool('draw')
    // Shapes have pointer-events:none in creation modes, so click at shape center coords
    await page.mouse.click(260, 240)

    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('clicking shape in line mode does not auto-select (line tool takes priority)', async ({ page }) => {
    await canvas.selectTool('line')
    // Click at shape center — line tool should start a connector, not auto-select
    await page.mouse.click(260, 240)

    // In line mode, clicking a shape starts a connector, not selection
    await expect(page.locator('.shape--selected')).toHaveCount(0)
  })
})
