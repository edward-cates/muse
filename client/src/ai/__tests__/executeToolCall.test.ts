import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { executeToolCall, type ElementActions, type ToolCall } from '../executeToolCall.ts'
import type { CanvasElement, ShapeElement } from '../../types.ts'

// ── Minimal element store ──
// Satisfies ElementActions by storing elements as plain objects with named
// properties. Tests read back properties by name (el.startAnchorX) instead
// of checking mock args by positional index (args[2]).

interface StoreElement { id: string; [key: string]: unknown }

function createStore(initial: CanvasElement[] = []) {
  const elements: StoreElement[] = initial.map(e => ({ ...e }))
  let counter = 0

  const actions: ElementActions = {
    addShape(type, x, y, w, h) {
      const id = `el-${counter++}`
      elements.push({ id, type, x, y, width: w, height: h })
      return id
    },
    addLine(startId, endId, lineType) {
      const id = `el-${counter++}`
      elements.push({
        id, type: 'line',
        startShapeId: startId, endShapeId: endId,
        lineType: lineType || 'straight',
      })
      return id
    },
    addArrow(startId, endId, sx, sy, ex, ey, lineType) {
      const id = `el-${counter++}`
      elements.push({
        id, type: 'line',
        startShapeId: startId, endShapeId: endId,
        startX: sx, startY: sy, endX: ex, endY: ey,
        lineType: lineType || 'straight',
      })
      return id
    },
    addText(x, y) {
      const id = `el-${counter++}`
      elements.push({ id, type: 'text', x, y })
      return id
    },
    addWebCard(x, y, w, h, url, title, snippet) {
      const id = `el-${counter++}`
      elements.push({ id, type: 'webcard', x, y, width: w, height: h, url, title, snippet })
      return id
    },
    updateElement(id, updates) {
      const el = elements.find(e => e.id === id)
      if (el) Object.assign(el, updates)
    },
    deleteElement(id) {
      const idx = elements.findIndex(e => e.id === id)
      if (idx !== -1) elements.splice(idx, 1)
    },
    getElements() {
      return elements as unknown as CanvasElement[]
    },
  }

  return {
    actions,
    find(id: string) { return elements.find(e => e.id === id) },
    get all() { return elements },
  }
}

function call(name: string, input: Record<string, unknown>): ToolCall {
  return { id: 'call-1', name, input }
}

function shape(overrides: Partial<ShapeElement> & { id: string }): ShapeElement {
  return {
    type: 'rectangle', x: 100, y: 100, width: 160, height: 80,
    text: '', fill: '#e8edfc', stroke: '#4465e9', strokeWidth: 2.5,
    fontSize: 18, fontFamily: 'Inter, system-ui, sans-serif',
    textAlign: 'center', verticalAlign: 'middle',
    strokeStyle: 'solid', opacity: 100, cornerRadius: 8,
    shadow: true, rotation: 0, flipH: false, flipV: false,
    locked: false, groupId: '',
    ...overrides,
  }
}

function parse(result: { content: string }) {
  return JSON.parse(result.content)
}

// ── Tests ──

