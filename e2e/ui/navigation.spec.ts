import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Hand tool', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('H key activates hand tool', async ({ page }) => {
    await page.keyboard.press('h')
    await expect(canvas.toolButton('hand')).toHaveClass(/toolbar__btn--active/)
    await expect(canvas.canvas).toHaveClass(/canvas--tool-hand/)
  })

  test('hand tool shows grab cursor', async ({ page }) => {
    await page.keyboard.press('h')
    await expect(canvas.canvas).toHaveCSS('cursor', 'grab')
  })

  test('dragging with hand tool pans canvas', async ({ page }) => {
    const transformBefore = await canvas.getWorldTransform()

    await page.keyboard.press('h')
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()

    const transformAfter = await canvas.getWorldTransform()
    expect(transformAfter).not.toEqual(transformBefore)
  })

  test('clicking a shape in hand mode selects it and switches to select tool', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)

    await page.keyboard.press('h')
    await canvas.shapes.first().click()

    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(canvas.toolButton('select')).toHaveClass(/toolbar__btn--active/)
  })

  test('dragging on empty canvas in hand mode still pans', async ({ page }) => {
    const transformBefore = await canvas.getWorldTransform()

    await page.keyboard.press('h')
    await page.mouse.move(500, 400)
    await page.mouse.down()
    await page.mouse.move(600, 500, { steps: 5 })
    await page.mouse.up()

    const transformAfter = await canvas.getWorldTransform()
    expect(transformAfter).not.toEqual(transformBefore)
  })
})

test.describe('Zoom controls', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('zoom level indicator is visible', async ({ page }) => {
    const indicator = page.locator('[data-testid="zoom-level"]')
    await expect(indicator).toBeVisible()
    await expect(indicator).toContainText('100%')
  })

  test('zoom level updates on scroll wheel', async ({ page }) => {
    await canvas.canvas.dispatchEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300 })

    const indicator = page.locator('[data-testid="zoom-level"]')
    const text = await indicator.textContent()
    expect(text).not.toBe('100%')
  })

  test('Cmd+0 resets zoom to 100%', async ({ page }) => {
    // Zoom in first
    await canvas.canvas.dispatchEvent('wheel', { deltaY: -200, clientX: 400, clientY: 300 })
    await page.keyboard.press('Meta+0')

    const indicator = page.locator('[data-testid="zoom-level"]')
    await expect(indicator).toContainText('100%')
  })

  test('Shift+1 zooms to fit all elements', async ({ page }) => {
    // Create shapes far apart
    await canvas.selectTool('rectangle')
    await canvas.drawShape(50, 50, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(800, 600, 80, 60)

    await page.keyboard.press('Shift+1')

    // Both shapes should be visible in viewport
    const shape1 = canvas.shapes.first()
    const shape2 = canvas.shapes.nth(1)
    const box1 = await shape1.boundingBox()
    const box2 = await shape2.boundingBox()
    const viewport = await page.viewportSize()

    expect(box1!.x).toBeGreaterThanOrEqual(0)
    expect(box2!.x + box2!.width).toBeLessThanOrEqual(viewport!.width)
  })

  test('Shift+2 zooms to fit selection', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(50, 50, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(800, 600, 80, 60)

    // Select only the first shape
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.keyboard.press('Shift+2')

    // First shape should be nicely centered in viewport
    const box = await canvas.shapes.first().boundingBox()
    const viewport = await page.viewportSize()!
    expect(box!.x).toBeGreaterThan(50)
    expect(box!.x).toBeLessThan(viewport!.width / 2)
  })

  test('Cmd+= zooms in', async ({ page }) => {
    const transformBefore = await canvas.getWorldTransform()
    await page.keyboard.press('Meta+=')
    const transformAfter = await canvas.getWorldTransform()
    expect(transformAfter).not.toEqual(transformBefore)
  })

  test('Cmd+- zooms out', async ({ page }) => {
    const transformBefore = await canvas.getWorldTransform()
    await page.keyboard.press('Meta+-')
    const transformAfter = await canvas.getWorldTransform()
    expect(transformAfter).not.toEqual(transformBefore)
  })

  test('zoom has minimum limit', async ({ page }) => {
    // Zoom out many times
    for (let i = 0; i < 30; i++) {
      await canvas.canvas.dispatchEvent('wheel', { deltaY: 200, clientX: 400, clientY: 300 })
    }

    const transform = await canvas.getWorldTransform()
    const match = transform.match(/scale\(([\d.]+)\)/)
    expect(Number(match![1])).toBeGreaterThanOrEqual(0.1)
  })

  test('zoom has maximum limit', async ({ page }) => {
    for (let i = 0; i < 50; i++) {
      await canvas.canvas.dispatchEvent('wheel', { deltaY: -200, clientX: 400, clientY: 300 })
    }

    const transform = await canvas.getWorldTransform()
    const match = transform.match(/scale\(([\d.]+)\)/)
    expect(Number(match![1])).toBeLessThanOrEqual(10)
  })
})

test.describe('Minimap', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('minimap can be toggled visible', async ({ page }) => {
    await expect(page.locator('.minimap')).toHaveCount(0)
    await page.locator('[data-testid="toggle-minimap"]').click()
    await expect(page.locator('.minimap')).toBeVisible()
  })

  test('minimap shows shape positions', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)

    await page.locator('[data-testid="toggle-minimap"]').click()
    // Minimap should contain representations of shapes
    await expect(page.locator('.minimap .minimap__shape')).toHaveCount(1)
  })

  test('clicking minimap pans canvas to that area', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await page.locator('[data-testid="toggle-minimap"]').click()

    const transformBefore = await canvas.getWorldTransform()
    // Click in a different area of the minimap
    await page.locator('.minimap').click({ position: { x: 10, y: 10 } })
    const transformAfter = await canvas.getWorldTransform()

    expect(transformAfter).not.toEqual(transformBefore)
  })

  test('minimap shows viewport indicator', async ({ page }) => {
    await page.locator('[data-testid="toggle-minimap"]').click()
    await expect(page.locator('.minimap .minimap__viewport')).toBeVisible()
  })
})

test.describe('Dark mode', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('dark mode toggle changes canvas background', async ({ page }) => {
    await page.locator('[data-testid="toggle-dark-mode"]').click()
    const bg = await canvas.canvas.evaluate(el => getComputedStyle(el).backgroundColor)
    // Dark mode should have a dark background
    expect(bg).not.toBe('rgb(255, 255, 255)')
  })

  test('shapes remain visible in dark mode', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)

    await page.locator('[data-testid="toggle-dark-mode"]').click()
    await expect(canvas.shapes.first()).toBeVisible()
  })
})
