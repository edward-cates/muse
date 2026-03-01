import { test, expect } from '@playwright/test'
import { CanvasPage } from './fixtures'

test.describe('Export', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()

    // Create a scene with shapes and a connector
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 100, 80)
    await canvas.selectTool('ellipse')
    await canvas.drawShape(300, 200, 100, 80)
    await canvas.selectTool('line')
    await page.mouse.move(200, 240)
    await page.mouse.down()
    await page.mouse.move(300, 240, { steps: 5 })
    await page.mouse.up()
  })

  test.fixme('export PNG button exists in menu', async ({ page }) => {
    const exportBtn = page.locator('[data-testid="export-png"]')
    await expect(exportBtn).toBeVisible()
  })

  test.fixme('export PNG triggers download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-png"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.png$/)
  })

  test.fixme('export SVG button exists in menu', async ({ page }) => {
    const exportBtn = page.locator('[data-testid="export-svg"]')
    await expect(exportBtn).toBeVisible()
  })

  test.fixme('export SVG triggers download with valid SVG', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-svg"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.svg$/)
  })

  test.fixme('export JSON triggers download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-json"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })

  test.fixme('exported PNG includes all visible elements', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-png"]').click(),
    ])
    const path = await download.path()
    expect(path).toBeTruthy()
    // PNG should have reasonable size (not empty)
    const stats = await page.evaluate(async (p) => {
      const resp = await fetch(`file://${p}`)
      const buf = await resp.arrayBuffer()
      return buf.byteLength
    }, path)
    expect(stats).toBeGreaterThan(1000)
  })

  test.fixme('export selection only exports selected elements', async ({ page }) => {
    await canvas.selectTool('select')
    await canvas.shapes.first().click() // select only rectangle

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-selection-png"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.png$/)
  })

  test.fixme('export with transparent background', async ({ page }) => {
    const transparentToggle = page.locator('[data-testid="export-transparent-bg"]')
    await transparentToggle.check()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-png"]').click(),
    ])
    expect(download.suggestedFilename()).toMatch(/\.png$/)
  })
})

test.describe('Import', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test.fixme('import JSON restores shapes and connectors', async ({ page }) => {
    // Create a scene, export it, clear, then re-import
    await canvas.selectTool('rectangle')
    await canvas.drawShape(200, 200, 100, 80)
    await expect(canvas.shapes).toHaveCount(1)

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="export-json"]').click(),
    ])
    const filePath = await download.path()

    // Clear canvas
    await canvas.selectTool('select')
    await page.keyboard.press('Meta+a')
    await page.keyboard.press('Delete')
    await expect(canvas.shapes).toHaveCount(0)

    // Import
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.locator('[data-testid="import-json"]').click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(filePath!)

    await expect(canvas.shapes).toHaveCount(1)
  })

  test.fixme('drag-and-drop image file creates image element', async ({ page }) => {
    // Simulate file drop
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer())
    await page.dispatchEvent('[data-testid="canvas"]', 'drop', { dataTransfer })

    // This is a simplified test — real implementation needs actual file data
    await expect(page.locator('[data-testid="image-element"]')).toHaveCount(1)
  })

  test.fixme('import Mermaid syntax creates diagram', async ({ page }) => {
    const importBtn = page.locator('[data-testid="import-mermaid"]')
    await importBtn.click()

    const textarea = page.locator('.mermaid-import-dialog textarea')
    await textarea.fill('graph LR\n  A --> B\n  B --> C')
    await page.locator('.mermaid-import-dialog [data-testid="import-confirm"]').click()

    // Should create 3 shapes and 2 connectors
    await expect(canvas.shapes).toHaveCount(3)
    await expect(canvas.connectors).toHaveCount(2)
  })
})
