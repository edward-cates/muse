import { test, expect, type Page } from '@playwright/test'
import { CanvasPage } from './fixtures'

/** Inject a document card (canvas node) via the Yjs doc */
async function createDocumentCard(
  page: Page,
  opts: { id: string; x: number; y: number; title: string },
) {
  await page.evaluate((o) => {
    const doc = window.__testDoc!
    const Y = window.__testY!
    const elements = doc.getArray('elements')
    const yEl = new Y.Map()
    yEl.set('id', o.id)
    yEl.set('type', 'document_card')
    yEl.set('x', o.x)
    yEl.set('y', o.y)
    yEl.set('width', 280)
    yEl.set('height', 180)
    yEl.set('documentId', 'fake-doc-' + o.id)
    yEl.set('documentType', 'canvas')
    yEl.set('title', o.title)
    yEl.set('contentVersion', 0)
    elements.push([yEl])
  }, opts)
}

test.describe('Connecting arrows to document card nodes', () => {
  let canvas: CanvasPage

  test.beforeEach(async ({ page }) => {
    canvas = new CanvasPage(page)
    await canvas.goto()
  })

  test('arrow tool connects a shape to a document card node', async ({ page }) => {
    // Create a rectangle and a document card node
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await createDocumentCard(page, { id: 'node-1', x: 400, y: 180, title: 'Sub-canvas' })

    await expect(canvas.shapesOfType('rectangle')).toHaveCount(1)
    await expect(page.locator('[data-testid="document-card"]')).toHaveCount(1)

    // Select arrow tool
    await canvas.selectTool('arrow')

    // Drag from center of the shape to center of the document card
    const shape = canvas.shapes.first()
    const card = page.locator('[data-testid="document-card"]')
    const shapeBox = await shape.boundingBox()
    const cardBox = await card.boundingBox()
    if (!shapeBox || !cardBox) throw new Error('Missing bounding boxes')

    const x1 = shapeBox.x + shapeBox.width / 2
    const y1 = shapeBox.y + shapeBox.height / 2
    const x2 = cardBox.x + cardBox.width / 2
    const y2 = cardBox.y + cardBox.height / 2

    await page.mouse.move(x1, y1)
    await page.mouse.down()
    await page.mouse.move(x2, y2, { steps: 10 })
    await page.mouse.up()

    // A connector should have been created
    await expect(canvas.connectors).toHaveCount(1)

    // Verify the connector has an arrowhead marker
    const connectorPath = page.locator('.canvas__lines path.connector[marker-end]')
    await expect(connectorPath).toHaveCount(1)
  })

  test('arrow tool connects two document card nodes', async ({ page }) => {
    await createDocumentCard(page, { id: 'node-a', x: 100, y: 200, title: 'Node A' })
    await createDocumentCard(page, { id: 'node-b', x: 500, y: 200, title: 'Node B' })

    const cards = page.locator('[data-testid="document-card"]')
    await expect(cards).toHaveCount(2)

    await canvas.selectTool('arrow')

    const box1 = await cards.first().boundingBox()
    const box2 = await cards.last().boundingBox()
    if (!box1 || !box2) throw new Error('Missing bounding boxes')

    await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2)
    await page.mouse.down()
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)
  })

  test('arrow tool connects document card node to a shape', async ({ page }) => {
    // Node first, shape second — reverse direction
    await createDocumentCard(page, { id: 'node-c', x: 100, y: 200, title: 'Source Node' })
    await canvas.selectTool('rectangle')
    await canvas.drawShape(500, 200, 120, 80)

    await canvas.selectTool('arrow')

    const card = page.locator('[data-testid="document-card"]')
    const shape = canvas.shapes.first()
    const cardBox = await card.boundingBox()
    const shapeBox = await shape.boundingBox()
    if (!cardBox || !shapeBox) throw new Error('Missing bounding boxes')

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)
  })

  test('line tool connects a shape to a document card node', async ({ page }) => {
    await canvas.selectTool('rectangle')
    await canvas.drawShape(100, 200, 120, 80)
    await createDocumentCard(page, { id: 'node-d', x: 400, y: 180, title: 'Target' })

    await canvas.selectTool('line')

    const shape = canvas.shapes.first()
    const card = page.locator('[data-testid="document-card"]')
    const shapeBox = await shape.boundingBox()
    const cardBox = await card.boundingBox()
    if (!shapeBox || !cardBox) throw new Error('Missing bounding boxes')

    await page.mouse.move(shapeBox.x + shapeBox.width / 2, shapeBox.y + shapeBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2, { steps: 10 })
    await page.mouse.up()

    await expect(canvas.connectors).toHaveCount(1)
  })

  test('connection highlight appears when hovering a document card with arrow tool', async ({ page }) => {
    await createDocumentCard(page, { id: 'node-e', x: 200, y: 200, title: 'Hoverable' })

    await canvas.selectTool('arrow')

    const card = page.locator('[data-testid="document-card"]')
    const box = await card.boundingBox()
    if (!box) throw new Error('No bounding box')

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

    await expect(page.locator('.connection-highlight')).toHaveCount(1)
  })
})
