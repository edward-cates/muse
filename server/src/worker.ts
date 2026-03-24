import { createClient } from '@supabase/supabase-js'
import { claimNextJob, completeJob, failJob, reapStalledJobs, updateJobProgress } from './jobs.js'
import { layoutCanvas } from './layout.js'
import { runAgentLoop, type AgentConfig, type StreamCallback } from './agent-runner.js'
import { type ToolContext } from './agent-tools.js'
import { updateLiveElement } from './live-docs.js'
import { updateElementInDoc } from './yjs-utils.js'
import { decrypt } from './crypto.js'
import Anthropic from '@anthropic-ai/sdk'

// ── Agent configs (server-side versions) ──

import { RESEARCH_TOOLS, CANVAS_TOOLS, DOCUMENT_TOOLS, IMAGE_TOOLS, type ToolDefinition } from './tools.js'

export function buildResearcherConfig(): AgentConfig {
  return {
    name: 'researcher',
    systemPrompt: `You are a research assistant for Muse, a collaborative canvas. The research canvas has already been created for you — all your tools write directly to it. Your output is a knowledge graph: theme nodes with brief summaries, source cards, and arrows showing which sources inform which themes.

Start web_search calls immediately — don't preview what you'll search for.

## Workflow
1. Use web_search to find relevant sources (3-5 for a typical query)
2. Use fetch_url to get the full page text for each promising result
3. For EACH source, call add_web_card to place a source card on the canvas
4. After adding all source cards, synthesize 3-6 cross-cutting themes
5. Create a theme node (rectangle) for each theme using add_shape — include a 1-2 sentence summary of the key insight, not just a title label
6. Draw arrows from each theme node to its related source cards using add_arrow

## Knowledge graph layout
Build a hub-and-spoke graph. Place theme nodes in the CENTER column (x=350, stacked vertically). Place source cards in an ARC around the themes on the RIGHT (x=700+, spread out vertically). Arrows go left-to-right from themes to sources.

- Theme nodes: width=260, height=100. Use distinct fill colors: #fef3c7, #dbeafe, #dcfce7, #f3e8ff, #fee2e2, #f1f5f9
- Source cards: width=280, height=160. Spread vertically with 40px gaps starting at y=60.
- Theme nodes: spread vertically with 40px gaps starting at y=60.
- The text in each theme node should be: "Theme Title\\n\\nBrief 1-2 sentence summary of the key finding or insight."

## CRITICAL: Draw arrows
After creating theme nodes, you MUST draw arrows connecting each theme to its related source cards using add_arrow. This is the most important visual element — it creates the knowledge graph. Use start_shape_id (theme node ID) and end_shape_id (web card ID). Each theme should connect to at least one source, and each source should have at least one arrow. Call multiple add_arrow in a SINGLE tool call batch.

## Source evaluation
- Prefer primary sources and authoritative references
- Include diverse perspectives when relevant
- Note when sources disagree

Always respond conversationally after researching — summarize what you found and the key themes.`,
    tools: [
      ...RESEARCH_TOOLS.filter(t => t.name !== 'decompose_text'),
      ...CANVAS_TOOLS.filter(t =>
        ['add_shape', 'add_arrow', 'update_element'].includes(t.name),
      ),
    ],
    nativeTools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ],
    model: 'claude-sonnet-4-6',
    synthesisModel: 'claude-opus-4-6',
    maxTurns: 15,
  }
}

/** Deduplicate tools by name */
function dedupeTools(tools: ToolDefinition[]): ToolDefinition[] {
  const seen = new Set<string>()
  return tools.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })
}

export function buildComposerConfig(): AgentConfig {
  return {
    name: 'composer',
    systemPrompt: `You are a versatile AI assistant for Muse, a collaborative canvas app. You can create HTML documents, README files, research the web, add shapes, and generate images — all in one conversation.

## HTML artifacts
When asked to create a wireframe, prototype, README, or any HTML document:
- Use create_document with a title and self-contained HTML (inline styles/scripts)
- For iterative edits, use update_document_content with the document_id
- Make the HTML visually polished and production-quality

## Research capabilities
- Use web_search to find relevant sources
- Use fetch_url to read specific pages
- Use add_web_card to place source cards on the canvas

## Canvas editing
- Use add_shape to create rectangles, ellipses, diamonds with text labels
- Use add_arrow to connect shapes
- Use update_element to modify existing elements
- Use arrange_grid to lay out elements neatly

## Workflow
1. Plan what you need to create
2. Execute — create documents, shapes, or research as needed
3. Arrange the canvas neatly
4. Summarize what you built`,
    tools: dedupeTools([...CANVAS_TOOLS, ...DOCUMENT_TOOLS, ...RESEARCH_TOOLS, ...IMAGE_TOOLS]),
    nativeTools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ],
    maxTurns: 10,
  }
}

