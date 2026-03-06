import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const DECOMPOSE_SYSTEM = `You decompose documents into major topics. For each topic provide:
- title: 2-5 word topic name
- summary: 2-3 sentence summary
- color: a hex color from this palette: #f59e0b, #3b82f6, #22c55e, #a855f7, #ef4444, #64748b, #06b6d4, #ec4899
- lineRanges: array of {start, end} line number ranges that inform this summary

Return ONLY valid JSON array. Line numbers are 1-indexed. Be accurate with line ranges.`

router.post('/', async (req, res) => {
  const userId = req.userId!
  const { text, title } = req.body

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required' })
    return
  }

  // Get the user's Anthropic API key
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

  // Create the document in Supabase
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      owner_id: userId,
      title: title || 'Untitled Research',
      type: 'research',
      source_text: text,
    })
    .select()
    .single()

  if (docError) {
    console.error('Failed to create document:', docError)
    res.status(500).json({ error: 'Failed to create document' })
    return
  }

  // Prepend line numbers to the text
  const numberedText = text
    .split('\n')
    .map((line: string, i: number) => `${i + 1}: ${line}`)
    .join('\n')

  // Call Anthropic
  let responseText: string
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: DECOMPOSE_SYSTEM,
      messages: [{ role: 'user', content: numberedText }],
    })

    responseText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Anthropic API call failed'
    res.status(500).json({ error: message })
    return
  }

  // Parse the JSON response
  let topics: unknown[]
  try {
    topics = JSON.parse(responseText)
    if (!Array.isArray(topics)) {
      throw new Error('Response is not a JSON array')
    }
  } catch {
    res.status(500).json({ error: 'Failed to parse topics JSON', raw: responseText })
    return
  }

  // Store metadata in the document
  await supabase
    .from('documents')
    .update({ metadata: topics })
    .eq('id', doc.id)

  res.json({ documentId: doc.id, topics })
})

export default router
