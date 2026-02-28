import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Property panel', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('property panel appears when shape is selected', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    // Shape auto-selects after creation
    const panel = page.locator('[data-testid="property-panel"]')
    await expect(panel).toBeVisible()
  })

  test('property panel disappears on deselect', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    const panel = page.locator('[data-testid="property-panel"]')
    await expect(panel).toBeVisible()

    // Click on empty canvas to deselect
    await page.keyboard.press('Escape')
    await expect(panel).not.toBeVisible()
  })

  test('fill color picker changes shape fill', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    // Change fill color
    const fillInput = page.locator('[data-testid="prop-fill"]')
    await fillInput.fill('#ff0000')
    await fillInput.press('Enter')

    // Verify shape SVG fill changed
    const shapeSvg = page.locator('[data-testid="shape-rectangle"] svg rect')
    await expect(shapeSvg).toHaveAttribute('fill', '#ff0000')
  })

  test('stroke color picker changes shape stroke color', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    // Change stroke color
    const strokeInput = page.locator('[data-testid="prop-stroke"]')
    await strokeInput.fill('#00ff00')
    await strokeInput.press('Enter')

    // Deselect by clicking empty canvas area
    await page.mouse.click(600, 50)

    // Verify shape SVG stroke changed
    const shapeSvg = page.locator('[data-testid="shape-rectangle"] svg rect')
    await expect(shapeSvg).toHaveAttribute('stroke', '#00ff00')
  })

  test('stroke width control changes shape border thickness', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    // Change stroke width
    const widthInput = page.locator('[data-testid="prop-stroke-width"]')
    await widthInput.fill('4')
    await widthInput.press('Enter')

    // Deselect by clicking empty canvas area
    await page.mouse.click(600, 50)

    // Verify shape SVG stroke-width changed
    const shapeSvg = page.locator('[data-testid="shape-rectangle"] svg rect')
    await expect(shapeSvg).toHaveAttribute('stroke-width', '4')
  })

  test('property panel shows correct values for selected shape', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)

    // Check default values are displayed
    const fillInput = page.locator('[data-testid="prop-fill"]')
    const strokeInput = page.locator('[data-testid="prop-stroke"]')
    const widthInput = page.locator('[data-testid="prop-stroke-width"]')

    await expect(fillInput).toHaveValue('#ffffff')
    await expect(strokeInput).toHaveValue('#4f46e5')
    await expect(widthInput).toHaveValue('1.5')
  })

  test('property panel appears when connector is selected', async ({ page }) => {
    // Create two shapes and connect them
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)

    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    const panel = page.locator('[data-testid="property-panel"]')
    await expect(panel).toBeVisible()
  })

  test('stroke color changes connector color', async ({ page }) => {
    // Create two shapes and connect them
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)

    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Change stroke color
    const strokeInput = page.locator('[data-testid="prop-stroke"]')
    await strokeInput.fill('#ff0000')
    await strokeInput.press('Enter')

    // Deselect by clicking empty canvas area
    await page.mouse.click(600, 50)

    // Verify connector stroke changed
    const connector = canvas.connectors.first()
    await expect(connector).toHaveAttribute('stroke', '#ff0000')
  })

  test('stroke width changes connector thickness', async ({ page }) => {
    // Create two shapes and connect them
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)

    await canvas.selectTool('line')

    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.last()
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    if (!box1 || !box2) throw new Error('No bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    // Select the connector
    await canvas.selectTool('select')
    const midX = (box1.x + box1.width / 2 + box2.x + box2.width / 2) / 2
    const midY = (box1.y + box1.height / 2 + box2.y + box2.height / 2) / 2
    await page.mouse.click(midX, midY)

    // Change stroke width
    const widthInput = page.locator('[data-testid="prop-stroke-width"]')
    await widthInput.fill('5')
    await widthInput.press('Enter')

    // Deselect by clicking empty canvas area
    await page.mouse.click(600, 50)

    // Verify connector stroke-width changed
    const connector = canvas.connectors.first()
    await expect(connector).toHaveAttribute('stroke-width', '5')
  })

  test('property panel updates when switching selection between elements', async ({ page }) => {
    // Create a rectangle
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)

    // Change fill to red
    const fillInput = page.locator('[data-testid="prop-fill"]')
    await fillInput.fill('#ff0000')
    await fillInput.press('Enter')

    // Create an ellipse
    await canvas.selectTool('ellipse')
    await canvas.drawShape(400, 200, 120, 80)

    // The ellipse should now be selected with default fill
    await expect(fillInput).toHaveValue('#ffffff')

    // Click the rectangle to select it
    await canvas.selectTool('select')
    const rect = page.locator('[data-testid="shape-rectangle"]')
    const box = await rect.boundingBox()
    if (!box) throw new Error('No bounding box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

    // Fill should show the red color we set
    await expect(fillInput).toHaveValue('#ff0000')
  })
})
