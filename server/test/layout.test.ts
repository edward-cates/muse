import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'

/**
 * Layout tests — verifies the force-directed layout positions nodes
 * so they don't overlap and respects graph topology.
 */

interface MockDoc { id: string; type: string; content: string | null; owner_id: string }

let docStore: MockDoc[] = []

function createMockSupabase(): Promise<{ server: Server; url: string }> {
  return new Promise(async (resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      let body = ''
      for await (const chunk of req) body += chunk

      if (table === 'documents') {
        if (method === 'GET') {
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          let results = [...docStore]
          if (idFilter) results = results.filter(d => d.id === idFilter)
          if (req.headers['accept']?.includes('vnd.pgrst.object+json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results[0] || null))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results))
          }
          return
        }
        if (method === 'PATCH') {
          const updates = JSON.parse(body)
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          for (const doc of docStore) {
            if (idFilter && doc.id !== idFilter) continue
            Object.assign(doc, updates)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(null))
          return
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(null))
    })

    await new Promise<void>(r => server.listen(0, r))
    const port = (server.address() as AddressInfo).port
    resolve({ server, url: `http://127.0.0.1:${port}` })
  })
}

describe('Hierarchical layout (dagre)', () => {
  let sbMock: { server: Server; url: string }

  before(async () => {
    sbMock = await createMockSupabase()
    process.env.SUPABASE_URL = sbMock.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  after(() => { sbMock?.server.close() })

  beforeEach(() => { docStore = [] })

  it('separates overlapping nodes', async () => {
    const { createRequire } = await import('node:module')
    const _require = createRequire(import.meta.url)
    const Y = _require('yjs') as typeof import('yjs')

    // Create a canvas with 3 shapes all at the same position + 2 arrows
    const ydoc = new Y.Doc()
    const yElements = ydoc.getArray('elements')

    const ids = ['theme-1', 'theme-2', 'source-1']
    const elements = [
      { id: 'theme-1', type: 'rectangle', x: 100, y: 100, width: 200, height: 80, text: 'Theme A' },
      { id: 'theme-2', type: 'rectangle', x: 100, y: 100, width: 200, height: 80, text: 'Theme B' },
      { id: 'source-1', type: 'webcard', x: 100, y: 100, width: 280, height: 160, url: 'https://example.com', title: 'Source 1', snippet: 'test' },
      {
        id: 'arrow-1', type: 'line',
        startShapeId: 'theme-1', endShapeId: 'source-1',
        startAnchor: 'right', endAnchor: 'left',
        startX: 0, startY: 0, endX: 0, endY: 0,
        lineType: 'straight', arrowStart: 0, arrowEnd: 1,
      },
      {
        id: 'arrow-2', type: 'line',
        startShapeId: 'theme-2', endShapeId: 'source-1',
        startAnchor: 'right', endAnchor: 'left',
        startX: 0, startY: 0, endX: 0, endY: 0,
        lineType: 'straight', arrowStart: 0, arrowEnd: 1,
      },
    ]

    for (const el of elements) {
      const yEl = new Y.Map()
      for (const [key, value] of Object.entries(el)) {
        yEl.set(key, value)
      }
      yElements.push([yEl])
    }

    const state = Y.encodeStateAsUpdate(ydoc)
    const content = Buffer.from(state).toString('base64')
    ydoc.destroy()

    docStore.push({ id: 'doc-layout-test', type: 'canvas', content, owner_id: 'test-user' })

    const { layoutCanvas } = await import('../src/layout.js')
    await layoutCanvas('doc-layout-test')

    // Read back the content and verify positions changed
    const doc = docStore.find(d => d.id === 'doc-layout-test')!
    assert.ok(doc.content, 'Content should be updated')

    const ydoc2 = new Y.Doc()
    Y.applyUpdate(ydoc2, new Uint8Array(Buffer.from(doc.content!, 'base64')))
    const yEls2 = ydoc2.getArray('elements')

    const positions: Record<string, { x: number; y: number }> = {}
    for (let i = 0; i < yEls2.length; i++) {
      const yEl = yEls2.get(i) as InstanceType<typeof Y.Map>
      const id = yEl.get('id') as string
      if (id.startsWith('arrow')) continue
      positions[id] = { x: yEl.get('x') as number, y: yEl.get('y') as number }
    }
    ydoc2.destroy()

    // All 3 nodes started at (100, 100). After layout, they should be at different positions.
    const posArr = Object.values(positions)
    assert.equal(posArr.length, 3, 'Should have 3 node positions')

    // Check that not all nodes are at the same position
    const allSameX = posArr.every(p => p.x === posArr[0].x)
    const allSameY = posArr.every(p => p.y === posArr[0].y)
    assert.ok(!(allSameX && allSameY), 'Nodes should not all be at the same position after layout')

    // Check minimum distance between any two nodes
    for (let i = 0; i < posArr.length; i++) {
      for (let j = i + 1; j < posArr.length; j++) {
        const dx = posArr[i].x - posArr[j].x
        const dy = posArr[i].y - posArr[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        assert.ok(dist > 20, `Nodes ${i} and ${j} should be separated (dist=${dist.toFixed(0)})`)
      }
    }
  })

  it('skips layout when fewer than 2 nodes', async () => {
    const { createRequire } = await import('node:module')
    const _require = createRequire(import.meta.url)
    const Y = _require('yjs') as typeof import('yjs')

    const ydoc = new Y.Doc()
    const yElements = ydoc.getArray('elements')
    const yEl = new Y.Map()
    yEl.set('id', 'only-one')
    yEl.set('type', 'rectangle')
    yEl.set('x', 50)
    yEl.set('y', 50)
    yEl.set('width', 100)
    yEl.set('height', 60)
    yElements.push([yEl])

    const state = Y.encodeStateAsUpdate(ydoc)
    const content = Buffer.from(state).toString('base64')
    ydoc.destroy()

    docStore.push({ id: 'doc-single', type: 'canvas', content, owner_id: 'test-user' })

    const { layoutCanvas } = await import('../src/layout.js')
    await layoutCanvas('doc-single')

    // Position should not change
    const doc = docStore.find(d => d.id === 'doc-single')!
    const ydoc2 = new Y.Doc()
    Y.applyUpdate(ydoc2, new Uint8Array(Buffer.from(doc.content!, 'base64')))
    const yEls2 = ydoc2.getArray('elements')
    const el = yEls2.get(0) as InstanceType<typeof Y.Map>
    assert.equal(el.get('x'), 50, 'x should be unchanged')
    assert.equal(el.get('y'), 50, 'y should be unchanged')
    ydoc2.destroy()
  })
})
