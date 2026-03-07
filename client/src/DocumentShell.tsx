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

  useDocumentRegistration(documentId)

  // Fetch document type after registration
  useEffect(() => {
    if (!session?.access_token || !documentId) return
    setLoading(true)

    // Use POST to register/get doc metadata (idempotent)
    fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: documentId }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const type = data?.document?.type as DocumentType
        setDocType(type || 'canvas')
        setLoading(false)
      })
      .catch(() => {
        setDocType('canvas') // fallback
        setLoading(false)
      })
  }, [documentId, session?.access_token])

  if (loading || !docType) return null

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
