import { useState, useRef, useEffect, useCallback, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../auth/AuthContext'
import { executeToolCall, type ToolCall, type DecomposeTextFn, type GenerateImageFn } from '../ai/executeToolCall'
import { captureCanvas, computeBounds } from '../ai/canvasCapture'
import { classifyIntent, type AgentIntent } from '../ai/router'
import { buildCanvasEditorConfig } from '../ai/agents/canvasEditor'
import { buildResearcherConfig } from '../ai/agents/researcher'
import { buildComposerConfig } from '../ai/agents/composer'
import type { AgentConfig } from '../ai/agents/types'
import type { CanvasElement } from '../types'
import { useJobStatus, createJob } from '../hooks/useJobStatus'
import { useActiveCanvas } from '../ai/ActiveCanvasContext'

// ── AI interaction logger ──

function makeConversationId(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

async function logToFile(
  token: string,
  conversationId: string,
  turn: number,
  filename: string,
  data: unknown,
) {
  try {
    await fetch('/api/ailog/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversation: conversationId, turn, filename, data }),
    })
  } catch { /* best-effort */ }
}

function snapshotElements(elements: CanvasElement[]) {
  return elements.map(e => ({
    id: e.id.slice(0, 8),
    type: e.type,
    ...('text' in e ? { text: (e as { text: string }).text } : {}),
    ...('x' in e ? { x: (e as { x: number }).x, y: (e as { y: number }).y } : {}),
  }))
}

// ── Types ──

/** A single content block in the Anthropic messages API format */
type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

/** A message in the Anthropic messages API format */
interface ApiMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

/** Display message for the chat UI */
interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'status'
  content: string
  imageBase64?: string
}

// ── SSE parsing types ──

interface SseTextDelta { type: 'text_delta'; text: string }
interface SseToolUseStart { type: 'tool_use_start'; id: string; name: string }
interface SseInputJsonDelta { type: 'input_json_delta'; partial_json: string }
interface SseContentBlockStop { type: 'content_block_stop' }
interface SseMessageDelta { type: 'message_delta'; stop_reason: string }
interface SseServerToolUseStart { type: 'server_tool_use_start'; name: string; input: Record<string, unknown> }
interface SseError { error: string }

type SseEvent = SseTextDelta | SseToolUseStart | SseInputJsonDelta | SseContentBlockStop | SseMessageDelta | SseServerToolUseStart | SseError

// ── Component ──

// Module-level persistent state — survives component remounts during navigation
let _persistedChat: ChatMessage[] = []
let _persistedApi: ApiMessage[] = []
let _persistedChatId: string | null = null

interface ChatListItem {
  id: string
  title: string
  created_at: string
  updated_at: string
}

