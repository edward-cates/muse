import { useState, useEffect, useCallback, useRef } from 'react'
import { useDocumentContent, useDocumentApi } from '../hooks/useDocument'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../lib/api'
import { DocumentTitle } from './DocumentTitle'
import { buildHtmlEditorConfig, HTML_EDITOR_TOOLS } from '../ai/agents/htmlEditor'

interface Props {
  documentId: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function HtmlArtifactViewer({ documentId }: Props) {
  const { session } = useAuth()
  const [contentVersion, setContentVersion] = useState(0)
  const { content, loading } = useDocumentContent(documentId, contentVersion)
  const { updateContent } = useDocumentApi()
  const [aiOpen, setAiOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const contentRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Keep contentRef in sync
  useEffect(() => { contentRef.current = content ?? null }, [content])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleBack = useCallback(() => {
    window.history.back()
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || !session?.access_token || streaming) return

    const userMsg = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const config = buildHtmlEditorConfig(contentRef.current)

      // Build API messages
      const apiMessages: Array<{ role: string; content: string }> = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg },
      ]

      const res = await fetch(apiUrl('/api/ai/message'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          system: config.systemPrompt,
          tools: config.tools,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error: failed to connect to AI.' }])
        setStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''
      let toolInput = ''
      let inTool = false
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break

          try {
            const evt = JSON.parse(payload)
            if (evt.type === 'text_delta') {
              assistantText += evt.text
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.role === 'assistant') {
                  return [...prev.slice(0, -1), { role: 'assistant', content: assistantText }]
                }
                return [...prev, { role: 'assistant', content: assistantText }]
              })
            } else if (evt.type === 'tool_use_start') {
              inTool = true
              toolInput = ''
            } else if (evt.type === 'input_json_delta' && inTool) {
              toolInput += evt.partial_json
            } else if (evt.type === 'content_block_stop' && inTool) {
              inTool = false
              // Execute the tool
              try {
                const parsed = JSON.parse(toolInput)
                if (parsed.html) {
                  const newVersion = await updateContent(documentId, parsed.html)
                  setContentVersion(newVersion)
                  contentRef.current = parsed.html
                  assistantText += (assistantText ? '\n\n' : '') + '(Updated document content)'
                  setMessages(prev => {
                    const last = prev[prev.length - 1]
                    if (last?.role === 'assistant') {
                      return [...prev.slice(0, -1), { role: 'assistant', content: assistantText }]
                    }
                    return [...prev, { role: 'assistant', content: assistantText }]
                  })
                }
              } catch {
                // tool parse error — ignore
              }
            }
          } catch {
            // json parse error — ignore
          }
        }
      }

      if (!assistantText) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Done.' }])
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Error communicating with AI.' }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, session?.access_token, streaming, messages, documentId, updateContent])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        {window.history.length > 1 && (
          <button onClick={handleBack} style={styles.backBtn} title="Go back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </button>
        )}
        <div style={styles.titleContainer}>
          <DocumentTitle documentId={documentId} />
        </div>
        <button
          onClick={() => setAiOpen(!aiOpen)}
          style={{
            ...styles.aiBtn,
            ...(aiOpen ? { background: 'var(--accent, #4465e9)', color: '#fff' } : {}),
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1.27A7 7 0 0 1 13 23h-2a7 7 0 0 1-6.73-4H3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
          </svg>
          AI
        </button>
      </div>
      <div style={styles.body}>
        <div style={{ ...styles.content, ...(aiOpen ? { marginRight: 380 } : {}) }}>
          {loading && <div style={styles.loading}>Loading...</div>}
          {!loading && content && (
            <iframe
              srcDoc={content}
              sandbox="allow-scripts"
              style={styles.iframe}
              title="HTML Artifact"
            />
          )}
          {!loading && !content && (
            <div style={styles.empty}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <p style={{ marginTop: 16 }}>This document is empty.</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted, #888)' }}>Open the AI panel to generate content.</p>
            </div>
          )}
        </div>
        {aiOpen && (
          <div style={styles.aiPanel}>
            <div style={styles.aiHeader}>
              <span style={styles.aiTitle}>AI Editor</span>
              <button onClick={() => setAiOpen(false)} style={styles.aiClose}>&times;</button>
            </div>
            <div style={styles.aiMessages}>
              {messages.length === 0 && (
                <div style={styles.aiEmpty}>
                  Describe what you want to build or change.
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={msg.role === 'user' ? styles.aiMsgUser : styles.aiMsgAssistant}>
                  {msg.content}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form
              style={styles.aiInput}
              onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={streaming ? 'AI is working...' : 'Describe changes...'}
                disabled={streaming}
                style={styles.aiInputField}
              />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  style={styles.aiStopBtn}
                >Stop</button>
              ) : (
                <button type="submit" disabled={!input.trim()} style={styles.aiSendBtn}>Send</button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    height: '100%',
    background: 'var(--bg, #f5f5f5)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '8px 16px',
    borderBottom: '1px solid var(--border, #e0e0e0)',
    background: 'var(--surface, #fff)',
    zIndex: 10,
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 500,
    color: 'var(--text-muted, #666)',
    background: 'none',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  titleContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  aiBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 600,
    color: 'var(--text-muted, #666)',
    background: 'var(--accent-light, #eef)',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    cursor: 'pointer',
  },
  body: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    transition: 'margin-right 0.2s ease',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
    background: '#fff',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: 14,
    color: 'var(--text-muted, #666)',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: 15,
    color: 'var(--text, #333)',
  },
  // AI Panel
  aiPanel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 380,
    background: 'var(--surface, #fff)',
    borderLeft: '1px solid var(--border, #e0e0e0)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
  },
  aiHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border, #e0e0e0)',
  },
  aiTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--text, #333)',
  },
  aiClose: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    cursor: 'pointer',
    color: 'var(--text-muted, #666)',
    fontFamily: 'inherit',
    padding: '0 4px',
  },
  aiMessages: {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  aiEmpty: {
    fontSize: 13,
    color: 'var(--text-muted, #888)',
    textAlign: 'center',
    marginTop: 40,
  },
  aiMsgUser: {
    alignSelf: 'flex-end',
    background: '#1a1a2e',
    color: '#fff',
    padding: '8px 14px',
    borderRadius: '14px 14px 4px 14px',
    fontSize: 14,
    maxWidth: '85%',
    whiteSpace: 'pre-wrap',
  },
  aiMsgAssistant: {
    alignSelf: 'flex-start',
    background: 'var(--accent-light, #eef)',
    color: 'var(--text, #333)',
    padding: '8px 14px',
    borderRadius: '14px 14px 14px 4px',
    fontSize: 14,
    maxWidth: '85%',
    whiteSpace: 'pre-wrap',
  },
  aiInput: {
    display: 'flex',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--border, #e0e0e0)',
  },
  aiInputField: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: 8,
    outline: 'none',
  },
  aiSendBtn: {
    padding: '8px 16px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 600,
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
  aiStopBtn: {
    padding: '8px 16px',
    fontSize: 13,
    fontFamily: 'inherit',
    fontWeight: 600,
    background: '#dc2626',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
  },
}
