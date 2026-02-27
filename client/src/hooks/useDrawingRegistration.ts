import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext'

export function useDrawingRegistration(drawingId: string) {
  const { session } = useAuth()
  const registered = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!session?.access_token || registered.current.has(drawingId)) return

    registered.current.add(drawingId)

    fetch('/api/drawings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ id: drawingId }),
    }).catch(() => {
      registered.current.delete(drawingId)
    })
  }, [drawingId, session?.access_token])
}
