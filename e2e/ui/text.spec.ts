import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Text tool', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('T key activates text tool', async ({ page }) => {
    await page.keyboard.press('t')
    await expect(canvas.toolButton('text')).toHaveClass(/toolbar__btn--active/)
  })

  test('clicking canvas with text tool creates text element', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)

    await expect(page.locator('[data-testid="text-element"]')).toHaveCount(1)
  })

  test('text element starts in edit mode immediately', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)

    const textarea = page.locator('[data-testid="text-element"] textarea')
    await expect(textarea).toBeFocused()
  })

  test('typing updates the text element content', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Hello world')

    const textarea = page.locator('[data-testid="text-element"] textarea')
    await expect(textarea).toHaveValue('Hello world')
  })

  test('text element has no visible border', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Borderless')
    await page.keyboard.press('Escape')

    // Text elements should not have a shape outline SVG
    const el = page.locator('[data-testid="text-element"]')
    await expect(el.locator('svg')).toHaveCount(0)
  })

  test('text element can be moved with select tool', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Movable')
    await page.keyboard.press('Escape')

    await canvas.selectTool('select')
    const el = page.locator('[data-testid="text-element"]')
    const boxBefore = await el.boundingBox()

    await el.click()
    await page.mouse.move(boxBefore!.x + 20, boxBefore!.y + 10)
    await page.mouse.down()
    await page.mouse.move(boxBefore!.x + 120, boxBefore!.y + 110, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await el.boundingBox()
    expect(boxAfter!.x).toBeGreaterThan(boxBefore!.x)
    expect(boxAfter!.y).toBeGreaterThan(boxBefore!.y)
  })

  test('text element can be deleted', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Delete me')
    await page.keyboard.press('Escape')

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()
    await page.keyboard.press('Delete')

    await expect(page.locator('[data-testid="text-element"]')).toHaveCount(0)
  })

  test('empty text element is removed on blur', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    // Don't type anything, just click away
    await page.mouse.click(600, 50)

    await expect(page.locator('[data-testid="text-element"]')).toHaveCount(0)
  })
})

test.describe('Text formatting', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('font family can be changed in property panel', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 150, 100)
    await canvas.shapes.first().dblclick()
    await page.keyboard.type('Styled text')
    await page.keyboard.press('Escape')

    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const fontSelect = page.locator('.property-panel select[data-testid="font-family"]')
    await fontSelect.selectOption('monospace')

    const textarea = canvas.shapes.first().locator('textarea')
    await expect(textarea).toHaveCSS('font-family', /monospace/)
  })

  test('font size can be changed in property panel', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 150, 100)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const sizeInput = page.locator('.property-panel input[data-testid="font-size"]')
    await sizeInput.fill('24')
    await sizeInput.press('Enter')

    const textarea = canvas.shapes.first().locator('textarea')
    await expect(textarea).toHaveCSS('font-size', '24px')
  })

  test('text horizontal alignment can be set', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 150, 100)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const alignBtn = page.locator('.property-panel [data-testid="text-align-right"]')
    await alignBtn.click()

    const textarea = canvas.shapes.first().locator('textarea')
    await expect(textarea).toHaveCSS('text-align', 'right')
  })

  test('text vertical alignment can be set', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 150, 100)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const alignBtn = page.locator('.property-panel [data-testid="valign-bottom"]')
    await alignBtn.click()

    // vertical alignment via justify-content on flex container
    const parent = canvas.shapes.first().locator('.shape__text-container')
    await expect(parent).toHaveCSS('justify-content', 'flex-end')
  })

  test('vertical alignment visually moves text position', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 150, 120)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Type some text so we can measure its position
    await canvas.shapes.first().dblclick()
    await page.keyboard.type('Hello')
    await page.mouse.click(600, 50) // deselect to stop editing
    await canvas.shapes.first().click()

    // Get textarea position with default 'middle' alignment
    const textarea = canvas.shapes.first().locator('textarea')
    const middleBox = await textarea.boundingBox()
    if (!middleBox) throw new Error('No bounding box')

    // Change to 'top'
    await page.locator('.property-panel [data-testid="valign-top"]').click()
    const topBox = await textarea.boundingBox()
    if (!topBox) throw new Error('No bounding box')

    // Change to 'bottom'
    await page.locator('.property-panel [data-testid="valign-bottom"]').click()
    const bottomBox = await textarea.boundingBox()
    if (!bottomBox) throw new Error('No bounding box')

    // Top alignment should position textarea higher than bottom alignment
    expect(topBox.y).toBeLessThan(bottomBox.y)
  })
})
