import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

/**
 * Helpers to create elements and get their state.
 * All tests start from a fresh canvas.
 */

async function drawFreeArrow(page: import('@playwright/test').Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 5 })
  await page.mouse.up()
}

async function drawFreehandPath(page: import('@playwright/test').Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1)
  await page.mouse.down()
  await page.mouse.move(x2, y2, { steps: 15 })
  await page.mouse.up()
}

// ──────────────────────────────────────────────────────────────────────
// Group A: Single-click replaces selection (no shift key)
// ──────────────────────────────────────────────────────────────────────

test.describe('A: Single-click replaces selection', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('A1: click rect2 after rect1 → only rect2 selected', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Click second shape WITHOUT shift
    await canvas.shapes.nth(1).click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    // The second shape should be the selected one
    const selectedId = await page.locator('.shape--selected').getAttribute('data-shape-id')
    const secondId = await canvas.shapes.nth(1).getAttribute('data-shape-id')
    expect(selectedId).toEqual(secondId)
  })

  test('A2: click free arrow after rect → rect deselected, arrow selected', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 300, 400, 500, 400)
    await expect(canvas.connectors).toHaveCount(1)

    // Select the rect
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Click the arrow (no shift)
    const hitArea = page.locator('.canvas__lines .path-hitarea').first()
    await hitArea.click({ force: true })

    // Rect should NOT be selected, arrow should show glow
    await expect(page.locator('.shape--selected')).toHaveCount(0)
    const arrowGlow = page.locator('svg.canvas__lines path[opacity="0.25"]')
    await expect(arrowGlow).toHaveCount(1)
  })

  test('A3: click freehand path after rect → rect deselected, path selected', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 300, 350, 500, 400)
    await expect(canvas.paths).toHaveCount(1)

    // Select the rect
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.shape--selected')).toHaveCount(1)

    // Click the path (no shift)
    const pathHitArea = page.locator('.canvas__paths .path-hitarea').first()
    await pathHitArea.click()

    // Rect should NOT be selected, path should show glow
    await expect(page.locator('.shape--selected')).toHaveCount(0)
    const pathGlow = page.locator('.canvas__paths path[opacity="0.25"]')
    await expect(pathGlow).toHaveCount(1)
  })

  test('A4: click freehand path after free arrow → arrow deselected, path selected', async ({ page }) => {
    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 100, 300, 250, 300)
    await expect(canvas.connectors).toHaveCount(1)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 350, 350, 550, 400)
    await expect(canvas.paths).toHaveCount(1)

    // Select the arrow
    await canvas.selectTool('select')
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true })
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    // Click the path (no shift)
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click()

    // Arrow glow should be gone, path glow should appear
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(0)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(1)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group B: Click-drag moves ONLY the clicked element
// ──────────────────────────────────────────────────────────────────────

