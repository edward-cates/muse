import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// ── Mock upstream server ──
let mockUpstreamHandler: (req: IncomingMessage, res: ServerResponse) => void

function createMockUpstream(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => mockUpstreamHandler(req, res))
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port
      resolve({ server, url: `http://127.0.0.1:${port}` })
    })
  })
}

// ── Mock Supabase ──
function createMockSupabase(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', 'http://localhost')
      if (url.pathname.includes('.well-known/jwks.json')) {
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

async function signToken(sub: string): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub, role: 'authenticated', aud: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

describe('Fetch URL route', () => {
  let appServer: Server
  let appPort: number
  let mockSb: { server: Server; url: string }
  let mockUpstream: { server: Server; url: string }
  let token: string

  before(async () => {
    mockSb = await createMockSupabase()
    mockUpstream = await createMockUpstream()

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
    mockUpstream.server.close()
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  it('fetches URL and returns extracted text + title', async () => {
    mockUpstreamHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><head><title>Test Page</title></head><body><p>Hello world</p></body></html>')
    }

    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url: mockUpstream.url }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { title: string; text: string; url: string }
    assert.equal(body.title, 'Test Page')
    assert.ok(body.text.includes('Hello world'))
    assert.equal(body.url, mockUpstream.url)
  })

  it('rejects non-HTTP URLs with 400', async () => {
    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url: 'file:///etc/passwd' }),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('http'))
  })

  it('returns 400 when url is missing', async () => {
    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
  })

  it('requires valid JWT (401 without auth)', async () => {
    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    assert.equal(res.status, 401)
  })

  it('truncates response to 5000 chars of text content', async () => {
    mockUpstreamHandler = (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      const longText = 'A'.repeat(10000)
      res.end(`<html><body><p>${longText}</p></body></html>`)
    }

    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url: mockUpstream.url }),
    })
    assert.equal(res.status, 200)
    const body = await res.json() as { text: string }
    assert.ok(body.text.length <= 5000)
  })

  it('handles upstream errors gracefully', async () => {
    mockUpstreamHandler = (_req, res) => {
      res.writeHead(500)
      res.end('Internal Server Error')
    }

    const res = await fetch(url('/api/fetch'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ url: mockUpstream.url }),
    })
    assert.equal(res.status, 502)
  })
})
