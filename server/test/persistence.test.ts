import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as Y from 'yjs'

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ── Mock Supabase PostgREST server ──

interface MockRoute {
  method: string
  table: string
  handler: (req: IncomingMessage, body: string) => { status: number; data: unknown }
}

let mockRoutes: MockRoute[] = []

function setMockRoutes(routes: MockRoute[]) {
  mockRoutes = routes
}

function createMockSupabase(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost`)
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      let body = ''
      for await (const chunk of req) body += chunk

      const route = mockRoutes.find((r) => r.method === method && r.table === table)
      if (route) {
        const result = route.handler(req, body)
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result.data))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify([]))
      }
    })

    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

// Helper: create a Yjs doc with one element and return its base64-encoded state
function makeDocContent(): { base64: string; doc: Y.Doc } {
  const doc = new Y.Doc()
  doc.getArray('elements').push([new Y.Map(Object.entries({ id: 'shape-1', type: 'rectangle' }))])
  const state = Y.encodeStateAsUpdate(doc)
  return { base64: Buffer.from(state).toString('base64'), doc }
}

// ── Tests ──

describe('Yjs Supabase persistence', () => {
  let mockSb: { server: Server; url: string }

  before(async () => {
    mockSb = await createMockSupabase()
    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  after(() => {
    mockSb.server.close()
  })

  beforeEach(() => {
    mockRoutes = []
  })

  it('bindState loads content from DB', async () => {
    const { base64, doc: srcDoc } = makeDocContent()
    srcDoc.destroy()

    setMockRoutes([{
      method: 'GET',
      table: 'drawings',
      handler: () => ({ status: 200, data: { content: base64 } }),
    }])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()
    await persistence.bindState('muse-abc-123', doc)

    const elements = doc.getArray('elements')
    assert.equal(elements.length, 1)
    const el = elements.get(0) as Y.Map<unknown>
    assert.equal(el.get('id'), 'shape-1')
    assert.equal(el.get('type'), 'rectangle')
    doc.destroy()
  })

  it('update triggers debounced DB write', async () => {
    let patchCount = 0
    let capturedBody = ''

    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({ status: 200, data: { content: null } }),
      },
      {
        method: 'PATCH',
        table: 'drawings',
        handler: (_req, body) => {
          patchCount++
          capturedBody = body
          return { status: 200, data: [] }
        },
      },
    ])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()
    await persistence.bindState('muse-debounce-test', doc)

    doc.getArray('elements').push([new Y.Map(Object.entries({ id: 'a', type: 'ellipse' }))])

    // Should not have written yet (500ms debounce)
    assert.equal(patchCount, 0)

    await wait(700)

    assert.equal(patchCount, 1)
    // Verify content was sent as base64
    const parsed = JSON.parse(capturedBody)
    assert.ok(parsed.content, 'should include content')
    assert.equal(parsed.updated_at, undefined, 'should not include updated_at')

    // Decode and verify
    const loaded = new Y.Doc()
    Y.applyUpdate(loaded, new Uint8Array(Buffer.from(parsed.content, 'base64')))
    assert.equal(loaded.getArray('elements').length, 1)
    loaded.destroy()
    doc.destroy()
  })

  it('writeState saves immediately', async () => {
    let patchCount = 0
    let capturedBody = ''
    let capturedUrl = ''

    setMockRoutes([{
      method: 'PATCH',
      table: 'drawings',
      handler: (req, body) => {
        patchCount++
        capturedBody = body
        capturedUrl = req.url || ''
        return { status: 200, data: [] }
      },
    }])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()
    doc.getArray('elements').push([new Y.Map(Object.entries({ id: 'b', type: 'diamond' }))])

    await persistence.writeState('muse-immediate-test', doc)

    assert.equal(patchCount, 1)
    // Should strip muse- prefix to get drawing ID
    assert.ok(capturedUrl.includes('id=eq.immediate-test'), 'should filter by drawing id without muse- prefix')

    const parsed = JSON.parse(capturedBody)
    const loaded = new Y.Doc()
    Y.applyUpdate(loaded, new Uint8Array(Buffer.from(parsed.content, 'base64')))
    assert.equal(loaded.getArray('elements').length, 1)
    loaded.destroy()
    doc.destroy()
  })

  it('writeState cancels pending debounced write', async () => {
    let patchCount = 0

    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({ status: 200, data: { content: null } }),
      },
      {
        method: 'PATCH',
        table: 'drawings',
        handler: () => {
          patchCount++
          return { status: 200, data: [] }
        },
      },
    ])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()
    await persistence.bindState('muse-cancel-test', doc)

    // Trigger debounced write
    doc.getArray('elements').push([new Y.Map(Object.entries({ id: 'first', type: 'rectangle' }))])

    // Immediately save via writeState (should cancel the pending debounce)
    doc.getArray('elements').push([new Y.Map(Object.entries({ id: 'second', type: 'ellipse' }))])
    await persistence.writeState('muse-cancel-test', doc)

    assert.equal(patchCount, 1, 'writeState should have written once')

    // Wait past the debounce period — cancelled timer should not fire
    await wait(700)

    assert.equal(patchCount, 1, 'debounced write should have been cancelled')
    doc.destroy()
  })

  it('bindState with no content — doc stays empty', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'drawings',
      handler: () => ({ status: 200, data: { content: null } }),
    }])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()
    await persistence.bindState('muse-empty-test', doc)

    assert.equal(doc.getArray('elements').length, 0)
    doc.destroy()
  })

  it('bindState with no drawing row — no error', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'drawings',
      handler: () => ({ status: 406, data: { code: 'PGRST116', message: 'not found' } }),
    }])

    const { setupPersistence } = await import('../src/persistence.js')
    const persistence = setupPersistence()
    const doc = new Y.Doc()

    // Should not throw
    await persistence.bindState('muse-missing-test', doc)
    assert.equal(doc.getArray('elements').length, 0)
    doc.destroy()
  })
})
