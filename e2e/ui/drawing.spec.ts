import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Freehand drawing', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('draw tool creates a path on the canvas', async ({ page }) => {
    await canvas.selectTool('draw')

    // Draw a stroke across the canvas
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 15 })
    await page.mouse.move(400, 200, { steps: 15 })
    await page.mouse.up()

    // A visible path should appear in the paths SVG layer
    await expect(canvas.paths).toHaveCount(1)
  })

  test('draw tool works over existing shapes', async ({ page }) => {
    // Create a shape first
    await canvas.selectTool('rectangle')
    await canvas.drawShape(150, 150, 200, 150)

    // Now draw over it
    await canvas.selectTool('draw')
    await page.mouse.move(100, 200)
    await page.mouse.down()
    await page.mouse.move(250, 225, { steps: 15 })
    await page.mouse.move(400, 200, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    // Shape should still exist
    await expect(canvas.shapes).toHaveCount(1)
  })

  test('short draw (fewer than 2 points) does not create a path', async ({ page }) => {
    await canvas.selectTool('draw')

    // Just a click, no real drag
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(0)
  })

  test('freehand path uses blue stroke by default', async ({ page }) => {
    await canvas.selectTool('draw')

    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(350, 250, { steps: 15 })
    await page.mouse.up()

    const pathEl = canvas.paths.first()
    await expect(pathEl).toHaveAttribute('stroke', '#4465e9')
  })

  test('freehand path shows selection glow when selected', async ({ page }) => {
    // Draw a path
    await canvas.selectTool('draw')
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(350, 250, { steps: 15 })
    await page.mouse.up()

    // Click on the path's hit area to select it
    await canvas.selectTool('select')
    const hitArea = page.locator('.canvas__paths .path-hitarea').first()
    await hitArea.click()

    // Should show an orange glow path behind the selected path
    const glowPath = page.locator('.canvas__paths path[opacity="0.25"]')
    await expect(glowPath).toHaveCount(1)
    await expect(glowPath).toHaveAttribute('stroke', '#f59e0b')
  })

  test('freehand path moves with multi-select drag', async ({ page }) => {
    // Create a shape and a freehand path
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 80, 60)

    await canvas.selectTool('draw')
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(400, 350, { steps: 15 })
    await page.mouse.up()

    // Get path's initial position via its transform
    const pathGroup = page.locator('.canvas__paths g').first()
    const transformBefore = await pathGroup.getAttribute('transform')

    // Select all (shape + path)
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')

    // Drag the shape — path should move along
    const box = await canvas.shapes.first().boundingBox()
    if (!box) throw new Error('No bounding box')
    await page.mouse.move(box.x + 40, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + 140, box.y + 130, { steps: 5 })
    await page.mouse.up()

    // Path group's transform should have changed
    const transformAfter = await pathGroup.getAttribute('transform')
    expect(transformAfter).not.toEqual(transformBefore)
  })

  test('marquee-select then drag moves a freehand path', async ({ page }) => {
    // Draw a freehand scribble in the middle of the canvas (past y=150
    // where SVG default viewport would end)
    await canvas.selectTool('draw')
    await page.mouse.move(250, 350)
    await page.mouse.down()
    await page.mouse.move(450, 400, { steps: 15 })
    await page.mouse.up()

    // Parse initial translate
    const pathGroup = page.locator('.canvas__paths g').first()
    const tBefore = await pathGroup.getAttribute('transform')
    const matchBefore = tBefore!.match(/translate\(([\d.-]+),([\d.-]+)\)/)
    const xBefore = parseFloat(matchBefore![1])
    const yBefore = parseFloat(matchBefore![2])

    // Marquee-select the scribble
    await canvas.selectTool('select')
    await page.mouse.move(200, 300)
    await page.mouse.down()
    await page.mouse.move(500, 450, { steps: 5 })
    await page.mouse.up()

    // Verify selected (glow visible)
    const glow = page.locator('.canvas__paths path[opacity="0.25"]')
    await expect(glow).toHaveCount(1)

    // Now drag the scribble using raw mouse coords at the path's center
    // (this is how the user would do it — mousedown on the path, drag)
    await page.mouse.move(350, 375)
    await page.mouse.down()
    await page.mouse.move(350 + 120, 375 + 90, { steps: 5 })
    await page.mouse.up()

    // Path should have moved by approximately 120, 90
    const tAfter = await pathGroup.getAttribute('transform')
    const matchAfter = tAfter!.match(/translate\(([\d.-]+),([\d.-]+)\)/)
    const xAfter = parseFloat(matchAfter![1])
    const yAfter = parseFloat(matchAfter![2])
    expect(xAfter - xBefore).toBeGreaterThan(80)
    expect(yAfter - yBefore).toBeGreaterThan(60)
  })

  test('marquee selection includes freehand paths', async ({ page }) => {
    // Draw a path in a known area
    await canvas.selectTool('draw')
    await page.mouse.move(200, 200)
    await page.mouse.down()
    await page.mouse.move(350, 250, { steps: 15 })
    await page.mouse.up()

    // Marquee drag that covers the path
    await canvas.selectTool('select')
    await page.mouse.move(150, 150)
    await page.mouse.down()
    await page.mouse.move(400, 300, { steps: 5 })
    await page.mouse.up()

    // Path should show selection glow
    const glowPath = page.locator('.canvas__paths path[opacity="0.25"]')
    await expect(glowPath).toHaveCount(1)
  })

  test('marquee selection includes free-floating arrows', async ({ page }) => {
    // Draw a free-floating arrow
    await canvas.selectTool('arrow')
    await page.mouse.move(200, 300)
    await page.mouse.down()
    await page.mouse.move(400, 300, { steps: 5 })
    await page.mouse.up()
    await expect(canvas.connectors).toHaveCount(1)

    // Marquee drag that covers the arrow
    await canvas.selectTool('select')
    await page.mouse.move(150, 250)
    await page.mouse.down()
    await page.mouse.move(450, 350, { steps: 5 })
    await page.mouse.up()

    // Arrow should show selection glow
    const glowPath = page.locator('svg.canvas__lines path[opacity="0.25"]')
    await expect(glowPath).toHaveCount(1)
  })

  test('click-drag on a free-floating arrow moves it', async ({ page }) => {
    // Draw a free-floating arrow
    await canvas.selectTool('arrow')
    await page.mouse.move(200, 300)
    await page.mouse.down()
    await page.mouse.move(400, 300, { steps: 5 })
    await page.mouse.up()
    await expect(canvas.connectors).toHaveCount(1)

    // Get initial path
    const connector = canvas.connectors.first()
    const dBefore = await connector.getAttribute('d')

    // Select arrow then drag it
    await canvas.selectTool('select')
    const hitArea = page.locator('.canvas__lines .path-hitarea').first()
    await hitArea.click({ force: true })

    // Verify selected
    const glow = page.locator('svg.canvas__lines path[opacity="0.25"]')
    await expect(glow).toHaveCount(1)

    // Drag it upward
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 5 })
    await page.mouse.up()

    // Arrow path data should have changed
    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })

  test('draw tool stays active for multiple strokes', async ({ page }) => {
    await canvas.selectTool('draw')

    // First stroke
    await page.mouse.move(100, 100)
    await page.mouse.down()
    await page.mouse.move(200, 150, { steps: 15 })
    await page.mouse.up()

    // Second stroke (draw tool should still be active)
    await page.mouse.move(100, 300)
    await page.mouse.down()
    await page.mouse.move(200, 350, { steps: 15 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(2)
    // Draw tool should remain active (unlike shape tools which auto-switch)
    await expect(canvas.toolButton('draw')).toHaveClass(/toolbar__btn--active/)
  })
})
