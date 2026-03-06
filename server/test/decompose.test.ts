import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ── Mock Supabase PostgREST server ──

interface SupabaseMockRoute {
  method: string
  table: string
  handler: (req: IncomingMessage, body: string) => { status: number; data: unknown }
}

let supabaseMockRoutes: SupabaseMockRoute[] = []

function createMockSupabase(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      let body = ''
      for await (const chunk of req) body += chunk

      const route = supabaseMockRoutes.find((r) => r.method === method && r.table === table)
      if (route) {
        const result = route.handler(req, body)
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result.data))
      } else if (url.pathname.includes('.well-known/jwks.json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [] }))
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(null))
      }
    })
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

// ── Mock Anthropic API server ──

let anthropicMockHandler: ((req: IncomingMessage, body: string) => { status: number; data: unknown }) | null = null

function createMockAnthropic(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      for await (const chunk of req) body += chunk

      if (anthropicMockHandler) {
        const result = anthropicMockHandler(req, body)
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result.data))
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'No mock handler configured' }))
      }
    })
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

// ── Helpers ──

async function signToken(sub: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub, role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

// ── Tests ──

describe('Decompose route', () => {
  let appServer: Server
  let appPort: number
  let mockSb: { server: Server; url: string }
  let mockAnthropic: { server: Server; url: string }
  let token: string
  let encryptedKey: string

  before(async () => {
    mockSb = await createMockSupabase()
    mockAnthropic = await createMockAnthropic()

    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.ANTHROPIC_BASE_URL = mockAnthropic.url

    // Encrypt a test API key so decrypt() will succeed
    const { encrypt } = await import('../src/crypto.js')
    encryptedKey = encrypt('sk-ant-test-key')

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
    mockAnthropic.server.close()
  })

  beforeEach(() => {
    supabaseMockRoutes = []
    anthropicMockHandler = null
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
  }

  /** Set up the standard Supabase mock that returns an encrypted API key and accepts document operations */
  function mockKeyAndDocOps() {
    const docId = 'test-doc-' + Date.now()
    supabaseMockRoutes = [
      {
        method: 'GET',
        table: 'user_secrets',
        handler: () => ({ status: 200, data: { encrypted_key: encryptedKey } }),
      },
      {
        method: 'POST',
        table: 'documents',
        handler: () => ({
          status: 201,
          data: {
            id: docId,
            owner_id: TEST_USER_ID,
            title: 'Untitled Research',
            type: 'research',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }),
      },
      {
        method: 'PATCH',
        table: 'documents',
        handler: () => ({ status: 200, data: null }),
      },
    ]
    return docId
  }

  it('returns 401 without auth token', async () => {
    const res = await fetch(url('/api/decompose'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    })
    assert.equal(res.status, 401)
  })

  it('returns 400 when text is missing', async () => {
    const res = await fetch(url('/api/decompose'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('text'))
  })

  it('returns 400 when no API key configured', async () => {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: () => ({ status: 200, data: null }),
    }]

    const res = await fetch(url('/api/decompose'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: 'some text to decompose' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('No API key'))
  })

  it('successfully decomposes text and returns topics', async () => {
    const docId = mockKeyAndDocOps()

    const mockTopics = [
      {
        title: 'Introduction',
        summary: 'The document introduces the main concepts. It provides an overview of the topic.',
        color: '#3b82f6',
        lineRanges: [{ start: 1, end: 5 }],
      },
      {
        title: 'Main Body',
        summary: 'The core argument is presented here. Supporting evidence is discussed in detail.',
        color: '#22c55e',
        lineRanges: [{ start: 6, end: 15 }],
      },
    ]

    anthropicMockHandler = () => ({
      status: 200,
      data: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: JSON.stringify(mockTopics) }],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    })

    const res = await fetch(url('/api/decompose'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15' }),
    })
    assert.equal(res.status, 200)

    const body = await res.json() as { documentId: string; topics: unknown[] }
    assert.ok(body.documentId, 'should return documentId')
    assert.ok(Array.isArray(body.topics), 'topics should be an array')
    assert.equal(body.topics.length, 2)

    const topic = body.topics[0] as Record<string, unknown>
    assert.equal(topic.title, 'Introduction')
    assert.ok((topic.summary as string).includes('main concepts'))
    assert.equal(topic.color, '#3b82f6')
    assert.ok(Array.isArray(topic.lineRanges))
  })

  it('returns 500 when Anthropic returns invalid JSON', async () => {
    mockKeyAndDocOps()

    anthropicMockHandler = () => ({
      status: 200,
      data: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'This is not valid JSON at all' }],
        model: 'claude-haiku-4-5-20251001',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    })

    const res = await fetch(url('/api/decompose'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ text: 'some text' }),
    })
    assert.equal(res.status, 500)

    const body = await res.json() as { error: string; raw?: string }
    assert.ok(body.error.includes('parse') || body.error.includes('JSON') || body.error.includes('Failed'))
    assert.ok(body.raw, 'should include raw response in error')
  })
})