export function AiPanel() {
  const { elements, elementActions, documentId, connectionStatus: ctxConnectionStatus, onSettingsClick, onToggleMinimap, onToggleDarkMode } = useActiveCanvas()
  const connectionStatus = ctxConnectionStatus || 'disconnected'
  const { session } = useAuth()
  const [chatMessages, _setChatMessages] = useState<ChatMessage[]>(_persistedChat)
  const [apiMessages, _setApiMessages] = useState<ApiMessage[]>(_persistedApi)
  const [chatId, _setChatId] = useState<string | null>(_persistedChatId)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [chatList, setChatList] = useState<ChatListItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [activeJobCardId, setActiveJobCardId] = useState<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevDocumentIdRef = useRef<string | null>(documentId)
  const hasCanvas = !!elementActions

  // Track canvas navigation — inject a status message when the user switches canvases
  useEffect(() => {
    const prev = prevDocumentIdRef.current
    prevDocumentIdRef.current = documentId
    if (prev && documentId && prev !== documentId && chatMessages.length > 0) {
      setChatMessages(msgs => [...msgs, {
        role: 'status' as const,
        content: 'You navigated to a different canvas.',
      }])
    }
  }, [documentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll job status when a server-side job is active
  const jobStatus = useJobStatus(activeJobId, session?.access_token || null)

  // Wrap setState to persist across remounts.
  // Update the module-level variable FIRST (always works), then call setState
  // for re-rendering (silently dropped if component is unmounted in React 18).
  const setChatMessages = useCallback((action: React.SetStateAction<ChatMessage[]>) => {
    const next = typeof action === 'function' ? action(_persistedChat) : action
    _persistedChat = next
    _setChatMessages(next)
  }, [])

  const setApiMessages = useCallback((action: React.SetStateAction<ApiMessage[]>) => {
    const next = typeof action === 'function' ? action(_persistedApi) : action
    _persistedApi = next
    _setApiMessages(next)
  }, [])

  const setChatId = useCallback((id: string | null) => {
    _persistedChatId = id
    _setChatId(id)
  }, [])

  // Update chat UI and card status when job status changes
  useEffect(() => {
    if (!jobStatus || !activeJobId) return

    if (jobStatus.status === 'running') {
      const step = jobStatus.progress?.step as string || 'working'
      const tool = jobStatus.progress?.tool as string || ''
      const desc = tool ? `${step}: ${tool}` : step
      setStatus(desc.replace(/_/g, ' '))
      // Card description is updated in real-time via live Yjs from the worker
    } else if (jobStatus.status === 'completed') {
      const resultText = (jobStatus.result as { textContent?: string })?.textContent || 'Research complete.'
      setChatMessages(prev => {
        const filtered = prev.filter((m, i) => !(m.role === 'assistant' && m.content === '' && i === prev.length - 1))
        return [...filtered, { role: 'assistant', content: resultText }]
      })
      if (activeJobCardId) {
        elementActions?.updateElement(activeJobCardId, { jobStatus: 'completed', description: '' })
      }
      setStreaming(false)
      setStatus(null)
      setActiveJobId(null)
      setActiveJobCardId(null)
    } else if (jobStatus.status === 'failed' || jobStatus.status === 'stalled') {
      const errMsg = jobStatus.error || 'Job failed'
      setChatMessages(prev => {
        const filtered = prev.filter((m, i) => !(m.role === 'assistant' && m.content === '' && i === prev.length - 1))
        return [...filtered, { role: 'assistant', content: `Error: ${errMsg}` }]
      })
      if (activeJobCardId) {
        elementActions?.updateElement(activeJobCardId, { jobStatus: 'failed', description: errMsg })
      }
      setStreaming(false)
      setStatus(null)
      setActiveJobId(null)
      setActiveJobCardId(null)
    } else if (jobStatus.status === 'cancelled') {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Research cancelled.' }])
      if (activeJobCardId) {
        elementActions?.updateElement(activeJobCardId, { jobStatus: 'cancelled', description: '' })
      }
      setStreaming(false)
      setStatus(null)
      setActiveJobId(null)
      setActiveJobCardId(null)
    }
  }, [jobStatus, activeJobId, activeJobCardId, elementActions, setChatMessages])

  // On mount: reconcile any cards stuck with jobStatus='running'/'pending' against actual job status
  useEffect(() => {
    if (!session?.access_token) return
    const staleCards = elements.filter(
      (el): el is import('../types').DocumentCardElement =>
        el.type === 'document_card' &&
        'jobId' in el && !!(el as any).jobId &&
        'jobStatus' in el && ((el as any).jobStatus === 'running' || (el as any).jobStatus === 'pending'),
    )
    if (staleCards.length === 0) return

    for (const card of staleCards) {
      fetch(`/api/jobs/${card.jobId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then((job: { status: string } | null) => {
          if (!job) return
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'stalled') {
            elementActions?.updateElement(card.id, { jobStatus: job.status, description: '' })
          }
        })
        .catch(() => {})
    }
    // Only run once on mount — elements ref intentionally excluded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token])

  /** Save current chat to server */
  async function saveChat() {
    const token = session?.access_token
    if (!token || _persistedChat.length === 0) return
    try {
      const res = await fetch('/api/ai/chats', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(_persistedChatId ? { id: _persistedChatId } : {}),
          messages: _persistedChat.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      if (res.ok) {
        const data = await res.json() as { id: string }
        if (!_persistedChatId) setChatId(data.id)
      } else {
        console.error('[saveChat] server returned', res.status, await res.text().catch(() => ''))
      }
    } catch (err) {
      console.error('[saveChat] failed', err)
    }
  }

  /** Load chat list from server */
  async function loadChatList() {
    if (!session?.access_token) return
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/ai/chats', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json() as { chats: ChatListItem[] }
        setChatList(data.chats)
      }
    } catch { /* best-effort */ }
    setLoadingHistory(false)
  }

  /** Load a specific chat by ID */
  async function loadChat(id: string) {
    if (!session?.access_token) return
    try {
      const res = await fetch(`/api/ai/chats/${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) {
        const data = await res.json() as { id: string; messages: ChatMessage[] }
        setChatId(data.id)
        setChatMessages(data.messages)
        setApiMessages([]) // API messages not persisted — new turns start fresh context
        setShowHistory(false)
      }
    } catch { /* best-effort */ }
  }

  /** Start a new chat */
  function startNewChat() {
    setChatId(null)
    setChatMessages([])
    setApiMessages([])
    setShowHistory(false)
  }

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, status])

  /** Tools that mutate canvas content (trigger auto-fit after execution) */
  const CANVAS_MUTATING_TOOLS = new Set([
    'add_shape', 'add_text', 'add_line', 'add_arrow', 'add_web_card',
    'update_element', 'delete_element', 'arrange_grid', 'arrange_flow',
    'create_document', 'decompose_text', 'generate_image',
  ])

  async function parseStreamAndExecute(
    res: Response,
    signal: AbortSignal,
    onToolCall: (tc: ToolCall) => Promise<{ tool_use_id: string; content: string }>,
    onStatus?: (status: string) => void,
  ): Promise<{ textContent: string; toolCalls: ToolCall[]; toolResults: { tool_use_id: string; content: string }[]; stopReason: string }> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let textContent = ''
    const toolCalls: ToolCall[] = []
    const toolResults: { tool_use_id: string; content: string }[] = []
    let currentTool: { id: string; name: string; inputJson: string } | null = null
    let stopReason = 'end_turn'
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal.aborted) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') continue

        let event: SseEvent
        try {
          event = JSON.parse(payload)
        } catch {
          continue
        }

        if ('error' in event) {
          throw new Error(event.error)
        }

        switch (event.type) {
          case 'text_delta':
            textContent += event.text
            // Update chat display in real-time
            setChatMessages((prev) => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: textContent }
              } else {
                updated.push({ role: 'assistant', content: textContent })
              }
              return updated
            })
            break

          case 'tool_use_start':
            currentTool = { id: event.id, name: event.name, inputJson: '' }
            break

          case 'input_json_delta':
            if (currentTool) {
              currentTool.inputJson += event.partial_json
              // Show streaming progress for content-heavy tools
              if (currentTool.name === 'create_document' || currentTool.name === 'update_document_content') {
                const len = currentTool.inputJson.length
                const blocks = Math.min(Math.floor(len / 500), 20)
                const bar = '█'.repeat(blocks) + '░'.repeat(Math.max(0, 3 - blocks))
                onStatus?.(`Writing wireframe ${bar} ${(len / 1000).toFixed(1)}k`)
              }
            }
            break

          case 'content_block_stop':
            if (currentTool) {
              let input: Record<string, unknown> = {}
              try {
                input = JSON.parse(currentTool.inputJson)
              } catch { /* empty */ }
              const tc: ToolCall = { id: currentTool.id, name: currentTool.name, input }
              toolCalls.push(tc)
              currentTool = null

              // Execute immediately as tool completes
              if (!signal.aborted) {
                const result = await onToolCall(tc)
                toolResults.push(result)
              }
            }
            break

          case 'message_delta':
            stopReason = event.stop_reason
            break

          case 'server_tool_use_start':
            if (event.name === 'web_search' && event.input?.query) {
              onStatus?.(`Searching for "${event.input.query}"...`)
            }
            break
        }
      }
    }

    return { textContent, toolCalls, toolResults, stopReason }
  }

  function describeToolAction(tc: ToolCall): string {
    const inp = tc.input
    switch (tc.name) {
      case 'add_shape': {
        const label = inp.text ? `: ${String(inp.text).slice(0, 30)}` : ''
        return `Adding ${inp.shape_type || 'shape'}${label}...`
      }
      case 'add_text': return `Adding text...`
      case 'add_line': return `Connecting shapes...`
      case 'add_arrow': return `Adding arrow...`
      case 'update_element': return `Updating element...`
      case 'delete_element': return `Removing element...`
      case 'arrange_grid': return `Arranging layout...`
      case 'arrange_flow': return `Arranging flow...`
      case 'add_web_card': {
        const title = inp.title ? `: ${String(inp.title).slice(0, 30)}` : ''
        return `Creating card${title}...`
      }
      case 'fetch_url': {
        try {
          const hostname = new URL(String(inp.url)).hostname
          return `Reading ${hostname}...`
        } catch {
          return `Fetching page...`
        }
      }
      case 'set_viewport': return `Adjusting view...`
      case 'create_document': return `Creating document...`
      case 'update_document_content': return `Updating document...`
      case 'decompose_text': return `Decomposing text into topics...`
      case 'generate_image': return `Generating image...`
      default: return `Running ${tc.name}...`
    }
  }

  function buildAgentConfigFromIntent(intent: AgentIntent): AgentConfig {
    switch (intent) {
      case 'canvas_edit':
        return buildCanvasEditorConfig(elements)
      case 'research':
        return buildResearcherConfig(elements)
      case 'compose':
        return buildComposerConfig(elements)
      case 'chat':
      default:
        return {
          name: 'chat',
          systemPrompt: `You are a helpful assistant for Muse, a collaborative canvas app. The canvas currently has ${elements.length} elements. Answer questions conversationally and concisely.`,
          tools: [],
          maxTurns: 1,
        }
    }
  }

  async function buildAgentConfig(
    text: string,
    token: string,
    signal?: AbortSignal,
  ): Promise<AgentConfig> {
    const intent = await classifyIntent(text, token, signal)
    return buildAgentConfigFromIntent(intent)
  }

  /** Decompose text via server endpoint */
  const decomposeTextViaServer: DecomposeTextFn = async (text, title) => {
    const res = await fetch('/api/decompose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify({ text, title }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || `Decompose failed (${res.status})`)
    }
    return res.json()
  }

  /** Generate image via server endpoint */

  /** Fetch URL via server proxy */
  async function fetchUrlViaServer(url: string): Promise<{ title: string; text: string; url: string }> {
    const res = await fetch('/api/fetch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || `Fetch failed (${res.status})`)
    }
    return res.json()
  }

  /** Generate an image via server proxy to OpenAI DALL-E */
  async function generateImageViaServer(prompt: string, size?: string): Promise<{ url: string; revised_prompt?: string }> {
    const res = await fetch('/api/image-gen', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session!.access_token}`,
      },
      body: JSON.stringify({ prompt, size }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || `Image generation failed (${res.status})`)
    }
    return res.json()
  }

  async function runAgentLoop(
    config: AgentConfig,
    initialMessages: ApiMessage[],
    abort: AbortController,
    screenshotBase64: string | null,
    actions: NonNullable<typeof elementActions>,
  ): Promise<ApiMessage[]> {
    let currentApiMessages = initialMessages
    let turns = 0
    let looping = true
    let consecutiveFailTurns = 0
    const conversationId = makeConversationId()
    const token = session!.access_token
    const log = (turn: number, filename: string, data: unknown) =>
      logToFile(token, conversationId, turn, filename, data)

    // Build tools array: custom tools + native tools
    const allTools: unknown[] = [...config.tools]
    if (config.nativeTools) {
      allTools.push(...config.nativeTools)
    }

    // Log conversation setup
    log(0, 'config.json', { agent: config.name, maxTurns: config.maxTurns, vqa: !!config.vqa, toolCount: allTools.length })
    log(0, 'system-prompt.txt', config.systemPrompt)

    try {
    while (looping && turns < config.maxTurns) {
      turns++

      // Add placeholder assistant message for streaming
      if (turns === 1) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      }

      // Log request (redact base64 images)
      const redactedMessages = currentApiMessages.map(m => {
        if (typeof m.content === 'string') return m
        return { ...m, content: (m.content as ContentBlock[]).map(b =>
          'source' in (b as Record<string, unknown>) ? { type: 'image', note: '(base64 omitted)' } : b
        )}
      })
      log(turns, 'request.json', { messages: redactedMessages })

      const res = await fetch('/api/ai/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: currentApiMessages,
          system: config.systemPrompt,
          tools: allTools.length > 0 ? allTools : undefined,
        }),
        signal: abort.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Request failed')
      }

      // Stream-and-execute: tools are executed inline as they complete
      let failCount = 0
      const { textContent, toolCalls, toolResults, stopReason } = await parseStreamAndExecute(
        res, abort.signal,
        async (tc) => {
          setStatus(describeToolAction(tc))
          const result = await executeToolCall(tc, actions, fetchUrlViaServer, decomposeTextViaServer, generateImageViaServer)

          const parsed = (() => { try { return JSON.parse(result.content) } catch { return {} } })()

          // Show per-tool chip (success or error)
          if (parsed.error) {
            failCount++
            setChatMessages((prev) => [...prev, { role: 'tool', content: `Failed: ${parsed.error}` }])
          } else {
            setChatMessages((prev) => [...prev, { role: 'tool', content: describeToolAction(tc).replace(/\.\.\.$/, '') }])
          }

          // Auto-fit viewport after canvas-mutating tools
          if (CANVAS_MUTATING_TOOLS.has(tc.name) && actions.fitToContent) {
            actions.fitToContent()
          }

          return result
        },
        setStatus,
      )

      // Log model response
      log(turns, 'response.json', {
        stopReason,
        textContent: textContent || null,
        toolCalls: toolCalls.map(tc => ({ id: tc.id, name: tc.name, input: tc.input })),
      })

      if (stopReason === 'tool_use' && toolCalls.length > 0) {
        // Build the assistant's API message with all content blocks
        const assistantBlocks: ContentBlock[] = []
        if (textContent) assistantBlocks.push({ type: 'text', text: textContent })
        for (const tc of toolCalls) {
          assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
        }
        currentApiMessages = [
          ...currentApiMessages,
          { role: 'assistant', content: assistantBlocks },
        ]

        // Log all tool results + store snapshot
        log(turns, 'tool-results.json', {
          results: toolResults.map(r => ({ tool_use_id: r.tool_use_id, ...(() => { try { return JSON.parse(r.content) } catch { return { raw: r.content } } })() })),
          failCount,
          storeSnapshot: snapshotElements(actions.getElements()),
        })

        // Track failure rate — >50% failures counts as a bad turn
        const failRate = toolCalls.length > 0 ? failCount / toolCalls.length : 0
        consecutiveFailTurns = failRate > 0.5 ? consecutiveFailTurns + 1 : 0

        // Build tool_result user message
        const toolResultBlocks: ContentBlock[] = toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        }))

        // VQA: strip old screenshots from previous messages to avoid accumulating costs
        if (config.vqa) {
          currentApiMessages = currentApiMessages.map(msg => {
            if (msg.role !== 'user' || typeof msg.content === 'string') return msg
            const filtered = (msg.content as ContentBlock[]).filter(
              b => !('source' in (b as Record<string, unknown>))
            )
            return { ...msg, content: filtered }
          })
        }

        // VQA: capture post-execution screenshot for canvas editor
        if (config.vqa) {
          const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
          if (canvasEl) {
            try {
              // Fit viewport before screenshot so the capture shows all content
              if (actions.fitToContent) actions.fitToContent()

              const currentElements = actions.getElements()
              const bounds = computeBounds(currentElements)
              const vqaScreenshot = await captureCanvas(canvasEl)

              // Show screenshot in chat so the user can see what the model sees
              setChatMessages((prev) => [...prev, {
                role: 'tool',
                content: 'Canvas screenshot',
                imageBase64: vqaScreenshot,
              }])

              const boundsText = bounds
                ? `Content bounds: x=${bounds.x} y=${bounds.y} ${bounds.width}×${bounds.height}`
                : 'Canvas is empty'
              toolResultBlocks.push({
                type: 'text',
                text: `[Screenshot of canvas after your changes. ${boundsText}. Verify the layout looks correct — fix overlaps or missing connections.]`,
              } as unknown as ContentBlock)
              toolResultBlocks.push({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: vqaScreenshot },
              } as unknown as ContentBlock)
              log(turns, 'vqa-screenshot.txt', { boundsText, captured: true })
            } catch { /* best-effort */ }
          }
        }

        currentApiMessages = [
          ...currentApiMessages,
          { role: 'user', content: toolResultBlocks },
        ]

        setStatus(null)

        // Stop after 2 consecutive high-failure turns
        if (consecutiveFailTurns >= 2) {
          setChatMessages((prev) => [...prev, {
            role: 'assistant',
            content: 'Stopped — repeated tool failures. Try rephrasing your request.',
          }])
          log(turns, 'stopped.json', { reason: 'consecutive_failures', consecutiveFailTurns })
          looping = false
          continue
        }

        // Add placeholder for the next assistant response
        setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }])
      } else {
        // Final response — record assistant text in API messages
        if (textContent) {
          currentApiMessages = [
            ...currentApiMessages,
            { role: 'assistant', content: textContent },
          ]
        }
        looping = false
      }
    }

    // Log final state
    log(turns, 'final-state.json', {
      totalTurns: turns,
      elements: snapshotElements(actions.getElements()),
    })

    return currentApiMessages
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      const errStack = err instanceof Error ? err.stack : undefined
      log(turns, 'error.json', {
        error: errMsg,
        stack: errStack,
        timestamp: new Date().toISOString(),
      })
      throw err
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming || !session?.access_token || !elementActions) return
    const actions = elementActions // capture non-null ref for async closure

    // Immediate UX feedback before async classification
    setInput('')
    setStreaming(true)
    setStatus('Thinking...')

    const abort = new AbortController()
    abortRef.current = abort

    // Classify intent via LLM (with keyword fallback)
    let agentConfig: AgentConfig
    try {
      agentConfig = await buildAgentConfig(text, session.access_token, abort.signal)
    } catch {
      // AbortError or unexpected — fall back gracefully
      setStreaming(false)
      setStatus(null)
      return
    }
    setStatus(null)

    // Capture canvas screenshot if available (before adding message so thumbnail is ready)
    let screenshotBase64: string | null = null
    const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
    if (canvasEl) {
      try {
        screenshotBase64 = await captureCanvas(canvasEl)
      } catch {
        // Screenshot capture is best-effort
      }
    }

    // Add user message to chat display
    setChatMessages((prev) => [...prev, { role: 'user', content: text }])

    // Show which agent is handling this
    if (agentConfig.name !== 'chat') {
      const agentLabel = agentConfig.name === 'researcher' ? 'Researching'
        : agentConfig.name === 'composer' ? 'Composing'
        : 'Editing canvas'
      setChatMessages((prev) => [...prev, { role: 'status', content: agentLabel }])
    }

    // Route research and compose to server-side job system
    if (agentConfig.name === 'researcher' || agentConfig.name === 'composer') {
      try {
        if (!actions.createDocument || !actions.addDocumentCard) {
          throw new Error('Document actions not available')
        }

        const jobType = agentConfig.name === 'researcher' ? 'research' : 'compose'

        // 1. Create a workspace document so it appears on the board immediately
        const workspaceDoc = await actions.createDocument({ title: text.slice(0, 60), type: 'canvas' })

        // 2. Place a document card on the current canvas
        const cardId = actions.addDocumentCard(100, 100, 280, 200, workspaceDoc.id, 'canvas', text.slice(0, 60))

        // 3. Create the job, passing the workspace ID and parent info
        const hashMatch = window.location.hash.match(/#\/d\/(.+)/)
        const parentDocId = hashMatch?.[1] || ''
        const jobId = await createJob(session.access_token, jobType, {
          message: text,
          parentDocumentId: parentDocId,
          parentCardId: cardId,
        }, workspaceDoc.id)

        // 4. Stamp the jobId and running status on the card so it shows progress
        actions.updateElement(cardId, { jobId, jobStatus: 'running' })

        setActiveJobId(jobId)
        setActiveJobCardId(cardId)
        setStatus(jobType === 'compose' ? 'Composing...' : 'Starting research...')
        // Don't call runAgentLoop — the server handles it
        saveChat()
        return
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : `Failed to start ${agentConfig.name} job`
        setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
        setStreaming(false)
        setStatus(null)
        return
      }
    }

    // Build user content: screenshot + text
    const userContent: ContentBlock[] = []
    if (screenshotBase64) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64 },
      } as unknown as ContentBlock)
    }
    userContent.push({ type: 'text', text })

    // Build API messages
    const currentApiMessages: ApiMessage[] = [
      ...apiMessages,
      { role: 'user', content: screenshotBase64 ? userContent : text },
    ]

    try {
      const finalMessages = await runAgentLoop(agentConfig, currentApiMessages, abort, screenshotBase64, actions)

      // Clean up empty trailing assistant messages
      setChatMessages((prev) => prev.filter(
        (m, i) => !(m.role === 'assistant' && m.content === '' && i === prev.length - 1),
      ))

      // Save final API messages state for future conversation turns
      setApiMessages(finalMessages)

    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setChatMessages((prev) => {
          const filtered = prev.filter(
            (m, i) => !(m.role === 'assistant' && m.content === '' && i === prev.length - 1),
          )
          return [...filtered, { role: 'assistant', content: 'Stopped.' }]
        })
        return
      }
      const errMsg = err instanceof Error ? err.message : 'Something went wrong'
      console.error('[AI agent loop error]', err)
      setChatMessages((prev) => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, content: `Error: ${errMsg}` }
        } else {
          updated.push({ role: 'assistant', content: `Error: ${errMsg}` })
        }
        return updated
      })
    } finally {
      setStreaming(false)
      setStatus(null)
      abortRef.current = null
      // Auto-save chat to DB (best-effort, after agent loop completes or errors)
      saveChat()
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span className={`statusbar__dot statusbar__dot--${connectionStatus}`} />
          <h2 style={styles.title}>AI</h2>
        </div>
        <div style={styles.headerActions}>
          <button
            className="statusbar__btn"
            data-testid="chat-history-btn"
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadChatList() }}
            title="Chat History"
            style={showHistory ? { background: 'rgba(79, 70, 229, 0.1)', color: '#4f46e5' } : {}}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          <button className="statusbar__btn" data-testid="toggle-minimap" onClick={onToggleMinimap} title="Minimap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
            </svg>
          </button>
          <button className="statusbar__btn" data-testid="toggle-dark-mode" onClick={onToggleDarkMode} title="Dark Mode">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
          <button className="statusbar__btn" onClick={onSettingsClick} title="Settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {showHistory ? (
        <div style={styles.messages}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Chat History</span>
            <button
              onClick={startNewChat}
              data-testid="new-chat-btn"
              style={styles.newChatBtn}
            >
              + New Chat
            </button>
          </div>
          {loadingHistory && <p style={styles.empty}>Loading...</p>}
          {!loadingHistory && chatList.length === 0 && <p style={styles.empty}>No saved chats yet.</p>}
          {chatList.map(chat => (
            <button
              key={chat.id}
              data-testid="chat-list-item"
              onClick={() => loadChat(chat.id)}
              style={styles.chatListItem}
            >
              <span style={styles.chatListTitle}>{chat.title}</span>
              <span style={styles.chatListDate}>
                {new Date(chat.updated_at).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      ) : (<>
      <div style={styles.messages}>
        {chatMessages.length === 0 && (
          <p style={styles.empty}>Ask me to create diagrams, research topics, or chat...</p>
        )}
        {chatMessages.map((msg, i) => {
          if (msg.role === 'tool') {
            const isError = msg.content.startsWith('Failed:')
            return (
              <div key={i} style={{
                ...(isError ? styles.toolChipError : styles.toolChip),
                ...(msg.imageBase64 ? { flexDirection: 'column' as const, alignItems: 'flex-start' as const } : {}),
              }}>
                {msg.imageBase64 && (
                  <img
                    src={`data:image/png;base64,${msg.imageBase64}`}
                    alt="Canvas screenshot"
                    style={{ ...styles.toolScreenshotThumb, cursor: 'pointer' }}
                    onClick={() => setLightboxSrc(`data:image/png;base64,${msg.imageBase64}`)}
                  />
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isError ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                  <span>{msg.content}</span>
                </div>
              </div>
            )
          }
          if (msg.role === 'status') {
            return (
              <div key={i} style={styles.agentChip}>
                <span>{msg.content}</span>
              </div>
            )
          }
          if (msg.role === 'assistant' && msg.content === '' && streaming) {
            return null // Hide empty streaming placeholders
          }
          if (msg.role === 'assistant' && msg.content === '') {
            return null // Hide empty messages
          }
          return (
            <div
              key={i}
              style={{
                ...styles.message,
                ...(msg.role === 'user' ? styles.userMsg : styles.assistantMsg),
              }}
            >
              {msg.imageBase64 && (
                <img
                  src={`data:image/png;base64,${msg.imageBase64}`}
                  alt="Canvas screenshot"
                  style={{ ...styles.screenshotThumb, cursor: 'pointer' }}
                  onClick={() => setLightboxSrc(`data:image/png;base64,${msg.imageBase64}`)}
                />
              )}
              {msg.role === 'assistant' ? (
                <div className="ai-chat-markdown">
                  <ReactMarkdown>{msg.content || (streaming && i === chatMessages.length - 1 ? '...' : '')}</ReactMarkdown>
                </div>
              ) : (
                <p style={styles.messageText}>
                  {msg.content || (streaming && i === chatMessages.length - 1 ? '...' : '')}
                </p>
              )}
            </div>
          )
        })}
        {status && (
          <div style={styles.statusChip}>
            <div style={styles.statusDot} />
            <span>{status}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <input
          type="text"
          placeholder="Draw a flowchart, research a topic, or ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming || !hasCanvas}
          style={styles.input}
        />
        {streaming ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            style={styles.stopBtn}
            data-testid="stop-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} style={styles.sendBtn}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        )}
      </form>
      </>)}
      {lightboxSrc && (
        <div
          style={styles.lightboxOverlay}
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="Canvas screenshot (full size)"
            style={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    width: 380,
    height: '100%',
    background: '#fff',
    borderLeft: '1px solid rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  messages: {
    flex: 1,
    overflow: 'auto',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  empty: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center' as const,
    marginTop: 40,
  },
  message: {
    padding: '10px 14px',
    borderRadius: 12,
    maxWidth: '85%',
  },
  userMsg: {
    alignSelf: 'flex-end',
    background: '#111',
    color: '#fff',
  },
  assistantMsg: {
    alignSelf: 'flex-start',
    background: '#f3f4f6',
    color: '#111',
  },
  screenshotThumb: {
    maxWidth: 240,
    borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    marginBottom: 6,
    display: 'block',
  },
  toolScreenshotThumb: {
    maxWidth: 200,
    borderRadius: 6,
    border: '1px solid rgba(79, 70, 229, 0.15)',
    marginBottom: 4,
    display: 'block',
  },
  lightboxOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    cursor: 'pointer',
  },
  lightboxImage: {
    maxWidth: '90vw',
    maxHeight: '90vh',
    borderRadius: 8,
    boxShadow: '0 4px 40px rgba(0,0,0,0.5)',
    cursor: 'default',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 1.5,
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
  },
  toolChip: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: 'rgba(79, 70, 229, 0.08)',
    color: '#4f46e5',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
  },
  toolChipError: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    background: 'rgba(220, 38, 38, 0.08)',
    color: '#dc2626',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
  },
  agentChip: {
    alignSelf: 'center',
    padding: '4px 12px',
    background: 'rgba(0, 0, 0, 0.04)',
    color: '#6b7280',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  statusChip: {
    alignSelf: 'flex-start',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 10px',
    color: '#6b7280',
    fontSize: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4f46e5',
    animation: 'pulse 1.2s ease infinite',
  },
  inputArea: {
    display: 'flex',
    gap: 8,
    padding: '12px 20px',
    borderTop: '1px solid rgba(0,0,0,0.06)',
  },
  input: {
    flex: 1,
    padding: '10px 14px',
    fontSize: 14,
    border: '1px solid rgba(0,0,0,0.12)',
    borderRadius: 10,
    outline: 'none',
    fontFamily: 'inherit',
  },
  sendBtn: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
  },
  stopBtn: {
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
  },
  newChatBtn: {
    fontSize: 12,
    fontWeight: 500,
    color: '#4f46e5',
    background: 'rgba(79, 70, 229, 0.08)',
    border: 'none',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  chatListItem: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 12px',
    background: '#f9fafb',
    border: '1px solid rgba(0,0,0,0.06)',
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left' as const,
    gap: 8,
  },
  chatListTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: '#111',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  chatListDate: {
    fontSize: 11,
    color: '#9ca3af',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
}