test.describe('B: Click-drag moves only the target element', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('B5: click rect then drag arrow → only arrow moves', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 300, 400, 500, 400)

    // Click rect to select it
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const rectBoxBefore = await canvas.shapes.first().boundingBox()

    // Get arrow path before
    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')

    // Click-drag the arrow
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    const arrowBox = await arrowHit.boundingBox()
    if (!arrowBox) throw new Error('No arrow bounding box')
    await page.mouse.move(arrowBox.x + arrowBox.width / 2, arrowBox.y + arrowBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(arrowBox.x + arrowBox.width / 2, arrowBox.y + arrowBox.height / 2 - 100, { steps: 5 })
    await page.mouse.up()

    // Rect should NOT have moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x).toBeCloseTo(rectBoxBefore!.x, 0)
    expect(rectBoxAfter!.y).toBeCloseTo(rectBoxBefore!.y, 0)

    // Arrow SHOULD have moved
    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })

  test('B6: click rect then drag freehand path → only path moves', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 300, 350, 500, 400)

    // Click rect to select it
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const rectBoxBefore = await canvas.shapes.first().boundingBox()

    // Get path bounding box before
    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    // Click-drag the path
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    const pathHitBox = await pathHit.boundingBox()
    if (!pathHitBox) throw new Error('No path bounding box')
    await page.mouse.move(pathHitBox.x + pathHitBox.width / 2, pathHitBox.y + pathHitBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(pathHitBox.x + pathHitBox.width / 2 + 100, pathHitBox.y + pathHitBox.height / 2 + 80, { steps: 5 })
    await page.mouse.up()

    // Rect should NOT have moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x).toBeCloseTo(rectBoxBefore!.x, 0)
    expect(rectBoxAfter!.y).toBeCloseTo(rectBoxBefore!.y, 0)

    // Path SHOULD have visually moved
    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x - pathBoxBefore!.x).toBeGreaterThan(50)
    expect(pathBoxAfter!.y - pathBoxBefore!.y).toBeGreaterThan(30)
  })

  test('B7: click free arrow then drag rect → only rect moves', async ({ page }) => {
    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 300, 400, 500, 400)

    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    // Click arrow to select it
    await canvas.selectTool('select')
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true })

    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')

    // Drag the rect
    const rectBox = await canvas.shapes.first().boundingBox()
    if (!rectBox) throw new Error('No rect bounding box')
    await page.mouse.move(rectBox.x + 40, rectBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBox.x + 140, rectBox.y + 130, { steps: 5 })
    await page.mouse.up()

    // Arrow should NOT have moved
    const dAfter = await connector.getAttribute('d')
    expect(dAfter).toEqual(dBefore)

    // Rect SHOULD have moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBox.x).toBeGreaterThan(50)
  })

  test('B8: click freehand path then drag rect → only rect moves', async ({ page }) => {
    await canvas.selectTool('draw')
    await drawFreehandPath(page, 300, 350, 500, 400)

    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    // Click path to select it
    await canvas.selectTool('select')
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click()

    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    // Drag the rect
    const rectBox = await canvas.shapes.first().boundingBox()
    if (!rectBox) throw new Error('No rect bounding box')
    await page.mouse.move(rectBox.x + 40, rectBox.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBox.x + 140, rectBox.y + 130, { steps: 5 })
    await page.mouse.up()

    // Path should NOT have visually moved
    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x).toBeCloseTo(pathBoxBefore!.x, 0)
    expect(pathBoxAfter!.y).toBeCloseTo(pathBoxBefore!.y, 0)

    // Rect SHOULD have moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBox.x).toBeGreaterThan(50)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group C: Shift-click multi-select + drag moves all
// ──────────────────────────────────────────────────────────────────────

test.describe('C: Shift-click multi-select + drag', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('C9: shift-select rect + arrow, drag rect → both move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 300, 400, 500, 400)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true, modifiers: ['Shift'] })

    // Both should be selected
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')

    // Drag the rect
    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    // Both should have moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })

  test('C10: shift-select rect + path, drag rect → both move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 300, 350, 500, 400)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click({ modifiers: ['Shift'] })

    // Both should be highlighted
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(1)

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    // Drag the rect
    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    // Both should have visually moved
    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x - pathBoxBefore!.x).toBeGreaterThan(50)
  })

  test('C11: Cmd+A with rect + arrow + path, drag rect → all three move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 450, 400, 500)

    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')
    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    // Drag the rect
    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)

    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x - pathBoxBefore!.x).toBeGreaterThan(50)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group D: Marquee select + drag
// ──────────────────────────────────────────────────────────────────────

