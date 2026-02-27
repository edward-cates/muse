import { useEffect, useState } from 'react'
import { awareness } from '../collab/provider'

export interface RemoteCursor {
  clientId: number
  x: number
  y: number
  name: string
  color: string
}

export function useCursors() {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])

  useEffect(() => {
    const onChange = () => {
      const remote: RemoteCursor[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        if (!state.cursor || !state.user) return
        remote.push({
          clientId,
          x: state.cursor.x,
          y: state.cursor.y,
          name: state.user.name,
          color: state.user.color,
        })
      })
      setCursors(remote)
    }

    awareness.on('change', onChange)
    return () => awareness.off('change', onChange)
  }, [])

  return cursors
}
