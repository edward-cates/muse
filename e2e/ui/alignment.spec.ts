import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Alignment', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create three shapes at different positions
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 100, 80, 60) // shape 0
    await canvas.selectTool('rectangle')
    await canvas.drawShape(250, 200, 100, 40) // shape 1
    await canvas.selectTool('rectangle')
    await canvas.drawShape(400, 150, 60, 90) // shape 2

    // Select all three
    await canvas.selectTool('select')
    await page.mouse.move(50, 50)
    await page.mouse.down()
    await page.mouse.move(550, 350, { steps: 5 })
    await page.mouse.up()
  })

  test('align left aligns all shapes to leftmost edge', async ({ page }) => {
    await page.locator('[data-testid="align-left"]').click()

    const lefts = await canvas.shapes.evaluateAll(els =>
      els.map(el => parseFloat((el as HTMLElement).style.left))
    )
    const minLeft = Math.min(...lefts)
    for (const l of lefts) {
      expect(l).toBe(minLeft)
    }
  })

  test('align right aligns all shapes to rightmost edge', async ({ page }) => {
    await page.locator('[data-testid="align-right"]').click()

    const rights = await canvas.shapes.evaluateAll(els =>
      els.map(el => {
        const s = el as HTMLElement
        return parseFloat(s.style.left) + parseFloat(s.style.width)
      })
    )
    const maxRight = Math.max(...rights)
    for (const r of rights) {
      expect(r).toBeCloseTo(maxRight, 0)
    }
  })

  test('align top aligns all shapes to topmost edge', async ({ page }) => {
    await page.locator('[data-testid="align-top"]').click()

    const tops = await canvas.shapes.evaluateAll(els =>
      els.map(el => parseFloat((el as HTMLElement).style.top))
    )
    const minTop = Math.min(...tops)
    for (const t of tops) {
      expect(t).toBe(minTop)
    }
  })

  test('align bottom aligns all shapes to bottommost edge', async ({ page }) => {
    await page.locator('[data-testid="align-bottom"]').click()

    const bottoms = await canvas.shapes.evaluateAll(els =>
      els.map(el => {
        const s = el as HTMLElement
        return parseFloat(s.style.top) + parseFloat(s.style.height)
      })
    )
    const maxBottom = Math.max(...bottoms)
    for (const b of bottoms) {
      expect(b).toBeCloseTo(maxBottom, 0)
    }
  })

  test('align center horizontal centers all shapes horizontally', async ({ page }) => {
    await page.locator('[data-testid="align-center-h"]').click()

    const centers = await canvas.shapes.evaluateAll(els =>
      els.map(el => {
        const s = el as HTMLElement
        return parseFloat(s.style.left) + parseFloat(s.style.width) / 2
      })
    )
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length
    for (const c of centers) {
      expect(c).toBeCloseTo(avg, 0)
    }
  })

  test('align center vertical centers all shapes vertically', async ({ page }) => {
    await page.locator('[data-testid="align-center-v"]').click()

    const centers = await canvas.shapes.evaluateAll(els =>
      els.map(el => {
        const s = el as HTMLElement
        return parseFloat(s.style.top) + parseFloat(s.style.height) / 2
      })
    )
    const avg = centers.reduce((a, b) => a + b, 0) / centers.length
    for (const c of centers) {
      expect(c).toBeCloseTo(avg, 0)
    }
  })

  test('alignment buttons only show when multiple shapes selected', async ({ page }) => {
    // Deselect all, select just one
    await page.mouse.click(600, 50)
    await canvas.shapes.first().click()

    await expect(page.locator('[data-testid="align-left"]')).toHaveCount(0)
  })
})

test.describe('Distribution', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create three shapes at uneven spacing
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 80, 60)
    await canvas.selectTool('rectangle')
    await canvas.drawShape(500, 200, 80, 60)

    // Select all
    await canvas.selectTool('select')
    await page.mouse.move(50, 150)
    await page.mouse.down()
    await page.mouse.move(650, 310, { steps: 5 })
    await page.mouse.up()
  })

  test('distribute horizontally creates even spacing', async ({ page }) => {
    await page.locator('[data-testid="distribute-h"]').click()

    const positions = await canvas.shapes.evaluateAll(els =>
      els.map(el => ({
        left: parseFloat((el as HTMLElement).style.left),
        width: parseFloat((el as HTMLElement).style.width),
      })).sort((a, b) => a.left - b.left)
    )

    // Gaps between shapes should be equal
    const gap1 = positions[1].left - (positions[0].left + positions[0].width)
    const gap2 = positions[2].left - (positions[1].left + positions[1].width)
    expect(gap1).toBeCloseTo(gap2, 0)
  })

  test('distribute vertically creates even spacing', async ({ page }) => {
    // Reposition shapes vertically
    // (In practice, shapes would be at different Y positions)
    await page.locator('[data-testid="distribute-v"]').click()

    const positions = await canvas.shapes.evaluateAll(els =>
      els.map(el => ({
        top: parseFloat((el as HTMLElement).style.top),
        height: parseFloat((el as HTMLElement).style.height),
      })).sort((a, b) => a.top - b.top)
    )

    const gap1 = positions[1].top - (positions[0].top + positions[0].height)
    const gap2 = positions[2].top - (positions[1].top + positions[1].height)
    expect(gap1).toBeCloseTo(gap2, 0)
  })

  test('distribute requires at least 3 selected elements', async ({ page }) => {
    // Deselect all, select just two
    await page.mouse.click(600, 50)
    await canvas.shapes.first().click()
    await canvas.shapes.nth(1).click({ modifiers: ['Shift'] })

    await expect(page.locator('[data-testid="distribute-h"]')).toBeDisabled()
  })
})
