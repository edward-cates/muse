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

interface AnthropicMockConfig {
  events: string[]       // raw SSE event strings to send
  captureBody?: (body: Record<string, unknown>) => void
}

let anthropicMockConfig: AnthropicMockConfig = { events: [] }

function setAnthropicMock(config: AnthropicMockConfig) {
  anthropicMockConfig = config
}

/** Build a standard text-only SSE event sequence */
function textOnlyEvents(text: string): string[] {
  return [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
    `event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n`,
    `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":5}}\n\n`,
    `event: message_stop\ndata: {"type":"message_stop"}\n\n`,
  ]
}

/** Build SSE events that include a tool_use block */
function toolUseEvents(toolId: string, toolName: string, toolInput: Record<string, unknown>): string[] {
  const inputJson = JSON.stringify(toolInput)
  // Split input JSON into two chunks to test partial parsing
  const mid = Math.floor(inputJson.length / 2)
  const part1 = inputJson.slice(0, mid)
  const part2 = inputJson.slice(mid)

  return [
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
    // Text block first
    'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Let me add that."}}\n\n',
    'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    // Tool use block
    `event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"${toolId}","name":"${toolName}","input":{}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(part1)}}}\n\n`,
    `event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(part2)}}}\n\n`,
    `event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n`,
    // Message delta with tool_use stop reason
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":20}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ]
}

function createMockAnthropic(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      for await (const chunk of req) body += chunk

      if (anthropicMockConfig.captureBody) {
        anthropicMockConfig.captureBody(JSON.parse(body))
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      for (const event of anthropicMockConfig.events) {
        res.write(event)
      }
      res.end()
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

/** Parse SSE response body into array of parsed data events */
async function parseSSE(res: Response): Promise<Array<Record<string, unknown> | string>> {
  const text = await res.text()
  const events: Array<Record<string, unknown> | string> = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6)
    if (payload === '[DONE]') {
      events.push('[DONE]')
      continue
    }
    try {
      events.push(JSON.parse(payload))
    } catch {
      events.push(payload)
    }
  }
  return events
}

// ── Tests ──

describe('AI message route', () => {
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
    anthropicMockConfig = { events: [] }
  })

  function url(path: string) {
    return `http://127.0.0.1:${appPort}${path}`
  }

  function authHeaders(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
  }

  /** Set up the standard Supabase mock that returns an encrypted API key */
  function mockKeyExists() {
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: () => ({ status: 200, data: { encrypted_key: encryptedKey } }),
    }]
  }

  it('returns 400 when messages is missing', async () => {
    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.equal(body.error, 'messages array is required')
  })

  it('returns 400 when no API key configured', async () => {
    // Supabase returns null (no row found)
    supabaseMockRoutes = [{
      method: 'GET',
      table: 'user_secrets',
      handler: () => ({ status: 200, data: null }),
    }]

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    })
    assert.equal(res.status, 400)
    const body = await res.json() as { error: string }
    assert.ok(body.error.includes('No API key'))
  })

  it('streams text-only response', async () => {
    mockKeyExists()
    setAnthropicMock({ events: textOnlyEvents('Hello, world!') })

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/event-stream')

    const events = await parseSSE(res)

    // Should have text_delta, content_block_stop, message_delta, and [DONE]
    const textDeltas = events.filter((e) => typeof e === 'object' && e.type === 'text_delta')
    assert.equal(textDeltas.length, 1)
    assert.equal((textDeltas[0] as Record<string, unknown>).text, 'Hello, world!')

    const messageDelta = events.find((e) => typeof e === 'object' && e.type === 'message_delta') as Record<string, unknown>
    assert.equal(messageDelta.stop_reason, 'end_turn')

    assert.ok(events.includes('[DONE]'))
  })

  it('streams tool_use response with correct event types', async () => {
    mockKeyExists()
    setAnthropicMock({
      events: toolUseEvents('toolu_123', 'add_shape', {
        shape_type: 'rectangle', x: 100, y: 100, width: 160, height: 80, text: 'Hello',
      }),
    })

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'draw a box' }] }),
    })
    assert.equal(res.status, 200)

    const events = await parseSSE(res)

    // Text delta
    const textDeltas = events.filter((e) => typeof e === 'object' && e.type === 'text_delta')
    assert.ok(textDeltas.length >= 1)

    // Tool use start
    const toolStart = events.find((e) => typeof e === 'object' && e.type === 'tool_use_start') as Record<string, unknown>
    assert.ok(toolStart, 'should have tool_use_start event')
    assert.equal(toolStart.id, 'toolu_123')
    assert.equal(toolStart.name, 'add_shape')

    // Input JSON deltas
    const inputDeltas = events.filter((e) => typeof e === 'object' && e.type === 'input_json_delta')
    assert.ok(inputDeltas.length >= 1, 'should have input_json_delta events')

    // Verify the partial JSON pieces concatenate to the full input
    const fullJson = inputDeltas.map((d) => (d as Record<string, unknown>).partial_json).join('')
    const parsed = JSON.parse(fullJson)
    assert.equal(parsed.shape_type, 'rectangle')
    assert.equal(parsed.x, 100)
    assert.equal(parsed.text, 'Hello')

    // Content block stop
    const stops = events.filter((e) => typeof e === 'object' && e.type === 'content_block_stop')
    assert.ok(stops.length >= 2, 'should have content_block_stop for text and tool_use blocks')

    // Message delta with tool_use stop reason
    const messageDelta = events.find((e) => typeof e === 'object' && e.type === 'message_delta') as Record<string, unknown>
    assert.equal(messageDelta.stop_reason, 'tool_use')

    assert.ok(events.includes('[DONE]'))
  })

  it('passes tools, system, and model to Anthropic SDK', async () => {
    mockKeyExists()

    let capturedBody: Record<string, unknown> | null = null
    setAnthropicMock({
      events: textOnlyEvents('OK'),
      captureBody: (body) => { capturedBody = body },
    })

    const testTools = [{ name: 'test_tool', description: 'a test', input_schema: { type: 'object', properties: {} } }]

    await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
        system: 'You are a test assistant',
        tools: testTools,
        model: 'claude-sonnet-4-20250514',
      }),
    })

    assert.ok(capturedBody, 'should have captured the request body')
    assert.equal(capturedBody!.model, 'claude-sonnet-4-20250514')
    assert.equal(capturedBody!.system, 'You are a test assistant')
    assert.ok(Array.isArray(capturedBody!.tools))
    assert.equal((capturedBody!.tools as unknown[]).length, 1)
    assert.equal(capturedBody!.stream, true, 'SDK should set stream: true')
  })

  it('defaults model to claude-opus-4-6', async () => {
    mockKeyExists()

    let capturedBody: Record<string, unknown> | null = null
    setAnthropicMock({
      events: textOnlyEvents('OK'),
      captureBody: (body) => { capturedBody = body },
    })

    await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    assert.ok(capturedBody)
    assert.equal(capturedBody!.model, 'claude-opus-4-6')
  })

  it('sends SSE error when Anthropic throws mid-stream', async () => {
    mockKeyExists()

    // Return a response that will cause the SDK to throw during parsing
    anthropicMockConfig = {
      events: [
        'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
      ],
    }

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    })

    // The response should still come back (may be 200 with SSE error, or 500)
    const text = await res.text()
    // Should contain an error indication somewhere
    assert.ok(
      text.includes('error') || text.includes('Error') || res.status === 500,
      `Expected error in response, got status ${res.status}: ${text.slice(0, 200)}`,
    )
  })

  it('passes image content blocks through to Anthropic API', async () => {
    mockKeyExists()

    let capturedBody: Record<string, unknown> | null = null
    setAnthropicMock({
      events: textOnlyEvents('I can see the canvas!'),
      captureBody: (body) => { capturedBody = body },
    })

    // Small base64 image (1x1 red pixel PNG)
    const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='

    await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: tinyPng } },
            { type: 'text', text: 'What do you see?' },
          ],
        }],
      }),
    })

    assert.ok(capturedBody, 'should have captured request body')
    const messages = capturedBody!.messages as Array<{ content: unknown }>
    assert.ok(Array.isArray(messages[0].content), 'user content should be an array')
    const blocks = messages[0].content as Array<Record<string, unknown>>
    const imageBlock = blocks.find((b) => b.type === 'image')
    assert.ok(imageBlock, 'should have image content block')
    assert.equal((imageBlock!.source as Record<string, unknown>).media_type, 'image/png')
  })

  it('forwards server_tool_use events for web_search', async () => {
    mockKeyExists()

    const serverToolEvents = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-opus-4-6","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":1}}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"server_tool_use","id":"srvtoolu_1","name":"web_search","input":{"query":"CRDTs explained"}}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Here are results."}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":10}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]
    setAnthropicMock({ events: serverToolEvents })

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ messages: [{ role: 'user', content: 'search for CRDTs' }] }),
    })
    assert.equal(res.status, 200)

    const events = await parseSSE(res)

    const serverToolStart = events.find((e) => typeof e === 'object' && e.type === 'server_tool_use_start') as Record<string, unknown>
    assert.ok(serverToolStart, 'should have server_tool_use_start event')
    assert.equal(serverToolStart.name, 'web_search')
    assert.deepEqual(serverToolStart.input, { query: 'CRDTs explained' })
  })

  it('handles large payloads up to 10MB', async () => {
    mockKeyExists()
    setAnthropicMock({ events: textOnlyEvents('OK') })

    // Create a ~5MB base64 payload
    const largePng = 'A'.repeat(5 * 1024 * 1024)

    const res = await fetch(url('/api/ai/message'), {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: largePng } },
            { type: 'text', text: 'hi' },
          ],
        }],
      }),
    })

    // Should succeed (not 413 Payload Too Large)
    assert.equal(res.status, 200)
  })
})
