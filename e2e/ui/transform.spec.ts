import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Rotation', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
  })

  test.fixme('selected shape shows rotation handle above bounding box', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const rotationHandle = page.locator('.rotation-handle')
    await expect(rotationHandle).toBeVisible()

    // Handle should be above the shape
    const handleBox = await rotationHandle.boundingBox()
    const shapeBox = await canvas.shapes.first().boundingBox()
    expect(handleBox!.y).toBeLessThan(shapeBox!.y)
  })

  test.fixme('dragging rotation handle rotates shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const handle = page.locator('.rotation-handle')
    const handleBox = await handle.boundingBox()

    await page.mouse.move(handleBox!.x + 5, handleBox!.y + 5)
    await page.mouse.down()
    // Drag to the right to rotate clockwise
    await page.mouse.move(handleBox!.x + 80, handleBox!.y + 40, { steps: 10 })
    await page.mouse.up()

    const shape = canvas.shapes.first()
    const transform = await shape.evaluate(el => (el as HTMLElement).style.transform)
    expect(transform).toContain('rotate')
  })

  test.fixme('Shift constrains rotation to 15-degree increments', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const handle = page.locator('.rotation-handle')
    const handleBox = await handle.boundingBox()

    await page.keyboard.down('Shift')
    await page.mouse.move(handleBox!.x + 5, handleBox!.y + 5)
    await page.mouse.down()
    await page.mouse.move(handleBox!.x + 80, handleBox!.y + 40, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const shape = canvas.shapes.first()
    const transform = await shape.evaluate(el => (el as HTMLElement).style.transform)
    const match = transform.match(/rotate\(([\d.-]+)deg\)/)
    const angle = Number(match![1])
    expect(angle % 15).toBe(0)
  })

  test.fixme('rotation value shown in property panel', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const rotationInput = page.locator('.property-panel input[data-testid="rotation"]')
    await expect(rotationInput).toHaveValue('0')
  })

  test.fixme('typing rotation value in property panel rotates shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const rotationInput = page.locator('.property-panel input[data-testid="rotation"]')
    await rotationInput.fill('45')
    await rotationInput.press('Enter')

    const shape = canvas.shapes.first()
    const transform = await shape.evaluate(el => (el as HTMLElement).style.transform)
    expect(transform).toContain('rotate(45deg)')
  })

  test.fixme('rotation handle disappears when not in select mode', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await expect(page.locator('.rotation-handle')).toBeVisible()

    await canvas.selectTool('rectangle')
    await expect(page.locator('.rotation-handle')).toHaveCount(0)
  })
})

test.describe('Flip', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a diamond (asymmetric along one axis to test flip)
    await canvas.selectTool('diamond')
    await canvas.drawShape(200, 200, 100, 80)
  })

  test.fixme('flip horizontal mirrors shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.locator('[data-testid="flip-h"]').click()

    const shape = canvas.shapes.first()
    const transform = await shape.evaluate(el => (el as HTMLElement).style.transform)
    expect(transform).toContain('scaleX(-1)')
  })

  test.fixme('flip vertical mirrors shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await page.locator('[data-testid="flip-v"]').click()

    const shape = canvas.shapes.first()
    const transform = await shape.evaluate(el => (el as HTMLElement).style.transform)
    expect(transform).toContain('scaleY(-1)')
  })
})

test.describe('Constrained transforms', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
  })

  test.fixme('Shift+resize maintains aspect ratio', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const shape = canvas.shapes.first()
    const boxBefore = await shape.boundingBox()
    const aspectRatio = boxBefore!.width / boxBefore!.height

    const handle = page.locator('[data-handle="se"]')
    await handle.hover()
    await page.keyboard.down('Shift')
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Shift')

    const boxAfter = await shape.boundingBox()
    const newAspectRatio = boxAfter!.width / boxAfter!.height
    expect(newAspectRatio).toBeCloseTo(aspectRatio, 1)
  })

  test.fixme('Alt+resize grows from center', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const shape = canvas.shapes.first()
    const boxBefore = await shape.boundingBox()
    const centerXBefore = boxBefore!.x + boxBefore!.width / 2
    const centerYBefore = boxBefore!.y + boxBefore!.height / 2

    const handle = page.locator('[data-handle="se"]')
    await handle.hover()
    await page.keyboard.down('Alt')
    await page.mouse.down()
    await page.mouse.move(380, 350, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Alt')

    const boxAfter = await shape.boundingBox()
    const centerXAfter = boxAfter!.x + boxAfter!.width / 2
    const centerYAfter = boxAfter!.y + boxAfter!.height / 2

    expect(centerXAfter).toBeCloseTo(centerXBefore, 0)
    expect(centerYAfter).toBeCloseTo(centerYBefore, 0)
  })

  test.fixme('position and size shown in property panel', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    await expect(page.locator('.property-panel input[data-testid="pos-x"]')).toBeVisible()
    await expect(page.locator('.property-panel input[data-testid="pos-y"]')).toBeVisible()
    await expect(page.locator('.property-panel input[data-testid="size-w"]')).toBeVisible()
    await expect(page.locator('.property-panel input[data-testid="size-h"]')).toBeVisible()
  })

  test.fixme('editing position in property panel moves shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const xInput = page.locator('.property-panel input[data-testid="pos-x"]')
    await xInput.fill('350')
    await xInput.press('Enter')

    const shape = canvas.shapes.first()
    const x = await shape.evaluate(el => parseFloat((el as HTMLElement).style.left))
    expect(x).toBe(350)
  })

  test.fixme('editing size in property panel resizes shape', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    const wInput = page.locator('.property-panel input[data-testid="size-w"]')
    await wInput.fill('200')
    await wInput.press('Enter')

    const shape = canvas.shapes.first()
    const w = await shape.evaluate(el => parseFloat((el as HTMLElement).style.width))
    expect(w).toBe(200)
  })
})

test.describe('Locking', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 120, 80)
  })

  test.fixme('locking a shape prevents it from being dragged', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()

    // Lock via keyboard
    await page.keyboard.press('Meta+l')

    const boxBefore = await canvas.shapes.first().boundingBox()

    // Try to drag
    await page.mouse.move(260, 240)
    await page.mouse.down()
    await page.mouse.move(400, 400, { steps: 5 })
    await page.mouse.up()

    const boxAfter = await canvas.shapes.first().boundingBox()
    expect(boxAfter!.x).toBe(boxBefore!.x)
    expect(boxAfter!.y).toBe(boxBefore!.y)
  })

  test.fixme('locked shape shows lock indicator', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.keyboard.press('Meta+l')

    await expect(canvas.shapes.first().locator('.lock-indicator')).toBeVisible()
  })

  test.fixme('locked shape cannot be resized', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.keyboard.press('Meta+l')

    // Resize handles should not be shown
    await expect(page.locator('.resize-handle')).toHaveCount(0)
  })

  test.fixme('locked shape cannot be deleted', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.keyboard.press('Meta+l')

    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(1) // still there
  })

  test.fixme('unlocking restores full interaction', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click()
    await page.keyboard.press('Meta+l') // lock
    await page.keyboard.press('Meta+l') // unlock

    // Should be able to drag now
    await canvas.shapes.first().click()
    await expect(page.locator('.resize-handle')).toHaveCount(8)
  })
})