// ── Helpers ──

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function decryptUserApiKey(userId: string): Promise<string> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'anthropic')
    .maybeSingle()

  if (!data) throw new Error('No API key configured')
  return decrypt(data.encrypted_key)
}

async function generateImage(userId: string, prompt: string, size = '1024x1024'): Promise<{ url: string; revised_prompt?: string }> {
  const supabase = getSupabase()
  const { data: secret } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .maybeSingle()

  if (!secret) throw new Error('No OpenAI API key configured')
  const apiKey = decrypt(secret.encrypted_key)

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
  const response = await fetch(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality: 'standard', response_format: 'b64_json' }),
  })
  if (!response.ok) throw new Error(`OpenAI API error (${response.status})`)
  const data = (await response.json()) as { data: Array<{ b64_json: string; revised_prompt?: string }> }
  const image = data.data[0]
  return { url: `data:image/png;base64,${image.b64_json}`, revised_prompt: image.revised_prompt }
}

const MAX_TEXT_LENGTH = 5000
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1_024_000

async function fetchUrl(url: string): Promise<{ title: string; text: string; url: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs allowed')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Muse/1.0 (Research Assistant)',
      Accept: 'text/html, text/plain, application/json',
    },
  })
  clearTimeout(timeout)

  if (!response.ok) throw new Error(`Upstream returned ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  const buffer = await response.arrayBuffer()
  const body = new TextDecoder().decode(buffer.slice(0, MAX_BODY_BYTES))

  let title = ''
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) title = titleMatch[1].trim()

  let text = body
  if (contentType.includes('html')) {
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
    text = text.replace(/<[^>]+>/g, ' ')
    text = text.replace(/\s+/g, ' ').trim()
  }
  text = text.slice(0, MAX_TEXT_LENGTH)

  return { title, text, url }
}

async function decomposeText(
  apiKey: string,
  userId: string,
  text: string,
  title?: string,
): Promise<{
  documentId: string
  topics: Array<{ title: string; summary: string; color: string; lineRanges: Array<{ start: number; end: number }> }>
}> {
  const supabase = getSupabase()

  // Create the research document
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

  if (docError) throw new Error(`Failed to create document: ${docError.message}`)

  const numberedText = text.split('\n').map((line: string, i: number) => `${i + 1}: ${line}`).join('\n')

  const DECOMPOSE_SYSTEM = `You decompose documents into 3-7 major topics. Use the report_topics tool to return your analysis.

Rules:
- Each topic should cover a SUBSTANTIAL section of the document (5-20 total lines across all ranges for that topic)
- Do NOT create topics for individual lines — merge related lines into broader themes
- Line numbers are 1-indexed. Be accurate with line ranges.
- If the document is short (< 30 lines), produce 2-4 topics. If long (> 100 lines), up to 7.`

  const DECOMPOSE_TOOL = {
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
              title: { type: 'string' },
              summary: { type: 'string' },
              color: { type: 'string', enum: ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#64748b', '#06b6d4', '#ec4899'] },
              lineRanges: { type: 'array', items: { type: 'object', properties: { start: { type: 'number' }, end: { type: 'number' } }, required: ['start', 'end'] } },
            },
            required: ['title', 'summary', 'color', 'lineRanges'],
          },
        },
      },
      required: ['topics'],
    },
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: DECOMPOSE_SYSTEM,
    tools: [DECOMPOSE_TOOL],
    tool_choice: { type: 'tool' as const, name: 'report_topics' },
    messages: [{ role: 'user', content: numberedText }],
  })

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  )
  if (!toolBlock) throw new Error('Model did not return a tool call')

  const topics = (toolBlock.input as { topics: typeof doc }).topics as Array<{
    title: string; summary: string; color: string; lineRanges: Array<{ start: number; end: number }>
  }>

  await supabase.from('documents').update({ metadata: topics }).eq('id', doc.id)

  return { documentId: doc.id, topics }
}


// ── Worker loop ──

let running = false
let pollTimer: ReturnType<typeof setTimeout> | null = null
let reaperTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 2000
const REAPER_INTERVAL_MS = 30_000

async function processNextJob(): Promise<boolean> {
  const job = await claimNextJob(['research', 'compose'])
  if (!job) return false

  console.log(`[worker] Claimed job ${job.id} (${job.type})`)

  const documentId = job.document_id || ''
  const jobInput = job.input as { message?: string; parentDocumentId?: string; parentCardId?: string }
  const parentDocId = jobInput.parentDocumentId || ''
  const parentCardId = jobInput.parentCardId || ''

  try {
    const apiKey = await decryptUserApiKey(job.user_id)
    const userMessage = jobInput.message || ''

    if (!documentId) throw new Error('Job has no document_id')
    if (!userMessage) throw new Error('Job has no message')

    let config: AgentConfig
    switch (job.type) {
      case 'research':
        config = buildResearcherConfig()
        break
      case 'compose':
        config = buildComposerConfig()
        break
      default:
        throw new Error(`Unsupported job type: ${job.type}`)
    }

    const toolCtx: ToolContext = {
      userId: job.user_id,
      documentId,
      jobId: job.id,
      fetchUrl,
      decomposeText: (text, title) => decomposeText(apiKey, job.user_id, text, title),
      generateImage: (prompt, size) => generateImage(job.user_id, prompt, size),
    }

    // Build stream callback: push text/tool status to the parent card's description via live Yjs
    let streamCallback: StreamCallback | undefined
    if (parentDocId && parentCardId) {
      const updateCard = (desc: string) => {
        updateLiveElement(parentDocId, parentCardId, { description: desc })
      }
      streamCallback = {
        onText: (text) => {
          // Show a truncated preview of the streaming text
          const preview = text.length > 200 ? '...' + text.slice(-197) : text
          updateCard(preview)
        },
        onToolStart: (toolName) => {
          const label = toolName === 'web_search' ? 'Searching the web...'
            : toolName === 'fetch_url' ? 'Reading article...'
            : toolName === 'add_web_card' ? 'Adding source card...'
            : toolName === 'add_shape' ? 'Creating shape...'
            : toolName === 'add_arrow' ? 'Connecting elements...'
            : toolName === 'create_document' ? 'Creating document...'
            : toolName === 'update_document_content' ? 'Writing content...'
            : toolName === 'generate_image' ? 'Generating image...'
            : toolName === 'decompose_text' ? 'Analyzing text...'
            : toolName === 'arrange_grid' ? 'Arranging layout...'
            : `Running ${toolName}...`
          updateCard(label)
        },
        onTurnStart: (turn, maxTurns) => {
          if (turn === 1) {
            const label = job.type === 'compose' ? 'Composing...' : 'Starting research...'
            updateCard(label)
          }
        },
      }
    }

    const result = await runAgentLoop(job.id, config, apiKey, toolCtx, userMessage, streamCallback)

    // Apply force-directed layout to space out nodes (research canvases only)
    if (job.type === 'research') {
      try {
        await layoutCanvas(documentId, parentDocId, parentCardId)
        console.log(`[worker] Applied layout to document ${documentId}`)
      } catch (layoutErr) {
        console.error(`[worker] Layout failed (non-fatal):`, layoutErr)
      }
    }

    await completeJob(job.id, {
      textContent: result.textContent,
      turns: result.turns,
    })

    // Clear the description and mark completed on the parent card
    if (parentDocId && parentCardId) {
      const liveUpdated = updateLiveElement(parentDocId, parentCardId, { jobStatus: 'completed', description: '' })
      if (!liveUpdated) {
        await updateElementInDoc(parentDocId, parentCardId, { jobStatus: 'completed', description: '' })
      }
    }

    console.log(`[worker] Completed job ${job.id} in ${result.turns} turns`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[worker] Failed job ${job.id}:`, errMsg)
    await failJob(job.id, errMsg)
    // Update document card jobStatus on the parent canvas
    if (parentDocId && parentCardId) {
      const liveUpdated = updateLiveElement(parentDocId, parentCardId, { jobStatus: 'failed', description: errMsg })
      if (!liveUpdated) {
        await updateElementInDoc(parentDocId, parentCardId, { jobStatus: 'failed', description: errMsg })
      }
    }
  }

  return true
}

async function poll() {
  if (!running) return
  try {
    const processed = await processNextJob()
    // If we processed a job, immediately check for more
    if (processed && running) {
      setImmediate(poll)
      return
    }
  } catch (err) {
    console.error('[worker] Poll error:', err)
  }
  // Otherwise, wait before polling again
  if (running) {
    pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
  }
}

export function startWorker() {
  if (running) return
  running = true
  console.log('[worker] Starting agent job worker')

  // Start polling for jobs
  poll()

  // Start stall reaper
  reaperTimer = setInterval(async () => {
    try {
      const reaped = await reapStalledJobs()
      if (reaped > 0) console.log(`[worker] Reaped ${reaped} stalled jobs`)
    } catch (err) {
      console.error('[worker] Reaper error:', err)
    }
  }, REAPER_INTERVAL_MS)
}

export function stopWorker() {
  running = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  if (reaperTimer) {
    clearInterval(reaperTimer)
    reaperTimer = null
  }
  console.log('[worker] Stopped')
}
