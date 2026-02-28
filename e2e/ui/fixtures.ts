import { type Page, type Locator } from '@playwright/test'

export type ToolName = 'select' | 'rectangle' | 'ellipse' | 'diamond' | 'line' | 'arrow' | 'draw' | 'text' | 'hand' | 'eraser' | 'frame' | 'triangle' | 'hexagon' | 'star' | 'cloud'

export class CanvasPage {
  readonly page: Page
  readonly canvas: Locator
  readonly toolbar: Locator

  constructor(page: Page) {
    this.page = page
    this.canvas = page.locator('[data-testid="canvas"]')
    this.toolbar = page.locator('.toolbar')
  }

  async goto() {
    await this.page.goto('/')
    await this.canvas.waitFor({ state: 'visible' })
  }

  // --- Tool selection ---

  async selectTool(tool: ToolName) {
    const FLYOUT_SHAPES: ToolName[] = ['triangle', 'hexagon', 'star', 'cloud']
    if (FLYOUT_SHAPES.includes(tool)) {
      // Open the shape picker flyout first
      await this.page.locator('[data-testid="more-shapes"]').click()
    }
    await this.page.locator(`[data-testid="tool-${tool}"]`).click()
  }

  toolButton(tool: ToolName): Locator {
    return this.page.locator(`[data-testid="tool-${tool}"]`)
  }

  // --- Shape creation via mouse drag ---

  async drawShape(x: number, y: number, width: number, height: number) {
    await this.page.mouse.move(x, y)
    await this.page.mouse.down()
    await this.page.mouse.move(x + width, y + height, { steps: 10 })
    await this.page.mouse.up()
  }

  // --- Element locators ---

  get shapes(): Locator {
    return this.page.locator('.shape')
  }

  shapesOfType(type: 'rectangle' | 'ellipse' | 'diamond' | 'triangle' | 'hexagon' | 'star' | 'cloud'): Locator {
    return this.page.locator(`[data-testid="shape-${type}"]`)
  }

  get textElements(): Locator {
    return this.page.locator('[data-testid="text-element"]')
  }

  get imageElements(): Locator {
    return this.page.locator('[data-testid="image-element"]')
  }

  get frameElements(): Locator {
    return this.page.locator('[data-testid="frame-element"]')
  }

  get selectedShape(): Locator {
    return this.page.locator('.shape--selected')
  }

  get shapePreview(): Locator {
    return this.page.locator('.shape-preview')
  }

  get paths(): Locator {
    return this.page.locator('.canvas__paths path[stroke]:not([stroke="transparent"])')
  }

  get connectors(): Locator {
    return this.page.locator('.canvas__lines path.connector')
  }

  /** @deprecated Use connectors instead */
  get lines(): Locator {
    return this.connectors
  }

  // --- Canvas state ---

  async getWorldTransform(): Promise<string> {
    return (await this.page.locator('.canvas__world').getAttribute('style')) ?? ''
  }
}
