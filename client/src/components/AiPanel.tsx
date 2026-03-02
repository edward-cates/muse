import { useState, useRef, useEffect, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { useAuth } from '../auth/AuthContext'
import { executeToolCall, type ToolCall, type ElementActions } from '../ai/executeToolCall'
import { captureCanvas, computeBounds } from '../ai/canvasCapture'
import { classifyIntent, type AgentIntent } from '../ai/router'
import { buildCanvasEditorConfig } from '../ai/agents/canvasEditor'
import { buildResearcherConfig } from '../ai/agents/researcher'
import type { AgentConfig } from '../ai/agents/types'
import type { CanvasElement } from '../types'

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

interface Props {
  open: boolean
  onClose: () => void
  elements: CanvasElement[]
  elementActions: ElementActions
}

export function AiPanel({ open, onClose, elements, elementActions }: Props) {
  const { session } = useAuth()
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [apiMessages, setApiMessages] = useState<ApiMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, status])

  /** Tools that mutate canvas content (trigger auto-fit after execution) */
  const CANVAS_MUTATING_TOOLS = new Set([
    'add_shape', 'add_text', 'add_line', 'add_arrow', 'add_web_card',
    'update_element', 'delete_element', 'arrange_grid', 'arrange_flow',
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
            if (currentTool) currentTool.inputJson += event.partial_json
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
      default: return `Running ${tc.name}...`
    }
  }

  function buildAgentConfigFromIntent(intent: AgentIntent): AgentConfig {
    switch (intent) {
      case 'canvas_edit':
        return buildCanvasEditorConfig(elements)
      case 'research':
        return buildResearcherConfig(elements)
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

  async function runAgentLoop(
    config: AgentConfig,
    initialMessages: ApiMessage[],
    abort: AbortController,
    screenshotBase64: string | null,
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
          const result = await executeToolCall(tc, elementActions, fetchUrlViaServer)

          const parsed = (() => { try { return JSON.parse(result.content) } catch { return {} } })()

          // Show per-tool chip (success or error)
          if (parsed.error) {
            failCount++
            setChatMessages((prev) => [...prev, { role: 'tool', content: `Failed: ${parsed.error}` }])
          } else {
            setChatMessages((prev) => [...prev, { role: 'tool', content: describeToolAction(tc).replace(/\.\.\.$/, '') }])
          }

          // Auto-fit viewport after canvas-mutating tools
          if (CANVAS_MUTATING_TOOLS.has(tc.name) && elementActions.fitToContent) {
            elementActions.fitToContent()
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
          storeSnapshot: snapshotElements(elementActions.getElements()),
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

        // VQA: capture post-execution screenshot for canvas editor
        if (config.vqa) {
          const canvasEl = document.querySelector<HTMLDivElement>('[data-testid="canvas"]')
          if (canvasEl) {
            try {
              // Fit viewport before screenshot so the capture shows all content
              if (elementActions.fitToContent) elementActions.fitToContent()

              const currentElements = elementActions.getElements()
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
                source: { type: 'base64', media_type: 'image/png', data: vqaScreenshot },
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
      elements: snapshotElements(elementActions.getElements()),
    })

    return currentApiMessages
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming || !session?.access_token) return

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

    // Add user message to chat display (with screenshot thumbnail)
    setChatMessages((prev) => [...prev, {
      role: 'user',
      content: text,
      ...(screenshotBase64 ? { imageBase64: screenshotBase64 } : {}),
    }])

    // Show which agent is handling this
    if (agentConfig.name !== 'chat') {
      const agentLabel = agentConfig.name === 'researcher' ? 'Researching' : 'Editing canvas'
      setChatMessages((prev) => [...prev, { role: 'status', content: agentLabel }])
    }

    // Build user content: screenshot + text
    const userContent: ContentBlock[] = []
    if (screenshotBase64) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: screenshotBase64 },
      } as unknown as ContentBlock)
    }
    userContent.push({ type: 'text', text })

    // Build API messages
    const currentApiMessages: ApiMessage[] = [
      ...apiMessages,
      { role: 'user', content: screenshotBase64 ? userContent : text },
    ]

    try {
      const finalMessages = await runAgentLoop(agentConfig, currentApiMessages, abort, screenshotBase64)

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
    }
  }

  if (!open) return null

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>AI</h2>
        <button onClick={onClose} style={styles.closeBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

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
                    style={styles.toolScreenshotThumb}
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
                  style={styles.screenshotThumb}
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
          disabled={streaming}
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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    width: 380,
    height: '100vh',
    background: '#fff',
    borderLeft: '1px solid rgba(0,0,0,0.08)',
    boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 900,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(0,0,0,0.06)',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#111',
    margin: 0,
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#6b7280',
    padding: 4,
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
}
