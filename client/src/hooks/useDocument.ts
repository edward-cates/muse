import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'
import type { DocumentMeta } from '../types/document'

const API_BASE = '/api/documents'

export function useDocumentMeta(documentId: string) {
  const { session } = useAuth()
  const [meta, setMeta] = useState<DocumentMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token || !documentId) return

    setLoading(true)
    setError(null)

    // Fetch document metadata from list filtered by id
    // The API doesn't have a GET /:id route, so we'll use the list and find
    // Actually we'll add a single-doc fetch - but for now use registration POST which returns it
    fetch(`${API_BASE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: documentId }),
    })
      .then(r => r.json())
      .then(data => {
        setMeta(data.document ?? null)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [documentId, session?.access_token])

  return { meta, loading, error }
}

export function useDocumentContent(documentId: string, contentVersion: number) {
  const { session } = useAuth()
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session?.access_token || !documentId) return

    setLoading(true)
    setError(null)

    fetch(`${API_BASE}/${documentId}/content`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setContent(data.content)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [documentId, contentVersion, session?.access_token])

  return { content, loading, error }
}

export function useDocumentApi() {
  const { session } = useAuth()

  const headers = useCallback(() => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`
    return h
  }, [session?.access_token])

  const createDocument = useCallback(async (opts: {
    title?: string
    type?: string
    parent_id?: string
  }): Promise<DocumentMeta> => {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(opts),
    })
    if (!res.ok) throw new Error(`Failed to create document: ${res.status}`)
    const data = await res.json()
    return data.document
  }, [headers])

  const updateContent = useCallback(async (
    documentId: string,
    content: string,
  ): Promise<number> => {
    const res = await fetch(`${API_BASE}/${documentId}/content`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error(`Failed to update content: ${res.status}`)
    const data = await res.json()
    return data.content_version
  }, [headers])

  return { createDocument, updateContent }
}
