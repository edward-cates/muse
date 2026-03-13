import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../auth/AuthContext'
import { ShareDialog } from './ShareDialog'

interface Props {
  documentId: string
}

export function DocumentTitle({ documentId }: Props) {
  const { session } = useAuth()
  const [title, setTitle] = useState('Untitled')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch current title when documentId changes
  useEffect(() => {
    setTitle('Untitled')
    if (!session?.access_token) return
    let cancelled = false

    fetch('/api/documents', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.documents) return
        const doc = data.documents.find((d: { id: string }) => d.id === documentId)
        if (doc) setTitle(doc.title)
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [documentId, session?.access_token])

  const startEditing = useCallback(() => {
    setDraft(title)
    setEditing(true)
  }, [title])

  const save = useCallback(async () => {
    setEditing(false)
    const trimmed = draft.trim() || 'Untitled'
    if (trimmed === title) return
    setTitle(trimmed)
    if (!session?.access_token) return
    fetch(`/api/documents/${documentId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {})
  }, [draft, title, documentId, session?.access_token])

  const cancel = useCallback(() => {
    setEditing(false)
  }, [])

  // Auto-focus and select when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <div className="drawing-title">
        <input
          ref={inputRef}
          className="drawing-title__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
        />
      </div>
    )
  }

  return (
    <div className="drawing-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <button className="drawing-title__display" onClick={startEditing}>
        {title}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setShareOpen(true) }}
        onMouseDown={(e) => e.stopPropagation()}
        style={shareButtonStyle}
        title="Share document"
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text, #333)'
          e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-muted, #666)'
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
      {shareOpen && createPortal(
        <ShareDialog documentId={documentId} onClose={() => setShareOpen(false)} />,
        document.body,
      )}
    </div>
  )
}

const shareButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 5,
  background: 'transparent',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--text-muted, #666)',
  fontFamily: 'inherit',
  transition: 'color 0.12s, background 0.12s',
  flexShrink: 0,
}
