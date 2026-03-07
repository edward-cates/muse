/**
 * Mock Anthropic API server for integration tests.
 *
 * - POST /v1/messages — returns canned responses from a FIFO queue
 * - POST /__configure — push response sequence for a test
 * - POST /__reset — clear queue and stored tool results
 *
 * Supports $ref:toolId:field substitution: if a response template contains
 * a string like "$ref:t1:documentId", it will be replaced with the value
 * of `documentId` from the tool result for tool_use_id "t1".
 */

import http from 'node:http'

const PORT = parseInt(process.env.MOCK_ANTHROPIC_PORT || '4999')

interface ContentBlock {
  type: string
  [key: string]: unknown
}

interface MockResponse {
  content: ContentBlock[]
  stop_reason: string
}

let responseQueue: MockResponse[] = []
const toolResults: Record<string, Record<string, unknown>> = {}

// ── $ref substitution ──

function extractToolResults(messages: Array<{ role: string; content: unknown }>): void {
  for (const msg of messages) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) continue
    for (const block of msg.content) {
      if (block.type === 'tool_result' && block.tool_use_id) {
        try {
          const parsed = typeof block.content === 'string' ? JSON.parse(block.content) : block.content
          if (parsed && typeof parsed === 'object') {
            toolResults[block.tool_use_id] = parsed
          }
        } catch { /* skip non-JSON results */ }
      }
    }
  }
}

function substituteRefs(obj: unknown): unknown {
  if (typeof obj === 'string' && obj.startsWith('$ref:')) {
    const parts = obj.split(':')
    const toolId = parts[1]
    const field = parts[2]
    return toolResults[toolId]?.[field] ?? obj
  }
  if (Array.isArray(obj)) return obj.map(substituteRefs)
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = substituteRefs(v)
    }
    return result
  }
  return obj
}

// ── SSE streaming helpers ──

function sseEvent(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function buildStreamingResponse(res: http.ServerResponse, mockResp: MockResponse, model: string) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  // message_start
  res.write(sseEvent('message_start', {
    type: 'message_start',
    message: {
      id: 'msg_mock_' + Date.now(),
      type: 'message',
      role: 'assistant',
      content: [],
      model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 25, output_tokens: 1 },
    },
  }))

  // content blocks
  for (let i = 0; i < mockResp.content.length; i++) {
    const block = mockResp.content[i]

    if (block.type === 'text') {
      res.write(sseEvent('content_block_start', {
        type: 'content_block_start',
        index: i,
        content_block: { type: 'text', text: '' },
      }))
      res.write(sseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: i,
        delta: { type: 'text_delta', text: block.text },
      }))
    } else if (block.type === 'tool_use') {
      res.write(sseEvent('content_block_start', {
        type: 'content_block_start',
        index: i,
        content_block: { type: 'tool_use', id: block.id, name: block.name },
      }))
      res.write(sseEvent('content_block_delta', {
        type: 'content_block_delta',
        index: i,
        delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
      }))
    }

    res.write(sseEvent('content_block_stop', {
      type: 'content_block_stop',
      index: i,
    }))
  }

  // message_delta + message_stop
  res.write(sseEvent('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: mockResp.stop_reason, stop_sequence: null },
    usage: { output_tokens: 50 },
  }))
  res.write(sseEvent('message_stop', { type: 'message_stop' }))
  res.end()
}

function buildJsonResponse(res: http.ServerResponse, mockResp: MockResponse, model: string) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    id: 'msg_mock_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content: mockResp.content,
    model,
    stop_reason: mockResp.stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 25, output_tokens: 50 },
  }))
}

// ── HTTP Server ──

const DEFAULT_RESPONSE: MockResponse = {
  content: [{ type: 'text', text: 'Mock response.' }],
  stop_reason: 'end_turn',
}

const server = http.createServer(async (req, res) => {
  // Health check for Playwright webServer readiness
  if (req.method === 'GET' && (req.url === '/' || req.url === '/__health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', queued: responseQueue.length }))
    return
  }

  let body = ''
  for await (const chunk of req) body += chunk

  // Configure mock responses
  if (req.url === '/__configure' && req.method === 'POST') {
    const { responses } = JSON.parse(body) as { responses: MockResponse[] }
    responseQueue.push(...responses)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, queued: responseQueue.length }))
    return
  }

  // Reset state
  if (req.url === '/__reset' && req.method === 'POST') {
    responseQueue = []
    for (const key of Object.keys(toolResults)) delete toolResults[key]
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // Anthropic Messages API
  if (req.url === '/v1/messages' && req.method === 'POST') {
    const reqBody = JSON.parse(body)
    const isStream = reqBody.stream === true
    const model = reqBody.model || 'claude-opus-4-6'

    // Extract tool results from incoming messages for $ref substitution
    if (Array.isArray(reqBody.messages)) {
      extractToolResults(reqBody.messages)
    }

    // Pop next response from queue, apply $ref substitution
    const template = responseQueue.shift() || DEFAULT_RESPONSE
    const mockResp = substituteRefs(template) as MockResponse

    if (isStream) {
      buildStreamingResponse(res, mockResp, model)
    } else {
      buildJsonResponse(res, mockResp, model)
    }
    return
  }

  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, () => {
  console.log(`Mock Anthropic server listening on http://localhost:${PORT}`)
})
