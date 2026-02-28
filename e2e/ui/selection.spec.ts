import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Multi-select', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create three shapes
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(500, 200, 80, 60)
  })

  test('shift-click adds to selection', async ({ page }) => {
    // Select first shape
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    await shape1.click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Shift-click second shape
    const shape2 = canvas.shapes.nth(1)
    await shape2.click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)
  })

  test('drag-to-select selects multiple elements', async ({ page }) => {
    await canvas.selectTool('select')

    // Drag a selection rectangle that covers all three shapes
    await page.mouse.move(50, 150)
    await page.mouse.down()
    await page.mouse.move(630, 310, { steps: 10 })
    await page.mouse.up()

    await expect(page.locator('.shape--selected')).toHaveCount(3)
  })

  test('delete removes all selected elements', async ({ page }) => {
    // Select first two shapes with shift-click
    await canvas.selectTool('select')
    const shape1 = canvas.shapes.first()
    await shape1.click()
    const shape2 = canvas.shapes.nth(1)
    await shape2.click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Delete — both selected shapes should be removed
    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(1)
  })

  test('Cmd+A selects all elements', async ({ page }) => {
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await expect(page.locator('.shape--selected')).toHaveCount(3)
  })

  test('shift-click on selected shape removes it from selection', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Shift-click the first shape again to deselect it
    await canvas.shapes.first().click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(1)
  })

  test('marquee selection shows selection rectangle while dragging', async ({ page }) => {
    await canvas.selectTool('select')

    await page.mouse.move(50, 150)
    await page.mouse.down()
    await page.mouse.move(300, 300, { steps: 5 })

    await expect(page.locator('.marquee-selection')).toBeVisible()
    await page.mouse.up()
  })

  test('Tab cycles through elements', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const id1 = await page.locator('.shape--selected').getAttribute('data-shape-id')

    await page.keyboard.press('Tab')
    const id2 = await page.locator('.shape--selected').getAttribute('data-shape-id')
    expect(id2).not.toEqual(id1)

    await page.keyboard.press('Tab')
    const id3 = await page.locator('.shape--selected').getAttribute('data-shape-id')
    expect(id3).not.toEqual(id2)
  })

  test('property panel handles multi-select (shared properties)', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })

    // Property panel should show for multi-select with shared fields
    const panel = page.locator('.property-panel')
    await expect(panel).toBeVisible()

    // Changing stroke should apply to all selected
    const strokeInput = page.locator('.property-panel .color-picker--stroke input[type="text"]')
    await strokeInput.fill('#e74c3c')
    await strokeInput.press('Enter')

    await page.mouse.click(600, 50) // deselect
    const rect1 = canvas.shapes.first().locator('rect')
    const rect2 = canvas.shapes.nth(1).locator('rect')
    await expect(rect1).toHaveAttribute('stroke', '#e74c3c')
    await expect(rect2).toHaveAttribute('stroke', '#e74c3c')
  })
})
