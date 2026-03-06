import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '660e8400-e29b-41d4-a716-446655440000'

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

describe('Chat persistence routes', () => {
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
    supabaseMockRoutes = []
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  it('returns 401 without auth token', async () => {
    const res = await fetch(url('/api/ai/chats'), {
      headers: { 'Content-Type': 'application/json' },
    })
    assert.equal(res.status, 401)
  })

  it('POST /api/ai/chats returns 400 when messages is missing', async () => {
    const res = await fetch(url('/api/ai/chats'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'messages array is required')
  })

  it('POST /api/ai/chats creates a new chat and derives title', async () => {
    supabaseMockRoutes = [{
      method: 'POST',
      table: 'ai_chats',
      handler: (_req, body) => {
        const parsed = JSON.parse(body)
        return {
          status: 201,
          data: {
            id: 'chat-123',
            title: parsed.title,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }
      },
    }]

    const messages = [
      { role: 'user', content: 'What is React?' },
      { role: 'assistant', content: 'React is a JavaScript library.' },
    ]

    const res = await fetch(url('/api/ai/chats'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { id: string; title: string }
    assert.equal(body.id, 'chat-123')
    assert.equal(body.title, 'What is React?')
  })

  it('POST /api/ai/chats with id updates existing chat', async () => {
    let patchCalled = false
    supabaseMockRoutes = [{
      method: 'PATCH',
      table: 'ai_chats',
      handler: () => {
        patchCalled = true
        return { status: 200, data: null }
      },
    }]

    const res = await fetch(url('/api/ai/chats'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        id: 'existing-chat-id',
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    })
    assert.equal(res.status, 200)
    assert.ok(patchCalled, 'should have called PATCH on Supabase')
  })

  it('GET /api/ai/chats lists chats (metadata only)', async () => {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'ai_chats',
      handler: () => ({
        status: 200,
        data: [
          { id: 'c1', title: 'Chat 1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T01:00:00Z' },
          { id: 'c2', title: 'Chat 2', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:30:00Z' },
        ],
      }),
    }]

    const res = await fetch(url('/api/ai/chats'), { headers: authHeaders() })
    assert.equal(res.status, 200)
    const body = await res.json() as { chats: Array<{ id: string; title: string }> }
    assert.equal(body.chats.length, 2)
    assert.equal(body.chats[0].title, 'Chat 1')
    // Should NOT include encrypted_messages
    assert.equal((body.chats[0] as Record<string, unknown>).encrypted_messages, undefined)
  })

  it('GET /api/ai/chats/:id decrypts and returns messages', async () => {
    // Encrypt test messages
    const { encrypt } = await import('../src/crypto.js')
    const testMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ]
    const encryptedMessages = encrypt(JSON.stringify(testMessages))

    supabaseMockRoutes = [{
      method: 'GET',
      table: 'ai_chats',
      handler: () => ({
        status: 200,
        data: {
          id: 'c1',
          title: 'Hello',
          encrypted_messages: encryptedMessages,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      }),
    }]

    const res = await fetch(url('/api/ai/chats/c1'), { headers: authHeaders() })
    assert.equal(res.status, 200)
    const body = await res.json() as { id: string; title: string; messages: Array<{ role: string; content: string }> }
    assert.equal(body.id, 'c1')
    assert.equal(body.messages.length, 2)
    assert.equal(body.messages[0].role, 'user')
    assert.equal(body.messages[0].content, 'Hello')
    assert.equal(body.messages[1].content, 'Hi there!')
  })

  it('GET /api/ai/chats/:id returns 404 for nonexistent chat', async () => {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'ai_chats',
      handler: () => ({ status: 200, data: null }),
    }]

    const res = await fetch(url('/api/ai/chats/nonexistent'), { headers: authHeaders() })
    assert.equal(res.status, 404)
  })

  it('DELETE /api/ai/chats/:id deletes a chat', async () => {
    let deleteCalled = false
    supabaseMockRoutes = [{
      method: 'DELETE',
      table: 'ai_chats',
      handler: () => {
        deleteCalled = true
        return { status: 200, data: null }
      },
    }]

    const res = await fetch(url('/api/ai/chats/c1'), {
      method: 'DELETE',
      headers: authHeaders(),
    })
    assert.equal(res.status, 200)
    assert.ok(deleteCalled)
  })

  it('POST encrypts messages so raw DB content is not plaintext', async () => {
    let capturedBody: string | null = null
    supabaseMockRoutes = [{
      method: 'POST',
      table: 'ai_chats',
      handler: (_req, body) => {
        capturedBody = body
        const parsed = JSON.parse(body)
        return {
          status: 201,
          data: {
            id: 'c-enc',
            title: parsed.title,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }
      },
    }]

    await fetch(url('/api/ai/chats'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        title: 'Test Chat',
        messages: [
          { role: 'user', content: 'Tell me about quantum computing' },
          { role: 'assistant', content: 'Quantum computing uses qubits instead of classical bits.' },
        ],
      }),
    })

    assert.ok(capturedBody, 'should have captured the insert body')
    // The encrypted_messages field should NOT contain the assistant's plaintext response
    // (the title might echo the user's first message, but the full conversation is encrypted)
    assert.ok(!capturedBody!.includes('qubits instead of classical bits'),
      'assistant message plaintext should NOT appear in the DB insert payload')
    assert.ok(capturedBody!.includes('encrypted_messages'),
      'should have encrypted_messages field')
  })

  it('derives title from content blocks when content is array', async () => {
    supabaseMockRoutes = [{
      method: 'POST',
      table: 'ai_chats',
      handler: (_req, body) => {
        const parsed = JSON.parse(body)
        return {
          status: 201,
          data: {
            id: 'c-blocks',
            title: parsed.title,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        }
      },
    }]

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
          { type: 'text', text: 'Draw me a diagram' },
        ],
      },
    ]

    const res = await fetch(url('/api/ai/chats'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages }),
    })
    const body = await res.json() as { title: string }
    assert.equal(body.title, 'Draw me a diagram')
  })
})
