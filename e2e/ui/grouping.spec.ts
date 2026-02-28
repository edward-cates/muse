import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Grouping', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create two shapes
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(300, 200, 80, 60)
  })

  test('Cmd+G groups selected shapes', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })

    await page.keyboard.press('Meta+g')
    await expect(page.locator('[data-testid="group"]')).toHaveCount(1)
  })

  test('clicking one shape in a group selects the whole group', async ({ page }) => {
    // Group both shapes
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    // Click empty area, then click one shape
    await page.mouse.click(600, 50)
    await canvas.shapes.first().click()

    // Both shapes should show selected
    await expect(page.locator('.shape--selected')).toHaveCount(2)
  })

  test('Cmd+Shift+G ungroups', async ({ page }) => {
    // Group
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    // Ungroup
    await page.keyboard.press('Meta+Shift+g')
    await expect(page.locator('[data-testid="group"]')).toHaveCount(0)

    // Click one shape — only that shape should be selected
    await page.mouse.click(600, 50)
    await canvas.shapes.first().click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)
  })

  test('double-click enters group to select individual child', async ({ page }) => {
    // Group both shapes
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    // Click empty area, then double-click one shape
    await page.mouse.click(600, 50)
    const shape = canvas.shapes.first()
    await shape.dblclick()

    // Only the double-clicked shape should be selected
    await expect(page.locator('.shape--selected')).toHaveCount(1)
  })

  test('dragging a group moves all children together', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    const box1Before = await canvas.shapes.first().boundingBox()
    const box2Before = await canvas.shapes.nth(1).boundingBox()

    // Drag the group
    await canvas.shapes.first().click()
    await page.mouse.move(box1Before!.x + 40, box1Before!.y + 30)
    await page.mouse.down()
    await page.mouse.move(box1Before!.x + 140, box1Before!.y + 130, { steps: 5 })
    await page.mouse.up()

    const box1After = await canvas.shapes.first().boundingBox()
    const box2After = await canvas.shapes.nth(1).boundingBox()

    // Both should have moved by the same delta
    const dx = box1After!.x - box1Before!.x
    expect(box2After!.x - box2Before!.x).toBeCloseTo(dx, 0)
  })

  test('deleting a group deletes all children', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    await canvas.shapes.first().click()
    await page.keyboard.press('Delete')

    await expect(canvas.shapes).toHaveCount(0)
  })

  test('nested groups work', async ({ page }) => {
    // Add a third shape
    await canvas.selectTool('diamond')
    await canvas.drawShape(500, 200, 80, 60)

    // Group first two
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    // Now group that group with the third shape
    await page.mouse.click(600, 50)
    await canvas.shapes.first().click() // selects the group
    await canvas.shapes.last().click({ modifiers: ['Shift'] })
    await page.keyboard.press('Meta+g')

    await expect(page.locator('[data-testid="group"]')).toHaveCount(2)
  })
})
