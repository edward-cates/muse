import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const DECOMPOSE_SYSTEM = `You decompose documents into major topics. Use the report_topics tool to return your analysis. Line numbers are 1-indexed. Be accurate with line ranges — the user will click these to see the original text.`

const DECOMPOSE_TOOL: Anthropic.Tool = {
  name: 'report_topics',
  description: 'Report the decomposed topics extracted from the document',
  input_schema: {
    type: 'object' as const,
    properties: {
      topics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '2-5 word topic name' },
            summary: { type: 'string', description: '2-3 sentence summary' },
            color: {
              type: 'string',
              enum: ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#64748b', '#06b6d4', '#ec4899'],
              description: 'Color for this topic',
            },
            lineRanges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'number', description: 'Start line number (1-indexed)' },
                  end: { type: 'number', description: 'End line number (1-indexed)' },
                },
                required: ['start', 'end'],
              },
              description: 'Line ranges from the source document that inform this topic',
            },
          },
          required: ['title', 'summary', 'color', 'lineRanges'],
        },
      },
    },
    required: ['topics'],
  },
}

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

  // Call Anthropic with tool use for structured output
  let topics: Array<{ title: string; summary: string; color: string; lineRanges: Array<{ start: number; end: number }> }>
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: DECOMPOSE_SYSTEM,
      tools: [DECOMPOSE_TOOL],
      tool_choice: { type: 'tool', name: 'report_topics' },
      messages: [{ role: 'user', content: numberedText }],
    })

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    )
    if (!toolBlock) {
      res.status(500).json({ error: 'Model did not return a tool call' })
      return
    }
    topics = (toolBlock.input as { topics: typeof topics }).topics
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Anthropic API call failed'
    res.status(500).json({ error: message })
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
