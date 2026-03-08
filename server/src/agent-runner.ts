import Anthropic from '@anthropic-ai/sdk'
import { executeServerToolCall, type ToolCall, type ToolContext } from './agent-tools.js'
import { updateJobProgress, getJob } from './jobs.js'
import { readElementsFromDoc, type YMapVal } from './yjs-utils.js'
import type { ToolDefinition } from './tools.js'

export interface AgentConfig {
  name: string
  systemPrompt: string
  tools: ToolDefinition[]
  nativeTools?: Array<Record<string, unknown>>
  maxTurns: number
  model?: string
  /** Upgrade to this model once synthesis tools (add_shape, add_arrow) are first called */
  synthesisModel?: string
}

/** Callback for streaming text and status updates to a UI element */
export interface StreamCallback {
  onText: (text: string) => void
  onToolStart: (toolName: string) => void
  onTurnStart: (turn: number, maxTurns: number) => void
}

interface ContentBlock {
  type: string
  [key: string]: unknown
}

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Compact ID→label map for system prompt (keeps token count low) */
function describeElements(elements: Array<Record<string, YMapVal>>): string {
  if (elements.length === 0) return '(empty canvas)'
  const entries: string[] = []
  for (const el of elements) {
    const type = el.type as string
    const short = (el.id as string).slice(0, 8)
    if (['rectangle', 'ellipse', 'diamond'].includes(type)) {
      const label = el.text ? `"${el.text}"` : type
      entries.push(`${short}=${label}`)
    } else if (type === 'line') {
      const from = el.startShapeId ? (el.startShapeId as string).slice(0, 8) : '?'
      const to = el.endShapeId ? (el.endShapeId as string).slice(0, 8) : '?'
      const arrow = el.arrowEnd ? '→' : '—'
      entries.push(`${short}=(${from}${arrow}${to})`)
    } else if (type === 'webcard') {
      entries.push(`${short}=WebCard:"${el.title}"`)
    } else if (type === 'document_card') {
      entries.push(`${short}=Doc:"${el.title}"`)
    } else {
      entries.push(`${short}=${type}`)
    }
  }
  return entries.join(', ')
}

export async function runAgentLoop(
  jobId: string,
  config: AgentConfig,
  apiKey: string,
  ctx: ToolContext,
  userMessage: string,
  stream?: StreamCallback,
): Promise<{ textContent: string; turns: number }> {
  const client = new Anthropic({ apiKey })
  const allTools: unknown[] = [...config.tools]
  if (config.nativeTools) allTools.push(...config.nativeTools)

  // Read current canvas state for the system prompt
  const canvasElements = await readElementsFromDoc(ctx.documentId)
  const canvasState = describeElements(canvasElements)
  const systemPrompt = config.systemPrompt + `\n\n## Current canvas state\n${canvasState}`

  let messages: ApiMessage[] = [{ role: 'user', content: userMessage }]
  let turns = 0
  let finalText = ''
  const SYNTHESIS_TOOLS = new Set(['add_shape', 'add_arrow'])
  let currentModel = config.model || 'claude-opus-4-6'

  while (turns < config.maxTurns) {
    turns++

    // Check if job was cancelled
    const job = await getJob(jobId)
    if (!job || job.status === 'cancelled') {
      return { textContent: 'Job was cancelled.', turns }
    }

    stream?.onTurnStart(turns, config.maxTurns)
    await updateJobProgress(jobId, {
      step: 'calling_model',
      turn: turns,
      maxTurns: config.maxTurns,
    })

    const requestParams = {
      model: currentModel,
      max_tokens: 16384,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
      ...(allTools.length > 0 ? { tools: allTools as Anthropic.Tool[] } : {}),
    }

    // Use streaming if a stream callback is provided, non-streaming otherwise
    let textBlocks: string[]
    let toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }>
    let stopReason: string

    if (stream) {
      // Streaming mode — push text deltas to the callback
      textBlocks = []
      toolUseBlocks = []
      let currentText = ''

      const response = client.messages.stream(requestParams)

      response.on('text', (delta) => {
        currentText += delta
        stream.onText(currentText)
      })

      const finalMessage = await response.finalMessage()
      stopReason = finalMessage.stop_reason || 'end_turn'

      for (const block of finalMessage.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text)
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
        }
      }
    } else {
      // Non-streaming mode (tests, simple runs)
      textBlocks = []
      toolUseBlocks = []

      const response = await client.messages.create(requestParams)
      stopReason = response.stop_reason || 'end_turn'

      for (const block of response.content) {
        if (block.type === 'text') {
          textBlocks.push(block.text)
        } else if (block.type === 'tool_use') {
          toolUseBlocks.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
        }
      }
    }

    finalText = textBlocks.join('')

    if (stopReason === 'tool_use' && toolUseBlocks.length > 0) {
      // Build assistant message
      const assistantBlocks: ContentBlock[] = []
      if (finalText) assistantBlocks.push({ type: 'text', text: finalText })
      for (const tc of toolUseBlocks) {
        assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
      }
      messages = [...messages, { role: 'assistant', content: assistantBlocks }]

      // Execute tool calls
      const toolResults: ContentBlock[] = []
      for (let i = 0; i < toolUseBlocks.length; i++) {
        const tc = toolUseBlocks[i]
        stream?.onToolStart(tc.name)
        await updateJobProgress(jobId, {
          step: 'executing_tool',
          turn: turns,
          tool: tc.name,
          toolIndex: i + 1,
          toolCount: toolUseBlocks.length,
        })

        const result = await executeServerToolCall(
          { id: tc.id, name: tc.name, input: tc.input },
          ctx,
        )
        toolResults.push({
          type: 'tool_result',
          tool_use_id: result.tool_use_id,
          content: result.content,
        })
      }

      messages = [...messages, { role: 'user', content: toolResults }]

      // Upgrade to synthesis model when the agent starts creating themes/arrows
      if (config.synthesisModel && toolUseBlocks.some(tc => SYNTHESIS_TOOLS.has(tc.name))) {
        currentModel = config.synthesisModel
      }
    } else {
      // Final response — no more tool calls
      if (finalText) {
        messages = [...messages, { role: 'assistant', content: finalText }]
      }
      break
    }
  }

  return { textContent: finalText, turns }
}
