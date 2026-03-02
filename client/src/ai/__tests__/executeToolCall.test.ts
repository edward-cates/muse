import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { executeToolCall, resolveShape, type ElementActions, type ToolCall } from '../executeToolCall.ts'
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

// ── resolveShape tests ──

describe('resolveShape', () => {
  const elements = [
    shape({ id: 'aaaaaaaa-1111-2222-3333-444444444444', text: 'Root' }),
    shape({ id: 'bbbbbbbb-5555-6666-7777-888888888888', text: 'Child A' }),
    shape({ id: 'cccccccc-9999-0000-1111-222222222222', text: 'Child B' }),
  ] as unknown as CanvasElement[]

  it('finds shape by exact full ID', () => {
    const el = resolveShape(elements, 'aaaaaaaa-1111-2222-3333-444444444444')
    assert.ok(el)
    assert.equal(el!.id, 'aaaaaaaa-1111-2222-3333-444444444444')
  })

  it('finds shape by 8-char prefix ID', () => {
    const el = resolveShape(elements, 'bbbbbbbb')
    assert.ok(el)
    assert.equal(el!.id, 'bbbbbbbb-5555-6666-7777-888888888888')
  })

  it('ignores short refs that could collide with UUID prefixes', () => {
    // A ref like "2" should NOT match UUID "2945d160-..." via prefix
    const tricky = [
      shape({ id: '2945d160-d68e-4599-a003-84b13ca98508', text: '4' }),
      shape({ id: '86f544be-35ab-4326-8dac-c254540a4e09', text: '2' }),
    ] as unknown as CanvasElement[]
    // "2" is too short for prefix match — should return undefined, not shape "4"
    const el = resolveShape(tricky, '2')
    assert.equal(el, undefined)
  })

  it('returns undefined when nothing matches', () => {
    const el = resolveShape(elements, 'nonexistent')
    assert.equal(el, undefined)
  })

  it('returns undefined for empty ref', () => {
    const el = resolveShape(elements, '')
    assert.equal(el, undefined)
  })
})

// ── set_viewport tests ──

describe('set_viewport', () => {
  it('calls fitToContent for fit_all mode', async () => {
    let fitCalled = false
    const store = createStore([shape({ id: 'a' })])
    store.actions.fitToContent = () => { fitCalled = true }
    const data = parse(await executeToolCall(
      call('set_viewport', { mode: 'fit_all' }),
      store.actions,
    ))
    assert.ok(data.success)
    assert.ok(fitCalled)
  })

  it('calls fitToElements with resolved IDs for fit_elements mode', async () => {
    let fitIds: string[] = []
    const store = createStore([
      shape({ id: 'aaaaaaaa-1111-2222-3333-444444444444', text: 'A' }),
      shape({ id: 'bbbbbbbb-5555-6666-7777-888888888888', text: 'B' }),
    ])
    store.actions.fitToElements = (ids) => { fitIds = ids }
    const data = parse(await executeToolCall(
      call('set_viewport', { mode: 'fit_elements', element_ids: ['aaaaaaaa'] }),
      store.actions,
    ))
    assert.ok(data.success)
    assert.deepEqual(fitIds, ['aaaaaaaa-1111-2222-3333-444444444444'])
  })

  it('returns error when viewport control not available', async () => {
    const store = createStore()
    const data = parse(await executeToolCall(
      call('set_viewport', { mode: 'fit_all' }),
      store.actions,
    ))
    assert.ok(data.error)
    assert.ok(data.error.includes('not available'))
  })

  it('returns error for fit_elements with empty ids', async () => {
    const store = createStore()
    store.actions.fitToElements = () => {}
    const data = parse(await executeToolCall(
      call('set_viewport', { mode: 'fit_elements', element_ids: [] }),
      store.actions,
    ))
    assert.ok(data.error)
    assert.ok(data.error.includes('element_ids required'))
  })
})

// ── add_line with prefix ID references ──