test.describe('D: Marquee select + drag', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('D12: marquee rect + path, drag rect → both move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 250, 80, 60)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 350, 350, 400)

    // Marquee over both
    await canvas.selectTool('select')
    await page.mouse.move(150, 200)
    await page.mouse.down()
    await page.mouse.move(400, 450, { steps: 5 })
    await page.mouse.up()

    // Both should be selected
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(1)

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    // Drag the rect
    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x - pathBoxBefore!.x).toBeGreaterThan(50)
  })

  test('D13: marquee rect + arrow, drag rect → both move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 250, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 200, 400, 400, 400)

    // Marquee over both
    await canvas.selectTool('select')
    await page.mouse.move(150, 200)
    await page.mouse.down()
    await page.mouse.move(450, 450, { steps: 5 })
    await page.mouse.up()

    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')

    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })

  test('D14: marquee rect + arrow + path, drag rect → all three move', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 250, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 200, 370, 350, 370)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 430, 350, 470)

    // Marquee over all
    await canvas.selectTool('select')
    await page.mouse.move(150, 200)
    await page.mouse.down()
    await page.mouse.move(400, 520, { steps: 5 })
    await page.mouse.up()

    const rectBoxBefore = await canvas.shapes.first().boundingBox()
    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')
    const visiblePath = page.locator('.canvas__paths g path').first()
    const pathBoxBefore = await visiblePath.boundingBox()

    await page.mouse.move(rectBoxBefore!.x + 40, rectBoxBefore!.y + 30)
    await page.mouse.down()
    await page.mouse.move(rectBoxBefore!.x + 140, rectBoxBefore!.y + 130, { steps: 5 })
    await page.mouse.up()

    const rectBoxAfter = await canvas.shapes.first().boundingBox()
    expect(rectBoxAfter!.x - rectBoxBefore!.x).toBeGreaterThan(50)

    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)

    const pathBoxAfter = await visiblePath.boundingBox()
    expect(pathBoxAfter!.x - pathBoxBefore!.x).toBeGreaterThan(50)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group E: Direct single-element drag (no prior selection)
// ──────────────────────────────────────────────────────────────────────

