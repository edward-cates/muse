import { useState, useRef, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  open: boolean
  onClose: () => void
}

export function AiPanel({ open, onClose }: Props) {
  const { session } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || streaming || !session?.access_token) return

    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    const assistantMsg: Message = { role: 'assistant', content: '' }
    setMessages([...newMessages, assistantMsg])

    try {
      abortRef.current = new AbortController()
      const res = await fetch('/api/ai/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Request failed')
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6)
            if (payload === '[DONE]') continue
            try {
              const parsed = JSON.parse(payload)
              if (parsed.error) throw new Error(parsed.error)
              if (parsed.text) {
                accumulated += parsed.text
                setMessages((prev) => {
                  const updated = [...prev]
                  updated[updated.length - 1] = { role: 'assistant', content: accumulated }
                  return updated
                })
              }
            } catch (parseErr: unknown) {
              if (parseErr instanceof SyntaxError) continue
              throw parseErr
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const errMsg = err instanceof Error ? err.message : 'Something went wrong'
      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${errMsg}` }
        return updated
      })
    } finally {
      setStreaming(false)
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
        {messages.length === 0 && (
          <p style={styles.empty}>Ask anything about your drawing...</p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMsg : styles.assistantMsg),
            }}
          >
            <p style={styles.messageText}>{msg.content || (streaming && i === messages.length - 1 ? '...' : '')}</p>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} style={styles.inputArea}>
        <input
          type="text"
          placeholder="Message..."
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
