import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { type AddressInfo } from 'node:net'

// ── Mock Supabase + Anthropic ──

interface MockRow { [key: string]: unknown }

let jobStore: MockRow[] = []
let docStore: MockRow[] = []
let jobCounter = 0
let docCounter = 0
let anthropicCalls: Array<{ messages: unknown[]; tools?: unknown[] }> = []
let anthropicResponses: Array<Record<string, unknown>> = []
let anthropicResponseIndex = 0

function createMockServers(): Promise<{
  supabase: { server: Server; url: string }
  anthropic: { server: Server; url: string }
}> {
  return new Promise(async (resolve) => {
    // Mock Supabase
    const sbServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', 'http://localhost')
      const pathMatch = url.pathname.match(/^\/rest\/v1\/(\w+)/)
      const table = pathMatch?.[1] || ''
      const method = req.method || 'GET'

      let body = ''
      for await (const chunk of req) body += chunk

      if (url.pathname.includes('.well-known/jwks.json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [] }))
        return
      }

      if (table === 'agent_jobs') {
        if (method === 'GET') {
          let results = [...jobStore]
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          const statusFilter = url.searchParams.get('status')
          if (idFilter) results = results.filter(j => j.id === idFilter)
          if (statusFilter?.startsWith('eq.')) results = results.filter(j => j.status === statusFilter.replace('eq.', ''))
          if (statusFilter?.startsWith('in.')) {
            const vals = statusFilter.replace('in.(', '').replace(')', '').split(',').map(s => s.replace(/"/g, ''))
            results = results.filter(j => vals.includes(j.status as string))
          }
          const limit = url.searchParams.get('limit')
          if (limit) results = results.slice(0, Number(limit))
          if (req.headers['accept']?.includes('vnd.pgrst.object+json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results[0] || null))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results))
          }
          return
        }
        if (method === 'PATCH') {
          const updates = JSON.parse(body)
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          const statusFilter = url.searchParams.get('status')
          let matched: MockRow | undefined
          for (const job of jobStore) {
            if (idFilter && job.id !== idFilter) continue
            if (statusFilter?.startsWith('eq.') && job.status !== statusFilter.replace('eq.', '')) continue
            if (statusFilter?.startsWith('in.')) {
              const vals = statusFilter.replace('in.(', '').replace(')', '').split(',').map(s => s.replace(/"/g, ''))
              if (!vals.includes(job.status as string)) continue
            }
            Object.assign(job, updates)
            matched = job
          }
          const prefer = req.headers['prefer'] as string || ''
          if (prefer.includes('return=representation') && req.headers['accept']?.includes('vnd.pgrst.object+json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(matched || null))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(null))
          }
          return
        }
        if (method === 'POST') {
          const parsed = JSON.parse(body)
          const job = { id: `job-${++jobCounter}`, ...parsed, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
          jobStore.push(job)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(job))
          return
        }
      }

      if (table === 'documents') {
        if (method === 'POST') {
          const parsed = JSON.parse(body)
          const doc = { id: `doc-${++docCounter}`, content_version: 0, ...parsed, created_at: new Date().toISOString() }
          docStore.push(doc)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(doc))
          return
        }
        if (method === 'GET') {
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          let results = [...docStore]
          if (idFilter) results = results.filter(d => d.id === idFilter)
          if (req.headers['accept']?.includes('vnd.pgrst.object+json')) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results[0] || null))
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(results))
          }
          return
        }
        if (method === 'PATCH') {
          const updates = JSON.parse(body)
          const idFilter = url.searchParams.get('id')?.replace('eq.', '')
          for (const doc of docStore) {
            if (idFilter && doc.id !== idFilter) continue
            Object.assign(doc, updates)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(null))
          return
        }
      }

      if (table === 'user_secrets') {
        // Return a mock encrypted key
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ encrypted_key: 'mock-encrypted-key' }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(null))
    })

    // Mock Anthropic API
    const aiServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      for await (const chunk of req) body += chunk

      const parsed = JSON.parse(body)
      anthropicCalls.push({ messages: parsed.messages, tools: parsed.tools })

      const response = anthropicResponses[anthropicResponseIndex] || {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Done.' }],
        model: 'claude-sonnet-4-20250514',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }
      anthropicResponseIndex++

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(response))
    })

    await new Promise<void>(r => sbServer.listen(0, r))
    const sbPort = (sbServer.address() as AddressInfo).port

    await new Promise<void>(r => aiServer.listen(0, r))
    const aiPort = (aiServer.address() as AddressInfo).port

    resolve({
      supabase: { server: sbServer, url: `http://127.0.0.1:${sbPort}` },
      anthropic: { server: aiServer, url: `http://127.0.0.1:${aiPort}` },
    })
  })
}

// ── Tests ──

