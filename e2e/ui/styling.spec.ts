import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Color picker', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
  })

  test('fill color shows palette swatches', async ({ page }) => {
    const swatches = page.locator('.property-panel .color-picker--fill .color-swatch')
    const count = await swatches.count()
    expect(count).toBeGreaterThanOrEqual(12)
  })

  test('clicking a fill swatch changes shape fill', async ({ page }) => {
    const swatch = page.locator('.property-panel .color-picker--fill .color-swatch').nth(2)
    const color = await swatch.getAttribute('data-color')
    await swatch.click()

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    await expect(rect).toHaveAttribute('fill', color!)
  })

  test('transparent fill option exists and works', async ({ page }) => {
    const transparentBtn = page.locator('.property-panel .color-picker--fill [data-color="transparent"]')
    await transparentBtn.click()

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    const fill = await rect.getAttribute('fill')
    expect(fill === 'transparent' || fill === 'none').toBeTruthy()
  })

  test('custom hex input works for fill', async ({ page }) => {
    const hexInput = page.locator('.property-panel .color-picker--fill input[type="text"]')
    await hexInput.fill('#e74c3c')
    await hexInput.press('Enter')

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    await expect(rect).toHaveAttribute('fill', '#e74c3c')
  })

  test('stroke color shows palette swatches', async ({ page }) => {
    const swatches = page.locator('.property-panel .color-picker--stroke .color-swatch')
    const count = await swatches.count()
    expect(count).toBeGreaterThanOrEqual(12)
  })

  test('clicking a stroke swatch changes shape stroke', async ({ page }) => {
    const swatch = page.locator('.property-panel .color-picker--stroke .color-swatch').nth(3)
    const color = await swatch.getAttribute('data-color')
    await swatch.click()

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    await expect(rect).toHaveAttribute('stroke', color!)
  })

  test('recently used colors appear in picker', async ({ page }) => {
    const hexInput = page.locator('.property-panel .color-picker--fill input[type="text"]')
    await hexInput.fill('#abcdef')
    await hexInput.press('Enter')

    // Deselect, create new shape, select it
    await page.mouse.click(600, 50)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 120, 80)

    const recentSwatch = page.locator('.property-panel .color-picker--fill [data-color="#abcdef"]')
    await expect(recentSwatch).toHaveCount(1)
  })
})

test.describe('Stroke styles', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
  })

  test('stroke style selector shows solid/dashed/dotted options', async ({ page }) => {
    const options = page.locator('.property-panel [data-testid="stroke-style"] option')
    const values = await options.allTextContents()
    expect(values).toContain('Solid')
    expect(values).toContain('Dashed')
    expect(values).toContain('Dotted')
  })

  test('dashed stroke style applies to shape', async ({ page }) => {
    await page.locator('.property-panel [data-testid="stroke-style"]').selectOption('dashed')

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    const dashArray = await rect.getAttribute('stroke-dasharray')
    expect(dashArray).toBeTruthy()
    expect(dashArray).not.toBe('none')
  })

  test('dotted stroke style applies to shape', async ({ page }) => {
    await page.locator('.property-panel [data-testid="stroke-style"]').selectOption('dotted')

    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.first().locator('rect')
    const dashArray = await rect.getAttribute('stroke-dasharray')
    expect(dashArray).toBeTruthy()
  })

  test('dashed stroke style applies to connector', async ({ page }) => {
    // Create connected shapes
    await page.keyboard.press('Escape')
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 80, 60)
    await canvas.selectTool('line')
    await page.mouse.move(320, 240)
    await page.mouse.down()
    await page.mouse.move(400, 230, { steps: 5 })
    await page.mouse.up()

    // Select connector
    await canvas.selectTool('select')
    await canvas.connectors.first().click()
    await page.locator('.property-panel [data-testid="stroke-style"]').selectOption('dashed')

    await page.mouse.click(600, 50)
    const path = canvas.connectorPaths.first()
    const dashArray = await path.getAttribute('stroke-dasharray')
    expect(dashArray).toBeTruthy()
  })

  test('stroke width presets (thin/medium/bold) work', async ({ page }) => {
    const presets = page.locator('.property-panel [data-testid="stroke-width-preset"]')
    await expect(presets).toHaveCount(3) // thin, medium, bold

    // Click bold
    await presets.last().click()
    await page.mouse.click(600, 50)
    const rect = canvas.shapes.first().locator('rect')
    const sw = Number(await rect.getAttribute('stroke-width'))
    expect(sw).toBeGreaterThanOrEqual(3)
  })
})

