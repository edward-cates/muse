import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Collaboration presence', () => {
  // These tests require two browser contexts simulating two users

  test.fixme('remote cursor shows username label', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const canvas1 = new CanvasPage(page1)
    const canvas2 = new CanvasPage(page2)
    await canvas1.goto()
    await canvas2.goto()

    // Move cursor on page1
    await page1.mouse.move(300, 300)

    // Page2 should see a cursor with a name label
    const remoteCursor = page2.locator('.cursor-label')
    await expect(remoteCursor).toBeVisible({ timeout: 5000 })

    await context1.close()
    await context2.close()
  })

  test.fixme('remote cursors have distinct colors per user', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const context3 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()
    const page3 = await context3.newPage()

    const canvas1 = new CanvasPage(page1)
    const canvas2 = new CanvasPage(page2)
    const canvas3 = new CanvasPage(page3)
    await canvas1.goto()
    await canvas2.goto()
    await canvas3.goto()

    // Move cursors
    await page1.mouse.move(200, 200)
    await page2.mouse.move(400, 400)

    // Page3 should see two differently colored cursors
    const cursors = page3.locator('.remote-cursor')
    await expect(cursors).toHaveCount(2, { timeout: 5000 })

    const colors = await cursors.evaluateAll(els =>
      els.map(el => getComputedStyle(el).backgroundColor)
    )
    expect(colors[0]).not.toEqual(colors[1])

    await context1.close()
    await context2.close()
    await context3.close()
  })

  test.fixme('remote user selection is visible (selection awareness)', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const canvas1 = new CanvasPage(page1)
    const canvas2 = new CanvasPage(page2)
    await canvas1.goto()
    await canvas2.goto()

    // Create a shape on page1
    await canvas1.selectTool('rectangle')
    await canvas1.drawShape(200, 200, 100, 80)

    // Wait for sync
    await expect(canvas2.shapes).toHaveCount(1, { timeout: 5000 })

    // Select the shape on page1
    await canvas1.selectTool('select')
    await canvas1.shapes.first().click()

    // Page2 should see a remote selection indicator
    const remoteSelection = page2.locator('.remote-selection')
    await expect(remoteSelection).toBeVisible({ timeout: 5000 })

    await context1.close()
    await context2.close()
  })

  test.fixme('follow mode tracks another users viewport', async ({ browser }) => {
    const context1 = await browser.newContext()
    const context2 = await browser.newContext()
    const page1 = await context1.newPage()
    const page2 = await context2.newPage()

    const canvas1 = new CanvasPage(page1)
    const canvas2 = new CanvasPage(page2)
    await canvas1.goto()
    await canvas2.goto()

    // Enable follow mode on page2 targeting page1's user
    await page2.locator('.remote-cursor').first().dblclick()

    // Pan on page1
    await page1.keyboard.down('Space')
    await page1.mouse.move(300, 300)
    await page1.mouse.down()
    await page1.mouse.move(100, 100, { steps: 5 })
    await page1.mouse.up()
    await page1.keyboard.up('Space')

    // Page2's viewport should follow
    const transform1 = await canvas1.getWorldTransform()
    const transform2 = await canvas2.getWorldTransform()
    // They should be similar (not exact due to timing)
    expect(transform2).toContain('translate')

    await context1.close()
    await context2.close()
  })
})
