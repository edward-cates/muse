import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Z-ordering', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create three overlapping shapes
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80) // shape 0 (bottom)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(240, 220, 120, 80) // shape 1 (middle)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(280, 240, 120, 80) // shape 2 (top)
  })

  test.fixme('bring to front moves shape above all others', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click() // select bottom shape

    await page.keyboard.press('Meta+Shift+]')

    // First shape in DOM should now be last (topmost)
    const ids = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    const selectedId = await canvas.shapes.first().getAttribute('data-shape-id')
    expect(ids[ids.length - 1]).toBe(selectedId)
  })

  test.fixme('send to back moves shape below all others', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.last().click() // select top shape

    await page.keyboard.press('Meta+Shift+[')

    const ids = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    const selectedId = await canvas.shapes.last().getAttribute('data-shape-id')
    expect(ids[0]).toBe(selectedId)
  })

  test.fixme('bring forward moves shape up one level', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click() // select bottom shape
    const id = await canvas.shapes.first().getAttribute('data-shape-id')

    await page.keyboard.press('Meta+]')

    // Should now be at index 1 (moved up one)
    const ids = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    expect(ids[1]).toBe(id)
  })

  test.fixme('send backward moves shape down one level', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.last().click() // select top shape
    const id = await canvas.shapes.last().getAttribute('data-shape-id')

    await page.keyboard.press('Meta+[')

    const ids = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    expect(ids[1]).toBe(id)
  })

  test.fixme('bring to front on topmost shape is a no-op', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.last().click()
    const idsBefore = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))

    await page.keyboard.press('Meta+Shift+]')

    const idsAfter = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    expect(idsAfter).toEqual(idsBefore)
  })

  test.fixme('send to back on bottommost shape is a no-op', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const idsBefore = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))

    await page.keyboard.press('Meta+Shift+[')

    const idsAfter = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    expect(idsAfter).toEqual(idsBefore)
  })

  test.fixme('z-order changes persist after deselect and reselect', async ({ page }) => {
    await canvas.selectTool('select')
    const bottomId = await canvas.shapes.first().getAttribute('data-shape-id')
    await canvas.shapes.first().click()

    await page.keyboard.press('Meta+Shift+]') // bring to front
    await page.mouse.click(600, 50) // deselect

    const ids = await canvas.shapes.evaluateAll(els => els.map(el => el.getAttribute('data-shape-id')))
    expect(ids[ids.length - 1]).toBe(bottomId)
  })
})
