import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

class ApiKeyError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function decryptUserApiKey(userId: string): Promise<string> {
  const supabase = getSupabase()
  const { data: secret } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'anthropic')
    .maybeSingle()

  if (!secret) {
    throw new ApiKeyError('No API key configured. Add one in Settings.', 400)
  }

  try {
    return decrypt(secret.encrypted_key)
  } catch {
    throw new ApiKeyError('Failed to decrypt API key', 500)
  }
}

// ── POST /classify — LLM-based intent classification ──

const CLASSIFY_SYSTEM = `Classify the user's message into exactly one category. Reply with ONLY the category name, nothing else.

canvas_edit — The user wants to create, modify, or arrange visual elements on a drawing canvas. Examples: "draw a flowchart", "wireframe a dashboard", "connect the two shapes", "make a mind map of React concepts".

research — The user wants to find information, look something up, or learn about a topic. Includes bare URLs. Examples: "what is a CRDT?", "search for React hooks best practices", "https://example.com summarize this".

chat — General conversation that is neither canvas editing nor research. Examples: "hello", "what can you do?", "thanks".`

const VALID_INTENTS = ['canvas_edit', 'research', 'chat'] as const

router.post('/classify', async (req, res) => {
  const userId = req.userId!
  const { message } = req.body

  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message string is required' })
    return
  }

  let apiKey: string
  try {
    apiKey = await decryptUserApiKey(userId)
  } catch (err) {
    if (err instanceof ApiKeyError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    throw err
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: message }],
    })

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .toLowerCase()

    const intent = VALID_INTENTS.includes(text as typeof VALID_INTENTS[number])
      ? text as typeof VALID_INTENTS[number]
      : 'chat'

    res.json({ intent })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Classification failed'
    res.status(500).json({ error: message })
  }
})

// ── POST /message — streaming AI proxy ──

router.post('/message', async (req, res) => {
  const userId = req.userId!
  const { messages, system, tools, model = 'claude-opus-4-6' } = req.body

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  let apiKey: string
  try {
    apiKey = await decryptUserApiKey(userId)
  } catch (err) {
    if (err instanceof ApiKeyError) {
      res.status(err.status).json({ error: err.message })
      return
    }
    throw err
  }

  // Stream response via SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  try {
    const client = new Anthropic({ apiKey })
    const stream = client.messages.stream({
      model,
      max_tokens: 16384,
      messages,
      ...(system ? { system } : {}),
      ...(tools && tools.length > 0 ? { tools } : {}),
    })

    for await (const event of stream) {
      // Text content deltas
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ type: 'text_delta', text: event.delta.text })}\n\n`)
      }

      // Server tool use (e.g. web_search)
      if (event.type === 'content_block_start' && event.content_block.type === 'server_tool_use') {
        res.write(`data: ${JSON.stringify({
          type: 'server_tool_use_start',
          name: event.content_block.name,
          input: (event.content_block as unknown as Record<string, unknown>).input || {},
        })}\n\n`)
      }

      // Tool use block starts
      if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
        res.write(`data: ${JSON.stringify({
          type: 'tool_use_start',
          id: event.content_block.id,
          name: event.content_block.name,
        })}\n\n`)
      }

      // Tool use input JSON deltas
      if (event.type === 'content_block_delta' && event.delta.type === 'input_json_delta') {
        res.write(`data: ${JSON.stringify({
          type: 'input_json_delta',
          partial_json: event.delta.partial_json,
        })}\n\n`)
      }

      // Content block finished
      if (event.type === 'content_block_stop') {
        res.write(`data: ${JSON.stringify({ type: 'content_block_stop' })}\n\n`)
      }

      // Message delta (contains stop_reason)
      if (event.type === 'message_delta') {
        res.write(`data: ${JSON.stringify({
          type: 'message_delta',
          stop_reason: event.delta.stop_reason,
        })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI request failed'
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: message })
    }
  }
})

export default router
