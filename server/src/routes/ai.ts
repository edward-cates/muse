import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

router.post('/message', async (req, res) => {
  const userId = req.userId!
  const { messages, system, tools, model = 'claude-opus-4-6' } = req.body

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  // Fetch and decrypt the user's API key
  const supabase = getSupabase()
  const { data: secret } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'anthropic')
    .maybeSingle()

  if (!secret) {
    res.status(400).json({ error: 'No API key configured. Add one in Settings.' })
    return
  }

  let apiKey: string
  try {
    apiKey = decrypt(secret.encrypted_key)
  } catch {
    res.status(500).json({ error: 'Failed to decrypt API key' })
    return
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
