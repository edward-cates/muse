import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntentLocal, classifyIntent } from '../router.ts'

describe('classifyIntentLocal', () => {
  it('classifies "draw a flowchart" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('draw a flowchart'), 'canvas_edit')
  })

  it('classifies "research React hooks" as research', () => {
    assert.equal(classifyIntentLocal('research React hooks'), 'research')
  })

  it('classifies "what can you do?" as chat', () => {
    assert.equal(classifyIntentLocal('what can you do?'), 'chat')
  })

  it('classifies "find articles about CRDTs and add them to the board" as research', () => {
    assert.equal(classifyIntentLocal('find articles about CRDTs and add them to the board'), 'research')
  })

  it('classifies "add a box labeled Auth" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('add a box labeled Auth'), 'canvas_edit')
  })

  it('classifies a bare URL as research', () => {
    assert.equal(classifyIntentLocal('https://en.wikipedia.org/wiki/CRDT'), 'research')
  })

  it('classifies URL + short instruction as research', () => {
    assert.equal(classifyIntentLocal('https://example.com summarize this'), 'research')
  })

  it('classifies "create a rectangle" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('create a rectangle'), 'canvas_edit')
  })

  it('classifies "search for the best CRDT libraries" as research', () => {
    assert.equal(classifyIntentLocal('search for the best CRDT libraries'), 'research')
  })

  it('classifies "hello" as chat', () => {
    assert.equal(classifyIntentLocal('hello'), 'chat')
  })

  it('classifies "delete the Auth box" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('delete the Auth box'), 'canvas_edit')
  })

  it('classifies "what is a CRDT?" as research', () => {
    assert.equal(classifyIntentLocal('what is a CRDT?'), 'research')
  })

  // Regression: these were misclassified as chat (no canvas keywords matched)
  it('classifies "wireframe a dashboard" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('wireframe a dashboard'), 'canvas_edit')
  })

  it('classifies "build a signup flow" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('build a signup flow'), 'canvas_edit')
  })

  it('classifies "sketch a system architecture" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('sketch a system architecture'), 'canvas_edit')
  })

  it('classifies "make a tree of components" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('make a tree of components'), 'canvas_edit')
  })

  it('classifies "design a kanban board" as canvas_edit', () => {
    assert.equal(classifyIntentLocal('design a kanban board'), 'canvas_edit')
  })
})

describe('classifyIntent (async, LLM-based)', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(intent: string, status = 200) {
    globalThis.fetch = async () => new Response(
      JSON.stringify({ intent }),
      { status, headers: { 'Content-Type': 'application/json' } },
    )
  }

  it('returns LLM intent on success', async () => {
    mockFetch('canvas_edit')
    const result = await classifyIntent('wireframe a dashboard', 'fake-token')
    assert.equal(result, 'canvas_edit')
  })

  it('returns research intent from LLM', async () => {
    mockFetch('research')
    const result = await classifyIntent('what is a CRDT?', 'fake-token')
    assert.equal(result, 'research')
  })

  it('falls back to keyword heuristic on fetch failure', async () => {
    globalThis.fetch = async () => { throw new Error('Network error') }
    const result = await classifyIntent('draw a flowchart', 'fake-token')
    assert.equal(result, 'canvas_edit')
  })

  it('falls back to keyword heuristic on non-200 response', async () => {
    mockFetch('canvas_edit', 500)
    const result = await classifyIntent('draw a flowchart', 'fake-token')
    // Falls back to local — 'draw' keyword → canvas_edit
    assert.equal(result, 'canvas_edit')
  })

  it('falls back to keyword heuristic on invalid intent in response', async () => {
    mockFetch('invalid_intent')
    // 'hello' has no keywords → local returns 'chat'
    const result = await classifyIntent('hello', 'fake-token')
    assert.equal(result, 'chat')
  })

  it('sends correct request to /api/ai/classify', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(
        JSON.stringify({ intent: 'chat' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await classifyIntent('hello', 'my-jwt-token')

    assert.equal(capturedUrl, '/api/ai/classify')
    assert.equal(capturedInit?.method, 'POST')
    const headers = capturedInit?.headers as Record<string, string>
    assert.equal(headers['Authorization'], 'Bearer my-jwt-token')
    const body = JSON.parse(capturedInit?.body as string)
    assert.equal(body.message, 'hello')
  })
})
