import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

export function useDocumentRegistration(documentId: string, type: string = 'canvas') {
  const { session } = useAuth()
  const registered = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!session?.access_token || registered.current.has(documentId)) return

    registered.current.add(documentId)

    fetch('/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: documentId, type }),
    }).catch(() => {
      registered.current.delete(documentId)
    })
  }, [documentId, type, session?.access_token])
}
