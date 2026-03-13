import { useState, useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { useDrawingId } from './hooks/useDrawingId'
import { useDocumentRegistration } from './hooks/useDocumentRegistration'
import { CollabProvider } from './collab/CollabContext'
import { App } from './App'
import { HtmlArtifactViewer } from './components/HtmlArtifactViewer'
import { MarkdownViewer } from './components/MarkdownViewer'
import type { DocumentType } from './types/document'

export function DocumentShell() {
  const documentId = useDrawingId()
  const { session } = useAuth()
  const [docType, setDocType] = useState<DocumentType | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useDocumentRegistration(documentId)

  // Fetch document type after registration
  useEffect(() => {
    if (!session?.access_token || !documentId) return
    setLoading(true)
    setAccessDenied(false)

    // Use POST to register/get doc metadata (idempotent)
    fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: documentId }),
    })
      .then(r => {
        if (r.status === 403 || r.status === 404) {
          setAccessDenied(true)
          setLoading(false)
          return null
        }
        return r.ok ? r.json() : null
      })
      .then(data => {
        if (!data) return
        const type = data?.document?.type as DocumentType
        setDocType(type || 'canvas')
        setLoading(false)
      })
      .catch(() => {
        setDocType('canvas') // fallback
        setLoading(false)
      })
  }, [documentId, session?.access_token])

  if (loading) return <div className="app" />

  if (accessDenied) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg, #fff)' }}>
        <p style={{ fontSize: 16, color: 'var(--text-muted, #666)', margin: 0 }}>You don't have access to this document.</p>
        <button
          onClick={() => { window.location.hash = `/d/${crypto.randomUUID()}` }}
          style={{ padding: '8px 20px', fontSize: 14, fontFamily: 'inherit', fontWeight: 600, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Go to my canvas
        </button>
      </div>
    )
  }

  if (!docType) return null

  switch (docType) {
    case 'html_artifact':
      return <HtmlArtifactViewer documentId={documentId} />
    case 'markdown':
      return <MarkdownViewer documentId={documentId} />
    case 'research':
    case 'canvas':
    default:
      return (
        <CollabProvider roomName={`muse-${documentId}`}>
          <App drawingId={documentId} />
        </CollabProvider>
      )
  }
}