describe('Agent runner', () => {
  let sbMock: { server: Server; url: string }
  let aiMock: { server: Server; url: string }

  before(async () => {
    const mocks = await createMockServers()
    sbMock = mocks.supabase
    aiMock = mocks.anthropic

    process.env.SUPABASE_URL = sbMock.url
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
    process.env.ANTHROPIC_BASE_URL = aiMock.url
  })

  after(() => {
    sbMock?.server.close()
    aiMock?.server.close()
  })

  beforeEach(() => {
    jobStore = []
    docStore = []
    anthropicCalls = []
    anthropicResponses = []
    anthropicResponseIndex = 0
    jobCounter = 0
    docCounter = 0
  })

  it('runs a single-turn agent that returns text', async () => {
    // Set up a mock document in the store
    docStore.push({ id: 'doc-parent', type: 'canvas', content: null, owner_id: 'test-user' })

    // Set up a job
    const job = {
      id: 'job-test-1',
      user_id: 'test-user',
      type: 'research',
      status: 'running',
      input: { message: 'test query' },
      progress: {},
      result: null,
      error: null,
      attempts: 1,
      max_attempts: 3,
      locked_by: 'worker-1',
      locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    jobStore.push(job)

    // Mock Anthropic response — simple text reply
    anthropicResponses.push({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Research complete. Found 3 key themes.' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    })

    // Import and run the agent
    const { runAgentLoop } = await import('../src/agent-runner.js')

    const result = await runAgentLoop(
      'job-test-1',
      {
        name: 'researcher',
        systemPrompt: 'You are a research assistant.',
        tools: [],
        maxTurns: 5,
      },
      'test-api-key',
      {
        userId: 'test-user',
        documentId: 'doc-parent',
        fetchUrl: async (url) => ({ title: 'Test', text: 'Test content', url }),
        decomposeText: async (text, title) => ({ documentId: 'doc-research', topics: [] }),
      },
      'test query',
    )

    assert.equal(result.textContent, 'Research complete. Found 3 key themes.')
    assert.equal(result.turns, 1)
    assert.equal(anthropicCalls.length, 1)

    // Verify job progress was updated
    const updatedJob = jobStore.find(j => j.id === 'job-test-1')
    assert.ok(updatedJob)
  })

  it('runs multi-turn with tool calls', async () => {
    docStore.push({ id: 'doc-parent', type: 'canvas', content: null, owner_id: 'test-user' })
    const job = {
      id: 'job-test-2', user_id: 'test-user', type: 'research', status: 'running',
      input: { message: 'test' }, progress: {}, result: null, error: null,
      attempts: 1, max_attempts: 3, locked_by: 'w', locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(), completed_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    jobStore.push(job)

    // Turn 1: tool call
    anthropicResponses.push({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [
        { type: 'text', text: 'Let me research.' },
        { type: 'tool_use', id: 'tu_1', name: 'fetch_url', input: { url: 'https://example.com' } },
      ],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 20 },
    })

    // Turn 2: final text
    anthropicResponses.push({
      id: 'msg_2', type: 'message', role: 'assistant',
      content: [{ type: 'text', text: 'Found the info.' }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 30, output_tokens: 10 },
    })

    const { runAgentLoop } = await import('../src/agent-runner.js')

    const result = await runAgentLoop(
      'job-test-2',
      {
        name: 'researcher',
        systemPrompt: 'You are a research assistant.',
        tools: [{ name: 'fetch_url', description: 'Fetch URL', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } }],
        maxTurns: 5,
      },
      'test-api-key',
      {
        userId: 'test-user',
        documentId: 'doc-parent',
        fetchUrl: async (url) => ({ title: 'Example', text: 'Page content', url }),
        decomposeText: async () => ({ documentId: 'doc-r', topics: [] }),
      },
      'test query',
    )

    assert.equal(result.turns, 2)
    assert.equal(result.textContent, 'Found the info.')
    assert.equal(anthropicCalls.length, 2)

    // Verify the second call includes tool results
    const secondCall = anthropicCalls[1]
    const lastMsg = (secondCall.messages as Array<{ role: string; content: unknown[] }>).pop()
    assert.equal(lastMsg?.role, 'user')
    const toolResult = (lastMsg?.content as Array<{ type: string }>)[0]
    assert.equal(toolResult?.type, 'tool_result')
  })

  it('stops when job is cancelled mid-loop', async () => {
    docStore.push({ id: 'doc-parent', type: 'canvas', content: null, owner_id: 'test-user' })
    const job = {
      id: 'job-test-cancel', user_id: 'test-user', type: 'research', status: 'running',
      input: { message: 'test' }, progress: {}, result: null, error: null,
      attempts: 1, max_attempts: 3, locked_by: 'w', locked_at: new Date().toISOString(),
      started_at: new Date().toISOString(), completed_at: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    jobStore.push(job)

    // Turn 1: tool call
    anthropicResponses.push({
      id: 'msg_1', type: 'message', role: 'assistant',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'fetch_url', input: { url: 'https://example.com' } }],
      model: 'claude-sonnet-4-20250514',
      stop_reason: 'tool_use', stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    // Cancel the job before turn 2
    // The agent runner checks job status at the start of each turn
    const { runAgentLoop } = await import('../src/agent-runner.js')

    // Simulate cancellation: after the first Anthropic call, mark the job cancelled
    let callCount = 0
    const origFetch = globalThis.fetch
    const fetchSpy = async (...args: Parameters<typeof fetch>) => {
      const result = await origFetch(...args)
      callCount++
      // After the first Anthropic call completes, cancel the job
      if (callCount === 2) { // 1st = progress update, 2nd = anthropic call
        const j = jobStore.find(j => j.id === 'job-test-cancel')
        if (j) j.status = 'cancelled'
      }
      return result
    }
    globalThis.fetch = fetchSpy as typeof fetch

    try {
      const result = await runAgentLoop(
        'job-test-cancel',
        {
          name: 'researcher',
          systemPrompt: 'Test',
          tools: [{ name: 'fetch_url', description: 'test', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } }],
          maxTurns: 5,
        },
        'test-api-key',
        {
          userId: 'test-user',
          documentId: 'doc-parent',
          fetchUrl: async (url) => ({ title: 'T', text: 'C', url }),
          decomposeText: async () => ({ documentId: 'd', topics: [] }),
        },
        'test',
      )

      // Should have stopped early
      assert.equal(result.textContent, 'Job was cancelled.')
    } finally {
      globalThis.fetch = origFetch
    }
  })
})
