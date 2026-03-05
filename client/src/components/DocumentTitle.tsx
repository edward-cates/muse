import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'

interface Props {
  documentId: string
}

export function DocumentTitle({ documentId }: Props) {
  const { session } = useAuth()
  const [title, setTitle] = useState('Untitled')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
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
    <div className="drawing-title">
      <button className="drawing-title__display" onClick={startEditing}>
        {title}
      </button>
    </div>
  )
}