test.describe('Opacity', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
  })

  test('opacity slider is shown in property panel', async ({ page }) => {
    const slider = page.locator('.property-panel input[data-testid="opacity"]')
    await expect(slider).toBeVisible()
  })

  test('opacity slider defaults to 100%', async ({ page }) => {
    const slider = page.locator('.property-panel input[data-testid="opacity"]')
    await expect(slider).toHaveValue('100')
  })

  test('changing opacity applies to shape', async ({ page }) => {
    const slider = page.locator('.property-panel input[data-testid="opacity"]')
    await slider.fill('50')

    const shape = canvas.shapes.first()
    await expect(shape).toHaveCSS('opacity', '0.5')
  })

  test('opacity applies to connectors', async ({ page }) => {
    await page.keyboard.press('Escape')
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 200, 80, 60)
    await canvas.selectTool('line')
    await page.mouse.move(320, 240)
    await page.mouse.down()
    await page.mouse.move(400, 230, { steps: 5 })
    await page.mouse.up()

    await canvas.selectTool('select')
    await canvas.connectors.first().click()
    const slider = page.locator('.property-panel input[data-testid="opacity"]')
    await slider.fill('30')

    const connector = canvas.connectorPaths.first()
    const opacity = await connector.getAttribute('opacity')
    expect(Number(opacity)).toBeCloseTo(0.3, 1)
  })
})

test.describe('Style workflow', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('copy style + paste style transfers fill/stroke between shapes', async ({ page }) => {
    // Create source shape with custom style
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const fillInput = page.locator('.property-panel .color-picker--fill input[type="text"]')
    await fillInput.fill('#ff0000')
    await fillInput.press('Enter')

    // Copy style
    await page.keyboard.press('Meta+Shift+c')

    // Create target shape
    await page.mouse.click(600, 50)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.nth(1).click()

    // Paste style
    await page.keyboard.press('Meta+Shift+v')
    await page.mouse.click(600, 50)

    const rect = canvas.shapes.nth(1).locator('rect')
    await expect(rect).toHaveAttribute('fill', '#ff0000')
  })

  test('new shapes use the last-used fill and stroke colors', async ({ page }) => {
    // Create first shape and change its color
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 100, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const fillInput = page.locator('.property-panel .color-picker--fill input[type="text"]')
    await fillInput.fill('#3498db')
    await fillInput.press('Enter')

    // Create second shape
    await page.mouse.click(600, 50)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 100, 80)

    // New shape should inherit the last-used fill
    await page.mouse.click(600, 50) // deselect
    const rect = canvas.shapes.nth(1).locator('rect')
    await expect(rect).toHaveAttribute('fill', '#3498db')
  })

  test('corner radius control adjusts shape roundness', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const radiusInput = page.locator('.property-panel input[data-testid="corner-radius"]')
    await radiusInput.fill('12')
    await radiusInput.press('Enter')

    await page.mouse.click(600, 50)
    const rect = canvas.shapes.first().locator('rect')
    await expect(rect).toHaveAttribute('rx', '12')
  })

  test('shadow toggle removes drop shadow from shape (default is on)', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Shadow is on by default
    const shape = canvas.shapes.first()
    const filterBefore = await shape.evaluate(el => getComputedStyle(el).filter)
    expect(filterBefore).toContain('drop-shadow')

    // Toggle shadow off
    const shadowToggle = page.locator('.property-panel [data-testid="shadow-toggle"]')
    await shadowToggle.click()

    const filterAfter = await shape.evaluate(el => getComputedStyle(el).filter)
    expect(filterAfter === 'none' || !filterAfter.includes('drop-shadow')).toBeTruthy()
  })
})
