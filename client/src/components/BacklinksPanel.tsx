import { useState, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../lib/api'

interface Backlink {
  id: string
  title: string
}

interface Props {
  documentId: string
}

export function BacklinksPanel({ documentId }: Props) {
  const { session } = useAuth()
  const [backlinks, setBacklinks] = useState<Backlink[]>([])

  useEffect(() => {
    if (!session?.access_token || !documentId) return
    let cancelled = false

    fetch(apiUrl(`/api/documents/${documentId}/backlinks`), {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.backlinks) {
          setBacklinks(data.backlinks)
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [documentId, session?.access_token])

  if (backlinks.length === 0) return null

  return (
    <div className="backlinks-panel" data-testid="backlinks-panel">
      {backlinks.map(link => (
        <button
          key={link.id}
          className="backlinks-panel__item"
          data-testid="backlink-item"
          onClick={() => { window.location.hash = `/d/${link.id}` }}
          title={link.title}
        >
          {link.title}
        </button>
      ))}
    </div>
  )
}