test.describe('E: Direct single-element click-drag', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('E15: click-drag freehand path moves it (raw coordinates, clean canvas)', async ({ page }) => {
    // Draw a nearly-straight horizontal stroke at known coordinates
    await canvas.selectTool('draw')
    await page.mouse.move(200, 350)
    await page.mouse.down()
    await page.mouse.move(400, 350, { steps: 20 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    // Use the visible stroke path's bounding box — reflects actual rendered pixel position
    const visiblePath = page.locator('.canvas__paths g path').first()
    const boxBefore = await visiblePath.boundingBox()

    // Switch to select, click at the KNOWN midpoint — no DOM queries
    await canvas.selectTool('select')
    await page.mouse.move(300, 350)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await visiblePath.boundingBox()
    // Path should have moved up by ~100px (we dragged from y=350 to y=250)
    expect(boxAfter!.y).toBeLessThan(boxBefore!.y - 50)
  })

  test('E15b: select path first, then drag in separate gesture (raw coordinates)', async ({ page }) => {
    // Draw a straight-ish horizontal stroke at known coordinates
    await canvas.selectTool('draw')
    await page.mouse.move(200, 350)
    await page.mouse.down()
    await page.mouse.move(400, 350, { steps: 20 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)

    // Switch to select, click to select the path first
    await canvas.selectTool('select')
    await page.mouse.click(300, 350)

    // Verify path is selected (glow visible)
    const glow = page.locator('.canvas__paths path[opacity="0.25"]')
    await expect(glow).toHaveCount(1)

    const visiblePath = page.locator('.canvas__paths g path').first()
    const boxBefore = await visiblePath.boundingBox()

    // Now separate drag gesture on the selected path
    await page.mouse.move(300, 350)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 5 })
    await page.mouse.up()

    // Path should have visually moved up by ~100px
    const boxAfter = await visiblePath.boundingBox()
    expect(boxAfter!.y).toBeLessThan(boxBefore!.y - 50)
  })

  test('E15c: click-drag freehand path after zooming canvas (raw coordinates)', async ({ page }) => {
    // Zoom in first — Ctrl+scroll to zoom
    await page.mouse.move(400, 300)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -200)  // zoom in
    await page.keyboard.up('Control')
    await page.waitForTimeout(200)

    // Draw a path at known screen coordinates (world coords will differ due to zoom)
    await canvas.selectTool('draw')
    await page.mouse.move(250, 350)
    await page.mouse.down()
    await page.mouse.move(450, 350, { steps: 20 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    const visiblePath = page.locator('.canvas__paths g path').first()
    const boxBefore = await visiblePath.boundingBox()

    // Switch to select, click at the SAME screen coordinates where the path is visible
    await canvas.selectTool('select')
    await page.mouse.move(350, 350)
    await page.mouse.down()
    await page.mouse.move(350, 250, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await visiblePath.boundingBox()
    expect(boxAfter!.y).toBeLessThan(boxBefore!.y - 30)
  })

  test('E15d: click-drag freehand path after panning canvas (raw coordinates)', async ({ page }) => {
    // Pan canvas using hand tool
    await canvas.selectTool('hand')
    await page.mouse.move(400, 300)
    await page.mouse.down()
    await page.mouse.move(300, 200, { steps: 5 })  // pan 100px left and 100px up
    await page.mouse.up()

    // Draw a path at known screen coordinates
    await canvas.selectTool('draw')
    await page.mouse.move(250, 350)
    await page.mouse.down()
    await page.mouse.move(450, 350, { steps: 20 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    const visiblePath = page.locator('.canvas__paths g path').first()
    const boxBefore = await visiblePath.boundingBox()

    // Switch to select, click at the screen midpoint where the stroke was drawn
    await canvas.selectTool('select')
    await page.mouse.move(350, 350)
    await page.mouse.down()
    await page.mouse.move(350, 250, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await visiblePath.boundingBox()
    expect(boxAfter!.y).toBeLessThan(boxBefore!.y - 50)
  })

  test('E15e: click-drag freehand path with other elements on canvas (raw coordinates)', async ({ page }) => {
    // Create a shape and an arrow first — realistic canvas
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 120, 80)

    await canvas.selectTool('arrow')
    await page.mouse.move(500, 200)
    await page.mouse.down()
    await page.mouse.move(600, 200, { steps: 5 })
    await page.mouse.up()

    // Now draw a freehand path at known coordinates
    await canvas.selectTool('draw')
    await page.mouse.move(200, 350)
    await page.mouse.down()
    await page.mouse.move(400, 350, { steps: 20 })
    await page.mouse.up()

    await expect(canvas.paths).toHaveCount(1)
    const visiblePath = page.locator('.canvas__paths g path').first()
    const boxBefore = await visiblePath.boundingBox()

    // Switch to select, click at the KNOWN midpoint — no DOM queries
    await canvas.selectTool('select')
    await page.mouse.move(300, 350)
    await page.mouse.down()
    await page.mouse.move(300, 250, { steps: 5 })
    await page.mouse.up()

    // Path should have visually moved up by ~100px
    const boxAfter = await visiblePath.boundingBox()
    expect(boxAfter!.y).toBeLessThan(boxBefore!.y - 50)
  })

  test('E16: click-drag free arrow moves it', async ({ page }) => {
    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 200, 300, 400, 300)
    await expect(canvas.connectors).toHaveCount(1)

    const connector = page.locator('.canvas__lines path.connector').first()
    const dBefore = await connector.getAttribute('d')

    // Switch to select, then click-drag the arrow in one gesture
    await canvas.selectTool('select')
    const hitArea = page.locator('.canvas__lines .path-hitarea').first()
    const box = await hitArea.boundingBox()
    if (!box) throw new Error('No arrow bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 100, { steps: 5 })
    await page.mouse.up()

    const dAfter = await connector.getAttribute('d')
    expect(dAfter).not.toEqual(dBefore)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group F: Selection visual feedback lifecycle
// ──────────────────────────────────────────────────────────────────────

test.describe('F: Selection glow lifecycle', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('F17: select path then click empty canvas → glow disappears', async ({ page }) => {
    await canvas.selectTool('draw')
    await drawFreehandPath(page, 250, 350, 450, 400)

    await canvas.selectTool('select')
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click()
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(1)

    // Click empty canvas
    await page.mouse.click(600, 50)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(0)
  })

  test('F18: select arrow then click empty canvas → glow disappears', async ({ page }) => {
    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 200, 300, 400, 300)

    await canvas.selectTool('select')
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true })
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    // Click empty canvas
    await page.mouse.click(600, 50)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(0)
  })

  test('F19: shift-click rect + path + arrow → all three highlighted', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 450, 400, 500)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true, modifiers: ['Shift'] })
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click({ modifiers: ['Shift'] })

    // All three should show their respective highlights
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(1)
  })

  test('F20: all three highlighted then click empty canvas → all gone', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 450, 400, 500)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true, modifiers: ['Shift'] })
    const pathHit = page.locator('.canvas__paths .path-hitarea').first()
    await pathHit.click({ modifiers: ['Shift'] })

    // Click empty canvas
    await page.mouse.click(600, 50)

    // All highlights should be gone
    await expect(page.locator('.shape--selected')).toHaveCount(0)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(0)
    await expect(page.locator('.canvas__paths path[opacity="0.25"]')).toHaveCount(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group G: Delete across types
// ──────────────────────────────────────────────────────────────────────

test.describe('G: Delete across element types', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('G21: Cmd+A then Delete removes rect + arrow + path', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 450, 400, 500)

    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Delete')

    await expect(canvas.shapes).toHaveCount(0)
    await expect(canvas.connectors).toHaveCount(0)
    await expect(canvas.paths).toHaveCount(0)
  })

  test('G22: shift-select rect + arrow, Delete → path survives', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('draw')
    await drawFreehandPath(page, 200, 450, 400, 500)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true, modifiers: ['Shift'] })

    await page.keyboard.press('Delete')

    await expect(canvas.shapes).toHaveCount(0)
    await expect(canvas.connectors).toHaveCount(0)
    // Path should still be there
    await expect(canvas.paths).toHaveCount(1)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Group H: Selection persists during drag operations
