import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

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
      // Parse URL: /rest/v1/{table}?params
      const url = new URL(req.url || '/', `http://localhost`)
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      // Read body for POST/PATCH
      let body = ''
      for await (const chunk of req) body += chunk

      // Find matching mock route
      const route = mockRoutes.find((r) => r.method === method && r.table === table)
      if (route) {
        const result = route.handler(req, body)
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result.data))
      } else {
        // JWKS endpoint for auth (return empty)
        if (url.pathname.includes('.well-known/jwks.json')) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ keys: [] }))
          return
        }
        // Default: return empty array (no error)
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

async function signToken(sub: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub, role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

// ── Tests ──

describe('Drawings API', () => {
  let appServer: Server
  let appPort: number
  let mockSb: { server: Server; url: string }
  let token: string

  before(async () => {
    mockSb = await createMockSupabase()

    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)

    const { createApp } = await import('../src/app.js')
    const app = await createApp()
    appServer = app.server
    await new Promise<void>((resolve) => {
      appServer.listen(0, () => {
        appPort = (appServer.address() as AddressInfo).port
        resolve()
      })
    })

    token = await signToken(TEST_USER_ID)
  })

  after(() => {
    appServer.close()
    mockSb.server.close()
  })

  beforeEach(() => {
    mockRoutes = []
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${token}`, ...extra }
  }

  it('rejects requests without auth', async () => {
    const res = await fetch(url('/api/drawings'))
    assert.equal(res.status, 401)
  })

  // ── GET /api/drawings ──

  it('GET /api/drawings returns list of drawings', async () => {
    const mockDrawings = [
      { id: 'abc', title: 'My Drawing', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z' },
      { id: 'def', title: 'Untitled', created_at: '2025-01-02T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
    ]
    setMockRoutes([{
      method: 'GET',
      table: 'drawings',
      handler: () => ({ status: 200, data: mockDrawings }),
    }])

    const res = await fetch(url('/api/drawings'), { headers: authHeaders() })
    assert.equal(res.status, 200)
    const body = await res.json() as { drawings: typeof mockDrawings }
    assert.equal(body.drawings.length, 2)
    assert.equal(body.drawings[0].id, 'abc')
    assert.equal(body.drawings[1].title, 'Untitled')
  })

  it('GET /api/drawings returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'drawings',
      handler: () => ({ status: 400, data: { message: 'DB error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/drawings'), { headers: authHeaders() })
    assert.equal(res.status, 500)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'Failed to list drawings')
  })

  // ── POST /api/drawings ──

  it('POST /api/drawings creates a new drawing when ID does not exist', async () => {
    const drawingId = '11111111-1111-1111-1111-111111111111'
    let insertBody = ''

    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({ status: 200, data: null }), // not found
      },
      {
        method: 'POST',
        table: 'drawings',
        handler: (_req, body) => {
          insertBody = body
          return {
            status: 200,
            data: { id: drawingId, owner_id: TEST_USER_ID, title: 'Untitled', created_at: '2025-01-01', updated_at: '2025-01-01' },
          }
        },
      },
    ])

    const res = await fetch(url('/api/drawings'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: drawingId }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { drawing: { id: string; title: string } }
    assert.equal(body.drawing.id, drawingId)
    assert.equal(body.drawing.title, 'Untitled')

    const parsed = JSON.parse(insertBody)
    assert.equal(parsed.id, drawingId)
    assert.equal(parsed.title, 'Untitled')
  })

  it('POST /api/drawings returns existing drawing without modification', async () => {
    const drawingId = '22222222-2222-2222-2222-222222222222'
    let insertCalled = false

    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({
          status: 200,
          data: { id: drawingId, title: 'My Renamed Drawing', created_at: '2025-01-01', updated_at: '2025-06-01' },
        }),
      },
      {
        method: 'POST',
        table: 'drawings',
        handler: () => {
          insertCalled = true
          return { status: 200, data: {} }
        },
      },
    ])

    const res = await fetch(url('/api/drawings'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: drawingId }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { drawing: { id: string; title: string } }
    assert.equal(body.drawing.title, 'My Renamed Drawing', 'should return existing title, not overwrite it')
    assert.equal(insertCalled, false, 'should not insert when drawing already exists')
  })

  it('POST /api/drawings uses provided title for new drawing', async () => {
    let insertBody = ''

    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({ status: 200, data: null }),
      },
      {
        method: 'POST',
        table: 'drawings',
        handler: (_req, body) => {
          insertBody = body
          return {
            status: 200,
            data: { id: 'new-id', owner_id: TEST_USER_ID, title: 'My Diagram', created_at: '2025-01-01', updated_at: '2025-01-01' },
          }
        },
      },
    ])

    const res = await fetch(url('/api/drawings'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: 'new-id', title: 'My Diagram' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { drawing: { title: string } }
    assert.equal(body.drawing.title, 'My Diagram')

    const parsed = JSON.parse(insertBody)
    assert.equal(parsed.title, 'My Diagram')
  })

  it('POST /api/drawings returns 500 on DB error', async () => {
    setMockRoutes([
      {
        method: 'GET',
        table: 'drawings',
        handler: () => ({ status: 200, data: null }),
      },
      {
        method: 'POST',
        table: 'drawings',
        handler: () => ({ status: 400, data: { message: 'conflict', code: 'PGRST000' } }),
      },
    ])

    const res = await fetch(url('/api/drawings'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: 'some-id' }),
    })
    assert.equal(res.status, 500)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'Failed to create drawing')
  })

  // ── PATCH /api/drawings/:id ──

  it('PATCH /api/drawings/:id renames a drawing', async () => {
    let capturedBody = ''
    let capturedUrl = ''

    setMockRoutes([{
      method: 'PATCH',
      table: 'drawings',
      handler: (req, body) => {
        capturedBody = body
        capturedUrl = req.url || ''
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/drawings/abc-123'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Renamed' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { ok: boolean }
    assert.equal(body.ok, true)

    // Verify the update was sent to PostgREST
    const parsed = JSON.parse(capturedBody)
    assert.equal(parsed.title, 'Renamed')
    assert.ok(parsed.updated_at, 'should include updated_at')

    // Verify filters in URL
    assert.ok(capturedUrl.includes('id=eq.abc-123'), 'should filter by drawing id')
    assert.ok(capturedUrl.includes(`owner_id=eq.${TEST_USER_ID}`), 'should filter by owner_id')
  })

  it('PATCH /api/drawings/:id returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'PATCH',
      table: 'drawings',
      handler: () => ({ status: 400, data: { message: 'error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/drawings/abc-123'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'X' }),
    })
    assert.equal(res.status, 500)
  })

  // ── DELETE /api/drawings/:id ──

  it('DELETE /api/drawings/:id deletes a drawing', async () => {
    let capturedUrl = ''

    setMockRoutes([{
      method: 'DELETE',
      table: 'drawings',
      handler: (req) => {
        capturedUrl = req.url || ''
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/drawings/abc-123'), {
      method: 'DELETE',
      headers: authHeaders(),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { ok: boolean }
    assert.equal(body.ok, true)

    // Verify filters
    assert.ok(capturedUrl.includes('id=eq.abc-123'))
    assert.ok(capturedUrl.includes(`owner_id=eq.${TEST_USER_ID}`))
  })

  it('DELETE /api/drawings/:id returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'DELETE',
      table: 'drawings',
      handler: () => ({ status: 400, data: { message: 'error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/drawings/abc-123'), {
      method: 'DELETE',
      headers: authHeaders(),
    })
    assert.equal(res.status, 500)
  })
})
