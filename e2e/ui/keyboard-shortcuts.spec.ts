import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Keyboard shortcuts', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('V key switches to select tool', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await page.keyboard.press('v')
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('R key switches to rectangle tool', async ({ page }) => {
    await page.keyboard.press('r')
    await expect(canvas.toolButton('rectangle')).toHaveClass(/toolbar__btn--active/)
  })

  test('O key switches to ellipse tool', async ({ page }) => {
    await page.keyboard.press('o')
    await expect(canvas.toolButton('ellipse')).toHaveClass(/toolbar__btn--active/)
  })

  test('D key switches to diamond tool', async ({ page }) => {
    await page.keyboard.press('d')
    await expect(canvas.toolButton('diamond')).toHaveClass(/toolbar__btn--active/)
  })

  test('P key switches to draw tool', async ({ page }) => {
    await page.keyboard.press('p')
    await expect(canvas.toolButton('draw')).toHaveClass(/toolbar__btn--active/)
  })

  test('L key switches to line tool', async ({ page }) => {
    await page.keyboard.press('l')
    await expect(canvas.toolButton('line')).toHaveClass(/toolbar__btn--active/)
  })

  test('A key switches to arrow tool', async ({ page }) => {
    await page.keyboard.press('a')
    await expect(canvas.toolButton('arrow')).toHaveClass(/toolbar__btn--active/)
  })

  test('Escape deselects and switches to select', async ({ page }) => {
    // Create a shape so there's something selected
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.selectedShape).toHaveCount(1)

    await page.keyboard.press('Escape')
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
    await expect(canvas.selectedShape).toHaveCount(0)
  })

  test('Delete removes selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.shapes).toHaveCount(1)

    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(0)
  })

  test('Backspace removes selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.shapes).toHaveCount(1)

    await page.keyboard.press('Backspace')
    await expect(canvas.shapes).toHaveCount(0)
  })
})
