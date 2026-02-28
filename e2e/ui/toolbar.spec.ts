import { test, expect } from '@playwright/test'
import { CanvasPage, type ToolName } from './fixtures'

test.describe('Toolbar', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('select tool is active by default', async () => {
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('clicking a tool activates it', async () => {
    await canvas.selectTool('rectangle')
    await expect(canvas.toolButton('rectangle')).toHaveClass(/toolbar__btn--active/)
    await expect(canvas.toolButton('select')).not.toHaveClass(/toolbar__btn--active/)
  })

  test('only one tool is active at a time', async () => {
    const tools: ToolName[] = ['rectangle', 'ellipse', 'diamond', 'line', 'draw', 'select']

    for (const tool of tools) {
      await canvas.selectTool(tool)
      await expect(canvas.toolButton(tool)).toHaveClass(/toolbar__btn--active/)

      for (const other of tools) {
        if (other !== tool) {
          await expect(canvas.toolButton(other)).not.toHaveClass(/toolbar__btn--active/)
        }
      }
    }
  })
})