describe('executeToolCall', () => {
  describe('add_shape', () => {
    it('creates a shape at the specified position and size', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'rectangle', x: 100, y: 200, width: 160, height: 80 }),
        store.actions,
      ))
      assert.ok(data.success)
      const el = store.find(data.id)!
      assert.equal(el.type, 'rectangle')
      assert.equal(el.x, 100)
      assert.equal(el.y, 200)
      assert.equal(el.width, 160)
      assert.equal(el.height, 80)
    })

    it('applies fill and strokeWidth', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'ellipse', x: 0, y: 0, width: 100, height: 100, fill: '#ff0000', strokeWidth: 3 }),
        store.actions,
      ))
      const el = store.find(data.id)!
      assert.equal(el.fill, '#ff0000')
      assert.equal(el.strokeWidth, 3)
    })

    it('normalizes invalid hex color to default with warning', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: 'not-a-color' }),
        store.actions,
      ))
      assert.ok(data.warnings.some((w: string) => w.includes('Invalid hex color')))
      assert.equal(store.find(data.id)!.fill, '#4465e9')
    })

    it('adds # prefix to bare hex colors', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: 'ff0000' }),
        store.actions,
      ))
      assert.equal(store.find(data.id)!.fill, '#ff0000')
    })

    it('clamps dimensions to minimum 20x20 with warning', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'rectangle', x: 0, y: 0, width: 5, height: 10 }),
        store.actions,
      ))
      assert.ok(data.warnings.some((w: string) => w.includes('clamped')))
      const el = store.find(data.id)!
      assert.equal(el.width, 20)
      assert.equal(el.height, 20)
    })

    it('warns about overlaps with existing elements', async () => {
      const store = createStore([shape({ id: 'existing', x: 100, y: 100, text: 'Existing' })])
      const data = parse(await executeToolCall(
        call('add_shape', { shape_type: 'rectangle', x: 120, y: 120, width: 160, height: 80 }),
        store.actions,
      ))
      assert.ok(data.warnings.some((w: string) => w.includes('Overlaps')))
    })
  })

  describe('add_text', () => {
    it('creates a text element with content', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_text', { x: 200, y: 300, text: 'Hello world' }),
        store.actions,
      ))
      const el = store.find(data.id)!
      assert.equal(el.type, 'text')
      assert.equal(el.text, 'Hello world')
    })
  })

  describe('update_element', () => {
    it('returns error for nonexistent ID', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('update_element', { id: 'nonexistent', text: 'New text' }),
        store.actions,
      ))
      assert.ok(data.error)
      assert.ok(data.error.includes('not found'))
    })

    it('updates properties on an existing element', async () => {
      const store = createStore([shape({ id: 'shape-1' })])
      await executeToolCall(
        call('update_element', { id: 'shape-1', text: 'Updated' }),
        store.actions,
      )
      assert.equal(store.find('shape-1')!.text, 'Updated')
    })
  })

  describe('delete_element', () => {
    it('returns error for nonexistent ID', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('delete_element', { id: 'nonexistent' }),
        store.actions,
      ))
      assert.ok(data.error)
    })

    it('removes the element', async () => {
      const store = createStore([shape({ id: 'shape-1' })])
      await executeToolCall(call('delete_element', { id: 'shape-1' }), store.actions)
      assert.equal(store.find('shape-1'), undefined)
    })
  })

  describe('add_line', () => {
    it('connects two shapes by ID', async () => {
      const store = createStore([shape({ id: 'a' }), shape({ id: 'b', y: 300 })])
      const data = parse(await executeToolCall(
        call('add_line', { start_shape_id: 'a', end_shape_id: 'b' }),
        store.actions,
      ))
      assert.ok(data.success)
      const el = store.find(data.id)!
      assert.equal(el.startShapeId, 'a')
      assert.equal(el.endShapeId, 'b')
    })

    it('rejects nonexistent shape IDs', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_line', { start_shape_id: 'nope', end_shape_id: 'also-nope' }),
        store.actions,
      ))
      assert.ok(data.error)
      assert.ok(data.error.includes('not found'))
    })

    it('sets the lineType', async () => {
      const store = createStore([shape({ id: 'a' }), shape({ id: 'b' })])
      const data = parse(await executeToolCall(
        call('add_line', { start_shape_id: 'a', end_shape_id: 'b', lineType: 'elbow' }),
        store.actions,
      ))
      assert.equal(store.find(data.id)!.lineType, 'elbow')
    })
  })

  describe('add_arrow', () => {
    it('creates a free-floating arrow with coordinates', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_arrow', { start_x: 100, start_y: 200, end_x: 300, end_y: 400 }),
        store.actions,
      ))
      const el = store.find(data.id)!
      assert.equal(el.startShapeId, '')
      assert.equal(el.endShapeId, '')
      assert.equal(el.startX, 100)
      assert.equal(el.startY, 200)
      assert.equal(el.endX, 300)
      assert.equal(el.endY, 400)
    })

    it('connects two shapes by ID', async () => {
      const store = createStore([shape({ id: 'a' }), shape({ id: 'b' })])
      const data = parse(await executeToolCall(
        call('add_arrow', { start_shape_id: 'a', end_shape_id: 'b' }),
        store.actions,
      ))
      const el = store.find(data.id)!
      assert.equal(el.startShapeId, 'a')
      assert.equal(el.endShapeId, 'b')
    })
  })

  describe('arrange_grid', () => {
    it('positions elements in a grid', async () => {
      const store = createStore([
        shape({ id: 'a', width: 160, height: 80 }),
        shape({ id: 'b', width: 160, height: 80 }),
        shape({ id: 'c', width: 160, height: 80 }),
        shape({ id: 'd', width: 160, height: 80 }),
      ])
      await executeToolCall(
        call('arrange_grid', { element_ids: ['a', 'b', 'c', 'd'], columns: 2, start_x: 100, start_y: 100, gap_x: 40, gap_y: 40 }),
        store.actions,
      )
      assert.deepEqual({ x: store.find('a')!.x, y: store.find('a')!.y }, { x: 100, y: 100 })
      assert.deepEqual({ x: store.find('b')!.x, y: store.find('b')!.y }, { x: 300, y: 100 })
      assert.deepEqual({ x: store.find('c')!.x, y: store.find('c')!.y }, { x: 100, y: 220 })
      assert.deepEqual({ x: store.find('d')!.x, y: store.find('d')!.y }, { x: 300, y: 220 })
    })

    it('auto-computes column count from element count', async () => {
      const store = createStore([shape({ id: 'a' }), shape({ id: 'b' }), shape({ id: 'c' }), shape({ id: 'd' })])
      const data = parse(await executeToolCall(
        call('arrange_grid', { element_ids: ['a', 'b', 'c', 'd'] }),
        store.actions,
      ))
      assert.equal(data.columns, 2) // ceil(sqrt(4))
    })
  })

  describe('arrange_flow', () => {
    it('spaces elements vertically', async () => {
      const store = createStore([
        shape({ id: 'a', width: 160, height: 80 }),
        shape({ id: 'b', width: 160, height: 80 }),
        shape({ id: 'c', width: 160, height: 80 }),
      ])
      await executeToolCall(
        call('arrange_flow', { element_ids: ['a', 'b', 'c'], direction: 'vertical', start_x: 100, start_y: 100, gap: 60 }),
        store.actions,
      )
      assert.deepEqual({ x: store.find('a')!.x, y: store.find('a')!.y }, { x: 100, y: 100 })
      assert.deepEqual({ x: store.find('b')!.x, y: store.find('b')!.y }, { x: 100, y: 240 })
      assert.deepEqual({ x: store.find('c')!.x, y: store.find('c')!.y }, { x: 100, y: 380 })
    })

    it('spaces elements horizontally', async () => {
      const store = createStore([
        shape({ id: 'a', width: 160, height: 80 }),
        shape({ id: 'b', width: 160, height: 80 }),
      ])
      await executeToolCall(
        call('arrange_flow', { element_ids: ['a', 'b'], direction: 'horizontal', start_x: 100, start_y: 100, gap: 40 }),
        store.actions,
      )
      assert.deepEqual({ x: store.find('a')!.x, y: store.find('a')!.y }, { x: 100, y: 100 })
      assert.deepEqual({ x: store.find('b')!.x, y: store.find('b')!.y }, { x: 300, y: 100 })
    })
  })

  describe('add_web_card', () => {
    it('creates a web card with url, title, and snippet', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(
        call('add_web_card', { x: 100, y: 200, url: 'https://example.com', title: 'Example', snippet: 'A test site' }),
        store.actions,
      ))
      assert.ok(data.success)
      const el = store.find(data.id)!
      assert.equal(el.type, 'webcard')
      assert.equal(el.url, 'https://example.com')
      assert.equal(el.title, 'Example')
      assert.equal(el.snippet, 'A test site')
    })
  })

  describe('unknown tool', () => {
    it('returns an error', async () => {
      const store = createStore()
      const data = parse(await executeToolCall(call('nonexistent_tool', {}), store.actions))
      assert.ok(data.error)
      assert.ok(data.error.includes('Unknown tool'))
    })
  })
})
