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

describe('Documents API', () => {
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
    const res = await fetch(url('/api/documents'))
    assert.equal(res.status, 401)
  })

  // ── GET /api/documents ──

  it('GET /api/documents returns list of documents', async () => {
    const mockDocuments = [
      { id: 'abc', title: 'My Drawing', type: 'canvas', content_version: 0, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-06-01T00:00:00Z' },
      { id: 'def', title: 'Untitled', type: 'canvas', content_version: 0, created_at: '2025-01-02T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
    ]
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({ status: 200, data: mockDocuments }),
    }])

    const res = await fetch(url('/api/documents'), { headers: authHeaders() })
    assert.equal(res.status, 200)
    const body = await res.json() as { documents: typeof mockDocuments }
    assert.equal(body.documents.length, 2)
    assert.equal(body.documents[0].id, 'abc')
    assert.equal(body.documents[1].title, 'Untitled')
  })

  it('GET /api/documents filters by type', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: (req) => {
        const reqUrl = new URL(req.url || '/', 'http://localhost')
        const typeFilter = reqUrl.searchParams.get('type')
        assert.equal(typeFilter, 'eq.html_artifact')
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/documents?type=html_artifact'), { headers: authHeaders() })
    assert.equal(res.status, 200)
  })

  it('GET /api/documents returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({ status: 400, data: { message: 'DB error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/documents'), { headers: authHeaders() })
    assert.equal(res.status, 500)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'Failed to list documents')
  })

  // ── POST /api/documents ──

  it('POST /api/documents creates a new document when ID does not exist', async () => {
    const documentId = '11111111-1111-1111-1111-111111111111'
    let insertBody = ''

    setMockRoutes([
      {
        method: 'GET',
        table: 'documents',
        handler: () => ({ status: 200, data: null }), // not found
      },
      {
        method: 'POST',
        table: 'documents',
        handler: (_req, body) => {
          insertBody = body
          return {
            status: 200,
            data: { id: documentId, owner_id: TEST_USER_ID, title: 'Untitled', type: 'canvas', content_version: 0, created_at: '2025-01-01', updated_at: '2025-01-01' },
          }
        },
      },
    ])

    const res = await fetch(url('/api/documents'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: documentId }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { document: { id: string; title: string; type: string } }
    assert.equal(body.document.id, documentId)
    assert.equal(body.document.title, 'Untitled')
    assert.equal(body.document.type, 'canvas')

    const parsed = JSON.parse(insertBody)
    assert.equal(parsed.id, documentId)
    assert.equal(parsed.title, 'Untitled')
    assert.equal(parsed.type, 'canvas')
  })

  it('POST /api/documents returns existing document without modification', async () => {
    const documentId = '22222222-2222-2222-2222-222222222222'
    let insertCalled = false

    setMockRoutes([
      {
        method: 'GET',
        table: 'documents',
        handler: () => ({
          status: 200,
          data: { id: documentId, title: 'My Renamed Drawing', type: 'canvas', content_version: 0, created_at: '2025-01-01', updated_at: '2025-06-01' },
        }),
      },
      {
        method: 'POST',
        table: 'documents',
        handler: () => {
          insertCalled = true
          return { status: 200, data: {} }
        },
      },
    ])

    const res = await fetch(url('/api/documents'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: documentId }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { document: { id: string; title: string } }
    assert.equal(body.document.title, 'My Renamed Drawing', 'should return existing title, not overwrite it')
    assert.equal(insertCalled, false, 'should not insert when document already exists')
  })

  it('POST /api/documents uses provided title for new document', async () => {
    let insertBody = ''

    setMockRoutes([
      {
        method: 'GET',
        table: 'documents',
        handler: () => ({ status: 200, data: null }),
      },
      {
        method: 'POST',
        table: 'documents',
        handler: (_req, body) => {
          insertBody = body
          return {
            status: 200,
            data: { id: 'new-id', owner_id: TEST_USER_ID, title: 'My Diagram', type: 'canvas', content_version: 0, created_at: '2025-01-01', updated_at: '2025-01-01' },
          }
        },
      },
    ])

    const res = await fetch(url('/api/documents'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: 'new-id', title: 'My Diagram' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { document: { title: string } }
    assert.equal(body.document.title, 'My Diagram')

    const parsed = JSON.parse(insertBody)
    assert.equal(parsed.title, 'My Diagram')
  })

  it('POST /api/documents returns 500 on DB error', async () => {
    setMockRoutes([
      {
        method: 'GET',
        table: 'documents',
        handler: () => ({ status: 200, data: null }),
      },
      {
        method: 'POST',
        table: 'documents',
        handler: () => ({ status: 400, data: { message: 'conflict', code: 'PGRST000' } }),
      },
    ])

    const res = await fetch(url('/api/documents'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: 'some-id' }),
    })
    assert.equal(res.status, 500)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'Failed to create document')
  })

  it('POST /api/documents returns 401 on foreign key violation (user not in auth.users)', async () => {
    setMockRoutes([
      {
        method: 'GET',
        table: 'documents',
        handler: () => ({ status: 200, data: null }),
      },
      {
        method: 'POST',
        table: 'documents',
        handler: () => ({
          status: 400,
          data: { message: 'insert or update on table "documents" violates foreign key constraint "documents_owner_id_fkey"', code: '23503' },
        }),
      },
    ])

    const res = await fetch(url('/api/documents'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Test' }),
    })
    assert.equal(res.status, 401)
    const body = await res.json() as { error: string }
    assert.match(body.error, /sign out/)
  })

  // ── PATCH /api/documents/:id ──

  it('PATCH /api/documents/:id renames a document', async () => {
    let capturedBody = ''
    let capturedUrl = ''

    setMockRoutes([{
      method: 'PATCH',
      table: 'documents',
      handler: (req, body) => {
        capturedBody = body
        capturedUrl = req.url || ''
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/documents/abc-123'), {
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
    assert.ok(capturedUrl.includes('id=eq.abc-123'), 'should filter by document id')
    assert.ok(capturedUrl.includes(`owner_id=eq.${TEST_USER_ID}`), 'should filter by owner_id')
  })

  it('PATCH /api/documents/:id returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'PATCH',
      table: 'documents',
      handler: () => ({ status: 400, data: { message: 'error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/documents/abc-123'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'X' }),
    })
    assert.equal(res.status, 500)
  })

  // ── DELETE /api/documents/:id ──

  it('DELETE /api/documents/:id deletes a document', async () => {
    let capturedUrl = ''

    setMockRoutes([{
      method: 'DELETE',
      table: 'documents',
      handler: (req) => {
        capturedUrl = req.url || ''
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/documents/abc-123'), {
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

  it('DELETE /api/documents/:id returns 500 on DB error', async () => {
    setMockRoutes([{
      method: 'DELETE',
      table: 'documents',
      handler: () => ({ status: 400, data: { message: 'error', code: 'PGRST000' } }),
    }])

    const res = await fetch(url('/api/documents/abc-123'), {
      method: 'DELETE',
      headers: authHeaders(),
    })
    assert.equal(res.status, 500)
  })

  // ── GET /api/documents/:id/content ──

  it('GET /api/documents/:id/content returns content and version', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: '<h1>Hello</h1>', content_version: 3 },
      }),
    }])

    const res = await fetch(url('/api/documents/abc-123/content'), { headers: authHeaders() })
    assert.equal(res.status, 200)
    const body = await res.json() as { content: string; content_version: number }
    assert.equal(body.content, '<h1>Hello</h1>')
    assert.equal(body.content_version, 3)
  })

  it('GET /api/documents/:id/content returns 404 when not found', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({ status: 200, data: null }),
    }])

    const res = await fetch(url('/api/documents/nonexistent/content'), { headers: authHeaders() })
    assert.equal(res.status, 404)
  })

  // ── PATCH /api/documents/:id/content ──

  it('PATCH /api/documents/:id/content updates content and bumps version', async () => {
    let patchBody = ''

    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content_version: 2 },
      }),
    }, {
      method: 'PATCH',
      table: 'documents',
      handler: (_req, body) => {
        patchBody = body
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/documents/abc-123/content'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: '<h1>Updated</h1>' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { content_version: number }
    assert.equal(body.content_version, 3)

    const parsed = JSON.parse(patchBody)
    assert.equal(parsed.content, '<h1>Updated</h1>')
    assert.equal(parsed.content_version, 3)
  })

  it('PATCH /api/documents/:id/content returns 404 when not found', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({ status: 200, data: null }),
    }])

    const res = await fetch(url('/api/documents/nonexistent/content'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content: '<p>test</p>' }),
    })
    assert.equal(res.status, 404)
  })

  // ── POST /api/documents/:id/elements ──

  it('POST /api/documents/:id/elements adds elements to a canvas Yjs doc', async () => {
    let patchBody = ''

    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: null, type: 'canvas' },
      }),
    }, {
      method: 'PATCH',
      table: 'documents',
      handler: (_req, body) => {
        patchBody = body
        return { status: 200, data: [] }
      },
    }])

    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        elements: [
          { type: 'webcard', x: 100, y: 100, width: 280, height: 160, url: 'https://example.com', title: 'Test', snippet: 'A test card' },
        ],
      }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { ids: string[]; count: number }
    assert.equal(body.count, 1)
    assert.equal(body.ids.length, 1)
    assert.ok(body.ids[0], 'Should return a generated ID')

    // Verify the Yjs state was written as base64
    const parsed = JSON.parse(patchBody)
    assert.ok(parsed.content, 'Should write base64 Yjs state')
    assert.ok(parsed.content.length > 10, 'Content should be non-trivial base64')
  })

  it('POST /api/documents/:id/elements rejects empty elements array', async () => {
    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elements: [] }),
    })
    assert.equal(res.status, 400)
  })

  it('POST /api/documents/:id/elements rejects non-canvas documents', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: null, type: 'html_artifact' },
      }),
    }])

    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elements: [{ type: 'webcard', x: 0, y: 0 }] }),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('canvas'))
  })

  it('POST /api/documents/:id/elements returns 404 for nonexistent doc', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({ status: 200, data: null }),
    }])

    const res = await fetch(url('/api/documents/nonexistent/elements'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elements: [{ type: 'webcard', x: 0, y: 0 }] }),
    })
    assert.equal(res.status, 404)
  })

  // ── PATCH /api/documents/:id/elements ──

  it('PATCH /api/documents/:id/elements updates an element in a canvas Yjs doc', async () => {
    // First create a doc with an element via POST, then update it via PATCH
    let savedContent = ''

    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: null, type: 'canvas' },
      }),
    }, {
      method: 'PATCH',
      table: 'documents',
      handler: (_req, body) => {
        savedContent = JSON.parse(body).content
        return { status: 200, data: [] }
      },
    }])

    // Step 1: Add an element
    const addRes = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        elements: [{ id: 'elem-1', type: 'webcard', x: 100, y: 100, title: 'Original' }],
      }),
    })
    assert.equal(addRes.status, 200)
    const addBody = await addRes.json() as { ids: string[] }
    assert.equal(addBody.ids[0], 'elem-1')

    // Step 2: Now update the element — mock returns the saved content from step 1
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: savedContent, type: 'canvas' },
      }),
    }, {
      method: 'PATCH',
      table: 'documents',
      handler: (_req, body) => {
        savedContent = JSON.parse(body).content
        return { status: 200, data: [] }
      },
    }])

    const patchRes = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elementId: 'elem-1', updates: { title: 'Updated Title', description: 'New summary' } }),
    })
    assert.equal(patchRes.status, 200)
    const patchBody = await patchRes.json() as { success: boolean; elementId: string }
    assert.equal(patchBody.success, true)
    assert.equal(patchBody.elementId, 'elem-1')
  })

  it('PATCH /api/documents/:id/elements returns 404 for nonexistent element', async () => {
    setMockRoutes([{
      method: 'GET',
      table: 'documents',
      handler: () => ({
        status: 200,
        data: { content: null, type: 'canvas' },
      }),
    }])

    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elementId: 'nonexistent', updates: { title: 'X' } }),
    })
    assert.equal(res.status, 404)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('nonexistent'))
  })

  it('PATCH /api/documents/:id/elements rejects missing elementId', async () => {
    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ updates: { title: 'X' } }),
    })
    assert.equal(res.status, 400)
  })

  it('PATCH /api/documents/:id/elements rejects empty updates', async () => {
    const res = await fetch(url('/api/documents/abc-123/elements'), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ elementId: 'elem-1', updates: {} }),
    })
    assert.equal(res.status, 400)
  })

  // ── Backward compatibility: /api/drawings alias ──

  it('/api/drawings alias still works', async () => {
    const res = await fetch(url('/api/drawings'), { headers: authHeaders() })
    // Should not 404 — the alias routes to the same handler
    assert.notEqual(res.status, 404)
  })
})
