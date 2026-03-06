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

// ── Mock OpenAI API server ──

let openaiMockHandler: ((req: IncomingMessage, body: string) => { status: number; data: unknown }) | null = null

function createMockOpenAI(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      for await (const chunk of req) body += chunk

      if (openaiMockHandler) {
        const result = openaiMockHandler(req, body)
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

describe('Image generation route', () => {
  let appServer: Server
  let appPort: number
  let mockSb: { server: Server; url: string }
  let mockOpenAI: { server: Server; url: string }
  let token: string
  let encryptedOpenAIKey: string

  before(async () => {
    mockSb = await createMockSupabase()
    mockOpenAI = await createMockOpenAI()

    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.OPENAI_BASE_URL = mockOpenAI.url

    // Encrypt a test OpenAI API key
    const { encrypt } = await import('../src/crypto.js')
    encryptedOpenAIKey = encrypt('sk-openai-test-key')

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
    mockOpenAI.server.close()
  })

  beforeEach(() => {
    supabaseMockRoutes = []
    openaiMockHandler = null
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
  }

  /** Set up mock that returns an encrypted OpenAI API key */
  function mockOpenAIKeyExists() {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: () => ({ status: 200, data: { encrypted_key: encryptedOpenAIKey } }),
    }]
  }

  it('returns 401 without auth token', async () => {
    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'a cat' }),
    })
    assert.equal(res.status, 401)
  })

  it('returns 400 when prompt is missing', async () => {
    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('prompt'))
  })

  it('returns 400 when no OpenAI key configured', async () => {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: () => ({ status: 200, data: null }),
    }]

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a cat' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('No') && body.error.includes('key'))
  })

  it('successfully generates image and returns data URL', async () => {
    mockOpenAIKeyExists()

    const testBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

    openaiMockHandler = (_req, body) => {
      const parsed = JSON.parse(body)
      assert.equal(parsed.model, 'dall-e-3')
      assert.equal(parsed.prompt, 'a beautiful sunset')
      assert.equal(parsed.size, '1024x1024')
      assert.equal(parsed.response_format, 'b64_json')
      assert.equal(parsed.n, 1)

      return {
        status: 200,
        data: {
          data: [{ b64_json: testBase64 }],
        },
      }
    }

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a beautiful sunset' }),
    })
    assert.equal(res.status, 200)

    const body = await res.json() as { imageUrl: string }
    assert.ok(body.imageUrl.startsWith('data:image/png;base64,'))
    assert.ok(body.imageUrl.includes(testBase64))
  })

  it('returns 502 when OpenAI call fails', async () => {
    mockOpenAIKeyExists()

    openaiMockHandler = () => ({
      status: 500,
      data: {
        error: {
          message: 'Internal server error',
          type: 'server_error',
        },
      },
    })

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a cat' }),
    })
    assert.equal(res.status, 502)
    const body = await res.json() as { error: string }
    assert.ok(body.error)
  })
})
