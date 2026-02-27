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
  const { messages, system, model = 'claude-sonnet-4-20250514' } = req.body

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
    const stream = await client.messages.stream({
      model,
      max_tokens: 4096,
      messages,
      ...(system ? { system } : {}),
    })

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
      }
    }

    res.write('data: [DONE]\n\n')
    res.end()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'AI request failed'
    // If headers already sent, send error as SSE event
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`)
      res.end()
    } else {
      res.status(500).json({ error: message })
    }
  }
})

export default router