describe('add_line with prefix IDs', () => {
  it('connects shapes by 8-char prefix ID', async () => {
    const store = createStore([
      shape({ id: 'abcdef12-3456-7890-abcd-ef1234567890', text: 'A' }),
      shape({ id: 'fedcba98-7654-3210-fedc-ba9876543210', text: 'B', y: 300 }),
    ])
    const data = parse(await executeToolCall(
      call('add_line', { start_shape_id: 'abcdef12', end_shape_id: 'fedcba98' }),
      store.actions,
    ))
    assert.ok(data.success, `Expected success but got: ${JSON.stringify(data)}`)
    const line = store.find(data.id)!
    assert.equal(line.startShapeId, 'abcdef12-3456-7890-abcd-ef1234567890')
    assert.equal(line.endShapeId, 'fedcba98-7654-3210-fedc-ba9876543210')
  })

  it('returns error when short ref does not match any ID', async () => {
    const store = createStore([shape({ id: 'abcdef12-full-uuid', text: 'Existing' })])
    const data = parse(await executeToolCall(
      call('add_line', { start_shape_id: 'nope', end_shape_id: 'also-nope' }),
      store.actions,
    ))
    assert.ok(data.error)
    assert.ok(data.error.includes('not found'))
  })
})

// ── Binary tree scenario: the real LLM workflow ──
// Turn 1: model creates shapes, gets back IDs in tool results
// Turn 2: model uses those IDs (8-char prefix) to add_line

describe('binary tree scenario — shapes then lines via returned IDs', () => {
  it('creates 7 shapes then connects them using 8-char prefix IDs', async () => {
    const store = createStore()

    // Turn 1: LLM creates 7 shapes, collects returned IDs
    const nodePositions = [
      { text: '1', x: 500, y: 100 },  // root
      { text: '2', x: 300, y: 260 },  // left child
      { text: '3', x: 700, y: 260 },  // right child
      { text: '4', x: 200, y: 420 },  // left-left
      { text: '5', x: 400, y: 420 },  // left-right
      { text: '6', x: 600, y: 420 },  // right-left
      { text: '7', x: 800, y: 420 },  // right-right
    ]

    const ids: Record<string, string> = {}
    for (const node of nodePositions) {
      const result = parse(await executeToolCall(
        call('add_shape', { shape_type: 'ellipse', x: node.x, y: node.y, width: 100, height: 80, text: node.text }),
        store.actions,
      ))
      assert.ok(result.success, `Failed to create shape "${node.text}": ${JSON.stringify(result)}`)
      ids[node.text] = result.id
    }

    assert.equal(store.all.length, 7, 'Should have 7 shapes')

    // Turn 2: LLM uses 8-char prefix of returned IDs to connect
    const connections = [
      { start: '1', end: '2' },
      { start: '1', end: '3' },
      { start: '2', end: '4' },
      { start: '2', end: '5' },
      { start: '3', end: '6' },
      { start: '3', end: '7' },
    ]

    for (const conn of connections) {
      const startPrefix = ids[conn.start].slice(0, 8)
      const endPrefix = ids[conn.end].slice(0, 8)
      const result = parse(await executeToolCall(
        call('add_line', { start_shape_id: startPrefix, end_shape_id: endPrefix }),
        store.actions,
      ))
      assert.ok(result.success, `Failed to connect "${conn.start}" → "${conn.end}": ${JSON.stringify(result)}`)
    }

    // Verify: 7 shapes + 6 lines = 13 elements
    assert.equal(store.all.length, 13, 'Should have 13 elements (7 shapes + 6 lines)')

    // Verify each line's endpoints resolve to the correct shapes
    const lines = store.all.filter(e => e.type === 'line')
    assert.equal(lines.length, 6, 'Should have 6 lines')
    for (const line of lines) {
      const startShape = store.find(line.startShapeId as string)
      const endShape = store.find(line.endShapeId as string)
      assert.ok(startShape, `Line start "${line.startShapeId}" should reference a real shape`)
      assert.ok(endShape, `Line end "${line.endShapeId}" should reference a real shape`)
    }

    // Verify specific connections: node "1" connects to "2" and "3" (not "4"!)
    const node1Lines = lines.filter(l => l.startShapeId === ids['1'])
    assert.equal(node1Lines.length, 2, 'Node 1 should have 2 outgoing lines')
    const node1Targets = new Set(node1Lines.map(l => l.endShapeId))
    assert.ok(node1Targets.has(ids['2']), 'Node 1 should connect to node 2')
    assert.ok(node1Targets.has(ids['3']), 'Node 1 should connect to node 3')
  })
})
