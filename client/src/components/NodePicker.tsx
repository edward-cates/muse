import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../lib/api'

interface Document {
  id: string
  title: string
  type: string
}

interface Props {
  currentDocumentId: string
  onCreateNew: () => void
  onLinkExisting: (doc: Document) => void
  onClose: () => void
}

export function NodePicker({ currentDocumentId, onCreateNew, onLinkExisting, onClose }: Props) {
  const { session } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session?.access_token) return
    let cancelled = false

    fetch(apiUrl('/api/documents'), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data?.documents) return
        // Exclude the current document from the list
        setDocuments(data.documents.filter((d: Document) => d.id !== currentDocumentId))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [session?.access_token, currentDocumentId])

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  return (
    <div ref={ref} className="node-picker" data-testid="node-picker">
      <button
        className="node-picker__item node-picker__item--new"
        data-testid="node-picker-new"
        onClick={() => { onCreateNew(); onClose() }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Create new canvas</span>
      </button>

      {loading && <div className="node-picker__loading">Loading...</div>}

      {!loading && documents.length > 0 && (
        <div className="node-picker__divider" />
      )}

      {!loading && documents.map(d => (
        <button
          key={d.id}
          className="node-picker__item"
          data-testid={`node-picker-doc-${d.id}`}
          onClick={() => { onLinkExisting(d); onClose() }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 9h18" />
          </svg>
          <span>{d.title || 'Untitled'}</span>
        </button>
      ))}

      {!loading && documents.length === 0 && (
        <div className="node-picker__empty">No other documents</div>
      )}
    </div>
  )
}
