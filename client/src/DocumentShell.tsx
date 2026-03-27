import { useState, useEffect } from 'react'
import { useAuth } from './auth/AuthContext'
import { useDrawingId } from './hooks/useDrawingId'
import { useDocumentRegistration } from './hooks/useDocumentRegistration'
import { CollabProvider } from './collab/CollabContext'
import { App } from './App'
import { HtmlArtifactViewer } from './components/HtmlArtifactViewer'
import { MarkdownViewer } from './components/MarkdownViewer'
import type { DocumentType } from './types/document'
import { apiUrl } from './lib/api'
import { AiPanel } from './components/AiPanel'

export function DocumentShell() {
  const documentId = useDrawingId()
  const { session } = useAuth()
  const [docType, setDocType] = useState<DocumentType | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)

  useDocumentRegistration(documentId)

  const [fetchError, setFetchError] = useState(false)

  // Fetch document type after registration, with retry for cold starts
  useEffect(() => {
    if (!session?.access_token || !documentId) return
    setLoading(true)
    setAccessDenied(false)
    setFetchError(false)

    let attempt = 0
    const maxRetries = 3

    const fetchType = () => {
      attempt++
      fetch(apiUrl('/api/documents'), {
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
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(data => {
          if (!data) return
          const type = data?.document?.type as DocumentType
          setDocType(type || 'canvas')
          setLoading(false)
        })
        .catch(() => {
          if (attempt < maxRetries) {
            setTimeout(fetchType, 1000 * attempt)
          } else {
            setFetchError(true)
            setLoading(false)
          }
        })
    }

    fetchType()
  }, [documentId, session?.access_token])

  if (loading) return <div className="app" />

  if (fetchError) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--bg, #fff)' }}>
        <p style={{ fontSize: 16, color: 'var(--text-muted, #666)', margin: 0 }}>Unable to reach the server.</p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '8px 20px', fontSize: 14, fontFamily: 'inherit', fontWeight: 600, background: '#1a1a2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
        >
          Retry
        </button>
      </div>
    )
  }

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
        <>
          <CollabProvider roomName={`muse-${documentId}`}>
            <App drawingId={documentId} />
          </CollabProvider>
          <AiPanel />
        </>
      )
  }
}
