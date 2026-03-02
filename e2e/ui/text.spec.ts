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

test.describe('Text element fill and stroke', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('stroke color controls the text color', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Red text')
    await page.mouse.click(600, 50) // deselect / stop editing

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()

    // Change stroke to red — this should change the text color
    const strokeInput = page.locator('[data-testid="prop-stroke"] input[type="color"]')
    await strokeInput.fill('#ff0000')

    // Deselect to avoid selected-state style overrides, then check
    await page.mouse.click(600, 50)
    const textarea = page.locator('[data-testid="text-element"] textarea')
    await expect(textarea).toHaveCSS('color', 'rgb(255, 0, 0)')
  })

  test.fixme('fill color controls the text background', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Yellow bg')
    await page.mouse.click(600, 50) // deselect / stop editing

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()

    // Change fill to yellow — this should set the background color
    const fillInput = page.locator('[data-testid="prop-fill"] input[type="color"]')
    await fillInput.fill('#ffff00')

    await page.mouse.click(600, 50)
    const el = page.locator('[data-testid="text-element"]')
    await expect(el).toHaveCSS('background-color', 'rgb(255, 255, 0)')
  })

  test.fixme('default text element has no background', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('No bg')
    await page.mouse.click(600, 50)

    // Default fill is transparent/none — background should be transparent
    const el = page.locator('[data-testid="text-element"]')
    const bgColor = await el.evaluate((e) => getComputedStyle(e).backgroundColor)
    // Should be transparent (rgba(0,0,0,0)) or no background
    expect(bgColor).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)|transparent/)
  })
})

test.describe('Text element resize', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('selected text element shows 8 resize handles', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Resize me')
    await page.mouse.click(600, 50) // deselect / stop editing

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()

    await expect(page.locator('[data-testid="text-element"] .resize-handle')).toHaveCount(8)
  })

  test('dragging SE resize handle changes text element size', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Resize me')
    await page.mouse.click(600, 50) // deselect / stop editing

    await canvas.selectTool('select')
    const el = page.locator('[data-testid="text-element"]')
    await el.click()
    const boxBefore = await el.boundingBox()

    const handle = page.locator('[data-testid="text-element"] [data-handle="se"]')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + 104, handleBox!.y + 54, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await el.boundingBox()
    expect(boxAfter!.width).toBeGreaterThan(boxBefore!.width)
    expect(boxAfter!.height).toBeGreaterThan(boxBefore!.height)
  })

  test.fixme('text reflows when text element is resized narrower', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('This is a long sentence that should reflow when the box is narrower')
    await page.mouse.click(600, 50)

    await canvas.selectTool('select')
    const el = page.locator('[data-testid="text-element"]')
    await el.click()
    const textarea = el.locator('textarea')
    const heightBefore = (await textarea.boundingBox())!.height

    // Drag the E (east) handle inward to make it narrower
    const handle = page.locator('[data-testid="text-element"] [data-handle="e"]')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x - 80, handleBox!.y + 4, { steps: 5 })
    await page.mouse.up()

    // Text should reflow taller when the element is narrower
    const heightAfter = (await textarea.boundingBox())!.height
    expect(heightAfter).toBeGreaterThan(heightBefore)
  })
})

test.describe('Text element vertical alignment', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('vertical alignment buttons appear for selected text element', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Align me')
    await page.mouse.click(600, 50)

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()

    await expect(page.locator('.property-panel [data-testid="valign-top"]')).toBeVisible()
    await expect(page.locator('.property-panel [data-testid="valign-middle"]')).toBeVisible()
    await expect(page.locator('.property-panel [data-testid="valign-bottom"]')).toBeVisible()
  })

  test('vertical alignment visually moves text within text element', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Hello')
    await page.mouse.click(600, 50)

    await canvas.selectTool('select')
    const el = page.locator('[data-testid="text-element"]')
    await el.click()

    // Make the text element tall enough that vertical alignment is visible
    // by dragging the S (south) handle down
    const handle = page.locator('[data-testid="text-element"] [data-handle="s"]')
    const handleBox = await handle.boundingBox()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 4)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + 4, handleBox!.y + 150, { steps: 5 })
    await page.mouse.up()

    // Re-select after resize
    await el.click()
    const textarea = el.locator('textarea')

    // Set to top alignment
    await page.locator('.property-panel [data-testid="valign-top"]').click()
    const topBox = await textarea.boundingBox()

    // Set to bottom alignment
    await page.locator('.property-panel [data-testid="valign-bottom"]').click()
    const bottomBox = await textarea.boundingBox()

    // Top alignment should position textarea higher than bottom
    expect(topBox!.y).toBeLessThan(bottomBox!.y)
  })

  test('default vertical alignment for text element is top', async ({ page }) => {
    await page.keyboard.press('t')
    await page.mouse.click(300, 300)
    await page.keyboard.type('Top aligned')
    await page.mouse.click(600, 50)

    await canvas.selectTool('select')
    await page.locator('[data-testid="text-element"]').click()

    // The 'top' button should be active by default for text elements
    const topBtn = page.locator('.property-panel [data-testid="valign-top"]')
    await expect(topBtn).toHaveClass(/property-panel__btn--active/)
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
