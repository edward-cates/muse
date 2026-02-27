import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { type Server } from 'node:http'
import { type AddressInfo } from 'node:net'
import WebSocket from 'ws'
import * as jose from 'jose'

const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long'
const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000'

// Set env before importing app
process.env.SUPABASE_URL = 'http://localhost:54421'
process.env.SUPABASE_JWT_SECRET = TEST_JWT_SECRET
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ENCRYPTION_KEY = 'a'.repeat(64)
process.env.DATA_DIR = '/tmp/muse-test-data'

const { createApp } = await import('../src/app.js')

async function signToken(
  sub: string,
  opts: { aud?: string; exp?: string } = {},
): Promise<string> {
  const secret = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({
    sub,
    role: 'authenticated',
    aud: opts.aud ?? 'authenticated',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '1h')
    .sign(secret)
}

function connectWs(port: number, room: string, token?: string): Promise<WebSocket> {
  const params = token ? `?token=${token}` : ''
  const ws = new WebSocket(`ws://127.0.0.1:${port}/${room}${params}`)
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
    // y-websocket server may not close cleanly on auth failure,
    // so also listen for unexpected close
    ws.on('close', (code) => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket closed with code ${code}`))
      }
    })
  })
}

describe('WebSocket authentication', () => {
  let server: Server
  let port: number

  before(async () => {
    const app = await createApp()
    server = app.server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port
        resolve()
      })
    })
  })

  after(() => {
    server.close()
  })

  it('rejects connections with no token', async () => {
    await assert.rejects(
      () => connectWs(port, 'test-room'),
      (err: Error) => {
        assert.ok(err.message.includes('close') || err.message.includes('401') || err.message.includes('Unexpected'),
          `Expected auth rejection, got: ${err.message}`)
        return true
      },
    )
  })

  it('rejects connections with an invalid token', async () => {
    await assert.rejects(
      () => connectWs(port, 'test-room', 'garbage-token'),
      (err: Error) => {
        assert.ok(err.message.includes('close') || err.message.includes('401') || err.message.includes('Unexpected'),
          `Expected auth rejection, got: ${err.message}`)
        return true
      },
    )
  })

  it('rejects connections with wrong audience', async () => {
    const token = await signToken(TEST_USER_ID, { aud: 'wrong-audience' })
    await assert.rejects(
      () => connectWs(port, 'test-room', token),
      (err: Error) => {
        assert.ok(err.message.includes('close') || err.message.includes('401') || err.message.includes('Unexpected'),
          `Expected auth rejection, got: ${err.message}`)
        return true
      },
    )
  })

  it('accepts connections with a valid token', async () => {
    const token = await signToken(TEST_USER_ID)
    const ws = await connectWs(port, 'test-room', token)
    assert.equal(ws.readyState, WebSocket.OPEN)
    ws.close()
  })
})

describe('HTTP authentication', () => {
  let server: Server
  let port: number

  before(async () => {
    const app = await createApp()
    server = app.server
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port
        resolve()
      })
    })
  })

  after(() => {
    server.close()
  })

  it('health check works without auth', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'ok')
  })

  it('rejects API requests without auth header', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/keys/status`)
    assert.equal(res.status, 401)
  })

  it('rejects API requests with invalid token', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/keys/status`, {
      headers: { Authorization: 'Bearer garbage' },
    })
    assert.equal(res.status, 401)
  })

  it('accepts API requests with valid token', async () => {
    const token = await signToken(TEST_USER_ID)
    const res = await fetch(`http://127.0.0.1:${port}/api/keys/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // Will fail at Supabase query (no real DB), but should pass auth (not 401)
    assert.notEqual(res.status, 401)
  })
})
