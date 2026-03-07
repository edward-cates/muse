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
}

interface ContentBlock {
  type: string
  [key: string]: unknown
}

interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Describe elements for the system prompt (same format as client-side) */
function describeElements(elements: Array<Record<string, YMapVal>>): string {
  if (elements.length === 0) return '(empty canvas)'
  return elements.map(el => {
    const type = el.type as string
    const id = (el.id as string).slice(0, 8)
    if (['rectangle', 'ellipse', 'diamond'].includes(type)) {
      const label = el.text ? ` "${el.text}"` : ''
      return `Shape<${id}> ${type} at (${el.x},${el.y}) ${el.width}x${el.height}${label}`
    }
    if (type === 'line') {
      const from = el.startShapeId ? `Shape<${(el.startShapeId as string).slice(0, 8)}>` : `(${el.startX},${el.startY})`
      const to = el.endShapeId ? `Shape<${(el.endShapeId as string).slice(0, 8)}>` : `(${el.endX},${el.endY})`
      const arrow = el.arrowEnd ? '->' : '--'
      return `Line<${id}> ${from} ${arrow} ${to}`
    }
    if (type === 'webcard') return `WebCard<${id}> "${el.title}" url=${el.url}`
    if (type === 'document_card') return `DocCard<${id}> "${el.title}" docId=${el.documentId}`
    return `${type}<${id}>`
  }).join('\n')
}

export async function runAgentLoop(
  jobId: string,
  config: AgentConfig,
  apiKey: string,
  ctx: ToolContext,
  userMessage: string,
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

  while (turns < config.maxTurns) {
    turns++

    // Check if job was cancelled
    const job = await getJob(jobId)
    if (!job || job.status === 'cancelled') {
      return { textContent: 'Job was cancelled.', turns }
    }

    await updateJobProgress(jobId, {
      step: 'calling_model',
      turn: turns,
      maxTurns: config.maxTurns,
    })

    // Call Anthropic
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: systemPrompt,
      messages: messages as Anthropic.MessageParam[],
      ...(allTools.length > 0 ? { tools: allTools as Anthropic.Tool[] } : {}),
    })

    // Process response content blocks
    const textBlocks: string[] = []
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    for (const block of response.content) {
      if (block.type === 'text') {
        textBlocks.push(block.text)
      } else if (block.type === 'tool_use') {
        toolUseBlocks.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
      }
    }

    finalText = textBlocks.join('')

    if (response.stop_reason === 'tool_use' && toolUseBlocks.length > 0) {
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
