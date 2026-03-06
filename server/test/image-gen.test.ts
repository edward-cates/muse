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

interface OpenAIMockConfig {
  status?: number
  response?: unknown
  captureBody?: (body: Record<string, unknown>) => void
}

let openaiMockConfig: OpenAIMockConfig = {}

function setOpenAIMock(config: OpenAIMockConfig) {
  openaiMockConfig = config
}

function createMockOpenAI(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      for await (const chunk of req) body += chunk

      if (openaiMockConfig.captureBody) {
        openaiMockConfig.captureBody(JSON.parse(body))
      }

      const status = openaiMockConfig.status || 200
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(openaiMockConfig.response || {}))
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
  let encryptedKey: string

  before(async () => {
    mockSb = await createMockSupabase()
    mockOpenAI = await createMockOpenAI()

    process.env.SUPABASE_URL = mockSb.url
    process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.OPENAI_BASE_URL = mockOpenAI.url

    // Encrypt a test OpenAI key
    const { encrypt } = await import('../src/crypto.js')
    encryptedKey = encrypt('sk-test-openai-key')

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
    openaiMockConfig = {}
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  function mockOpenAIKeyExists() {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: (req) => {
        // Only return key when querying for openai provider
        const reqUrl = new URL(req.url || '/', 'http://localhost')
        const rawSelect = reqUrl.searchParams.get('select') || ''
        // The Supabase client encodes filters as query params
        return { status: 200, data: { encrypted_key: encryptedKey } }
      },
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
    assert.equal(body.error, 'prompt string is required')
  })

  it('returns 400 when no OpenAI key is configured', async () => {
    // Supabase returns null (no row)
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
    assert.ok(body.error.includes('No OpenAI API key'))
  })

  it('returns generated image as data URL on success', async () => {
    mockOpenAIKeyExists()
    setOpenAIMock({
      response: {
        data: [{
          b64_json: 'iVBORw0KGgoAAAANSUhEUg==',
          revised_prompt: 'A cute orange tabby cat sitting on a windowsill',
        }],
      },
    })

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a cat' }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { url: string; revised_prompt: string }
    assert.ok(body.url.startsWith('data:image/png;base64,'), 'should return a data URL')
    assert.equal(body.url, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
    assert.equal(body.revised_prompt, 'A cute orange tabby cat sitting on a windowsill')
  })

  it('passes prompt, size, and quality to OpenAI API', async () => {
    mockOpenAIKeyExists()

    let capturedBody: Record<string, unknown> | null = null
    setOpenAIMock({
      response: { data: [{ b64_json: 'AAAA' }] },
      captureBody: (body) => { capturedBody = body },
    })

    await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a sunset over mountains', size: '1792x1024', quality: 'hd' }),
    })

    assert.ok(capturedBody, 'should capture the request body')
    assert.equal(capturedBody!.model, 'dall-e-3')
    assert.equal(capturedBody!.prompt, 'a sunset over mountains')
    assert.equal(capturedBody!.size, '1792x1024')
    assert.equal(capturedBody!.quality, 'hd')
    assert.equal(capturedBody!.n, 1)
    assert.equal(capturedBody!.response_format, 'b64_json')
  })

  it('uses default size and quality when not specified', async () => {
    mockOpenAIKeyExists()

    let capturedBody: Record<string, unknown> | null = null
    setOpenAIMock({
      response: { data: [{ b64_json: 'AAAA' }] },
      captureBody: (body) => { capturedBody = body },
    })

    await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a cat' }),
    })

    assert.ok(capturedBody)
    assert.equal(capturedBody!.size, '1024x1024')
    assert.equal(capturedBody!.quality, 'standard')
  })

  it('returns 502 when OpenAI API returns an error', async () => {
    mockOpenAIKeyExists()
    setOpenAIMock({
      status: 400,
      response: { error: { message: 'Your request was rejected as a result of our safety system.' } },
    })

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'something inappropriate' }),
    })
    assert.equal(res.status, 502)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('safety system'))
  })

  it('returns 502 with generic message when OpenAI error is unparseable', async () => {
    mockOpenAIKeyExists()
    setOpenAIMock({
      status: 500,
      response: 'Internal Server Error',
    })

    const res = await fetch(url('/api/image-gen'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ prompt: 'a cat' }),
    })
    assert.equal(res.status, 502)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('OpenAI API error'))
  })
})
