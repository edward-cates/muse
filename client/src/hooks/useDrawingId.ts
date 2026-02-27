import { useState, useEffect } from 'react'

function getIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/d\/(.+)$/)
  return match ? match[1] : null
}

export function useDrawingId(): string {
  const [id] = useState<string>(() => {
    const existing = getIdFromHash()
    if (existing) return existing
    const newId = crypto.randomUUID()
    window.location.hash = `/d/${newId}`
    return newId
  })

  const [currentId, setCurrentId] = useState(id)

  useEffect(() => {
    const handler = () => {
      const hashId = getIdFromHash()
      if (hashId) setCurrentId(hashId)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  return currentId
}
