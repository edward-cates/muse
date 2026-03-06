import { createClient } from '@supabase/supabase-js'
import { claimNextJob, completeJob, failJob, reapStalledJobs, updateJobProgress } from './jobs.js'
import { runAgentLoop, type AgentConfig } from './agent-runner.js'
import { type ToolContext } from './agent-tools.js'
import { readElementsFromDoc, updateElementInDoc } from './yjs-utils.js'
import { decrypt } from './crypto.js'
import Anthropic from '@anthropic-ai/sdk'

// ── Agent configs (server-side versions) ──

import { RESEARCH_TOOLS, DOCUMENT_TOOLS, CANVAS_TOOLS } from './tools.js'

function buildResearcherConfig(): AgentConfig {
  return {
    name: 'researcher',
    systemPrompt: `You are a research assistant for Muse, a collaborative canvas. Your job is to find relevant information, create a concept map linking themes to sources, and organize everything into a dedicated research sub-canvas.

Start web_search calls immediately — don't preview what you'll search for.

## Workflow
1. FIRST: Call add_node to create a research canvas on the parent board (title it based on the query). Save the documentId — you'll need it as target_document_id.
2. Use web_search to find relevant sources (3-5 for a typical query)
3. For EACH promising source:
   a. Call fetch_url to get the full page text
   b. Call decompose_text with the fetched text, a descriptive title, and target_document_id set to the research canvas documentId
   This creates a source card (with colored topic pills) on the research canvas.
4. After ALL sources are decomposed, create a concept map on the research canvas:
   a. Identify 3-6 cross-cutting themes that span multiple sources
   b. Create a shape (rectangle) for each theme on the research canvas using add_shape with target_document_id
   c. Draw arrows from each theme shape to the source cards that contain that theme using add_arrow with target_document_id
   d. Layout: place theme shapes on the LEFT (x=50-250), source cards on the RIGHT (x=400+), arrows connecting them

## Concept map layout
- Theme shapes: x=100, stacked vertically with 100px gaps, starting at y=80. Use width=180, height=60.
- Use distinct fill colors for each theme shape from this palette: #fef3c7, #dbeafe, #dcfce7, #f3e8ff, #fee2e2, #f1f5f9
- Source cards are placed by decompose_text. They'll be at x=100 by default — move them to x=450 using update_element after creation.
- Use add_arrow with start_shape_id (theme shape) and end_shape_id (source card) to connect them.

## Decomposing sources
- Always pass target_document_id so source cards appear on the research canvas
- Give each decompose_text call a clear title (the article title)
- If fetch_url returns very little text (< 100 chars), skip decomposition and use add_web_card instead

## Finalizing
After creating the concept map, update the top-level research card (the cardElementId from add_node) with:
- title: a clear descriptive title
- description: 1-2 sentence summary of key findings

## Source evaluation
- Prefer primary sources and authoritative references
- Include diverse perspectives when relevant
- Note when sources disagree

Always respond conversationally after researching — summarize what you found and the key themes.`,
    tools: [...RESEARCH_TOOLS, ...DOCUMENT_TOOLS, ...CANVAS_TOOLS.filter(t =>
      ['add_shape', 'add_arrow', 'update_element', 'arrange_grid'].includes(t.name),
    )],
    nativeTools: [
      { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
    ],
    maxTurns: 12,
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

/** Find the document card with this jobId on the parent canvas and update its status. */
async function updateDocumentCardStatus(parentDocId: string, jobId: string, newStatus: string) {
  const elements = await readElementsFromDoc(parentDocId)
  for (const el of elements) {
    if (el.type === 'document_card' && el.jobId === jobId) {
      await updateElementInDoc(parentDocId, el.id as string, { jobStatus: newStatus })
    }
  }
}

// ── Worker loop ──

let running = false
let pollTimer: ReturnType<typeof setTimeout> | null = null
let reaperTimer: ReturnType<typeof setInterval> | null = null

const POLL_INTERVAL_MS = 2000
const REAPER_INTERVAL_MS = 30_000

async function processNextJob(): Promise<boolean> {
  const job = await claimNextJob(['research'])
  if (!job) return false

  console.log(`[worker] Claimed job ${job.id} (${job.type})`)

  const documentId = job.document_id || ''

  try {
    const apiKey = await decryptUserApiKey(job.user_id)
    const userMessage = (job.input as { message?: string }).message || ''

    if (!documentId) throw new Error('Job has no document_id')
    if (!userMessage) throw new Error('Job has no message')

    let config: AgentConfig
    switch (job.type) {
      case 'research':
        config = buildResearcherConfig()
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
    }

    const result = await runAgentLoop(job.id, config, apiKey, toolCtx, userMessage)

    await completeJob(job.id, {
      textContent: result.textContent,
      turns: result.turns,
    })

    // Update document card jobStatus to 'completed'
    await updateDocumentCardStatus(documentId, job.id, 'completed')

    console.log(`[worker] Completed job ${job.id} in ${result.turns} turns`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[worker] Failed job ${job.id}:`, errMsg)
    await failJob(job.id, errMsg)
    // Update document card jobStatus to 'failed'
    await updateDocumentCardStatus(documentId, job.id, 'failed').catch(() => {})
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
