import { useState, useRef, useEffect, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { CANVAS_TOOLS } from '../ai/tools'
import { buildSystemPrompt } from '../ai/systemPrompt'
import { executeToolCall, type ToolCall, type ElementActions } from '../ai/executeToolCall'
import type { CanvasElement } from '../types'

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
  role: 'user' | 'assistant' | 'tool'
  content: string
}

// ── SSE parsing types ──

interface SseTextDelta { type: 'text_delta'; text: string }
interface SseToolUseStart { type: 'tool_use_start'; id: string; name: string }
interface SseInputJsonDelta { type: 'input_json_delta'; partial_json: string }
interface SseContentBlockStop { type: 'content_block_stop' }
interface SseMessageDelta { type: 'message_delta'; stop_reason: string }
interface SseError { error: string }

type SseEvent = SseTextDelta | SseToolUseStart | SseInputJsonDelta | SseContentBlockStop | SseMessageDelta | SseError

// ── Component ──

interface Props {
  open: boolean
  onClose: () => void
  elements: CanvasElement[]
  elementActions: ElementActions
}

const MAX_TURNS = 10

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

  async function parseStream(
    res: Response,
    signal: AbortSignal,
  ): Promise<{ textContent: string; toolCalls: ToolCall[]; stopReason: string }> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let textContent = ''
    const toolCalls: ToolCall[] = []
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
              toolCalls.push({ id: currentTool.id, name: currentTool.name, input })
              currentTool = null
            }
            break

          case 'message_delta':
            stopReason = event.stop_reason
            break
        }
      }
    }

    return { textContent, toolCalls, stopReason }
  }

  function describeToolCalls(calls: ToolCall[]): string {
    const parts: string[] = []
    let shapes = 0, lines = 0, updates = 0, deletes = 0
    for (const c of calls) {
      switch (c.name) {
        case 'add_shape': shapes++; break
        case 'add_line': lines++; break
        case 'update_element': updates++; break
        case 'delete_element': deletes++; break
      }
    }
    if (shapes) parts.push(`${shapes} shape${shapes > 1 ? 's' : ''} added`)
    if (lines) parts.push(`${lines} line${lines > 1 ? 's' : ''} connected`)
    if (updates) parts.push(`${updates} element${updates > 1 ? 's' : ''} updated`)
    if (deletes) parts.push(`${deletes} element${deletes > 1 ? 's' : ''} removed`)
    return parts.join(', ')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming || !session?.access_token) return

    setInput('')
    setStreaming(true)
    setStatus(null)

    // Add user message to chat display
    setChatMessages((prev) => [...prev, { role: 'user', content: text }])

    // Build API messages
    let currentApiMessages: ApiMessage[] = [
      ...apiMessages,
      { role: 'user', content: text },
    ]

    const abort = new AbortController()
    abortRef.current = abort

    try {
      let turns = 0
      let looping = true

      while (looping && turns < MAX_TURNS) {
        turns++

        // Add placeholder assistant message for streaming
        if (turns === 1) {
          setChatMessages((prev) => [...prev, { role: 'assistant', content: '' }])
        }

        const system = buildSystemPrompt(elements)

        const res = await fetch('/api/ai/message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: currentApiMessages,
            system,
            tools: CANVAS_TOOLS,
          }),
          signal: abort.signal,
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Request failed')
        }

        const { textContent, toolCalls, stopReason } = await parseStream(res, abort.signal)

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

          // Execute tools
          setStatus('Editing canvas...')
          const toolResults = toolCalls.map((tc) => executeToolCall(tc, elementActions))

          // Add tool indicator to chat
          const description = describeToolCalls(toolCalls)
          setChatMessages((prev) => [...prev, { role: 'tool', content: description }])

          // Build tool_result user message
          currentApiMessages = [
            ...currentApiMessages,
            {
              role: 'user',
              content: toolResults.map((r) => ({
                type: 'tool_result' as const,
                tool_use_id: r.tool_use_id,
                content: r.content,
              })),
            },
          ]

          setStatus(null)

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

      // Clean up empty trailing assistant messages
      setChatMessages((prev) => prev.filter(
        (m, i) => !(m.role === 'assistant' && m.content === '' && i === prev.length - 1),
      ))

      // Save final API messages state for future conversation turns
      setApiMessages(currentApiMessages)

    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
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
          <p style={styles.empty}>Ask me to create or edit diagrams on your canvas...</p>
        )}
        {chatMessages.map((msg, i) => {
          if (msg.role === 'tool') {
            return (
              <div key={i} style={styles.toolChip}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
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
              <p style={styles.messageText}>
                {msg.content || (streaming && i === chatMessages.length - 1 ? '...' : '')}
              </p>
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
          placeholder="Draw a flowchart..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
          style={styles.input}
        />
        <button type="submit" disabled={streaming || !input.trim()} style={styles.sendBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
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
}
