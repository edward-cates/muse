import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Pan and Zoom', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('scroll wheel changes zoom level', async ({ page }) => {
    const initialTransform = await canvas.getWorldTransform()

    // Dispatch wheel event directly on the canvas element
    // (page.mouse.wheel doesn't reliably trigger React's onWheel)
    await canvas.canvas.dispatchEvent('wheel', {
      deltaY: 100,
      clientX: 400,
      clientY: 300,
    })

    const newTransform = await canvas.getWorldTransform()
    expect(newTransform).not.toEqual(initialTransform)
    expect(newTransform).toContain('scale(')
  })

  test('Space key changes cursor to grab', async ({ page }) => {
    await page.keyboard.down('Space')
    await expect(canvas.canvas).toHaveClass(/canvas--space-held/)

    await page.keyboard.up('Space')
    await expect(canvas.canvas).not.toHaveClass(/canvas--space-held/)
  })

  test('cursor class changes per active tool', async () => {
    await canvas.selectTool('rectangle')
    await expect(canvas.canvas).toHaveClass(/canvas--tool-shape/)

    await canvas.selectTool('draw')
    await expect(canvas.canvas).toHaveClass(/canvas--tool-draw/)

    await canvas.selectTool('select')
    await expect(canvas.canvas).toHaveClass(/canvas--tool-select/)

    await canvas.selectTool('line')
    await expect(canvas.canvas).toHaveClass(/canvas--tool-line/)
  })
})
