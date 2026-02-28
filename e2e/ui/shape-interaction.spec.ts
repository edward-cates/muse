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