// ──────────────────────────────────────────────────────────────────────

test.describe('H: Selection persists during drag', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('H23: multi-select 2 rects, mousedown → both still highlighted', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(300, 200, 80, 60)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Start drag on first shape (mousedown only)
    const box = await canvas.shapes.first().boundingBox()
    await page.mouse.move(box!.x + 40, box!.y + 30)
    await page.mouse.down()

    // Both should still be highlighted
    await expect(page.locator('.shape--selected')).toHaveCount(2)

    // Finish drag
    await page.mouse.move(box!.x + 140, box!.y + 130, { steps: 5 })
    await page.mouse.up()

    // Both should STILL be highlighted after drag
    await expect(page.locator('.shape--selected')).toHaveCount(2)
  })

  test('H24: multi-select rect + arrow, mousedown on rect → both highlights persist', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)

    await canvas.selectTool('arrow')
    await drawFreeArrow(page, 250, 350, 400, 350)

    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    const arrowHit = page.locator('.canvas__lines .path-hitarea').first()
    await arrowHit.click({ force: true, modifiers: ['Shift'] })

    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    // Start drag on the rect
    const box = await canvas.shapes.first().boundingBox()
    await page.mouse.move(box!.x + 40, box!.y + 30)
    await page.mouse.down()

    // Both should still be highlighted
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)

    // Finish drag
    await page.mouse.move(box!.x + 140, box!.y + 130, { steps: 5 })
    await page.mouse.up()

    // Both should STILL be highlighted after drag
    await expect(page.locator('.shape--selected')).toHaveCount(1)
    await expect(page.locator('svg.canvas__lines path[opacity="0.25"]')).toHaveCount(1)
  })
})
