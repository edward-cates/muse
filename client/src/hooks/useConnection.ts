import { useContext, useEffect, useState } from 'react'
import { CollabContext } from '../collab/CollabContext'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export function useConnection(): ConnectionStatus {
  const collab = useContext(CollabContext)
  const [status, setStatus] = useState<ConnectionStatus>(
    collab?.wsProvider.wsconnected ? 'connected' : 'disconnected',
  )

  useEffect(() => {
    if (!collab) return
    const { wsProvider } = collab

    // Sync initial state
    setStatus(wsProvider.wsconnected ? 'connected' : 'connecting')

    const onStatus = ({ status: s }: { status: string }) => {
      setStatus(s === 'connected' ? 'connected' : 'connecting')
    }
    const onDisconnect = () => setStatus('disconnected')
    const onConnect = () => setStatus('connected')

    wsProvider.on('status', onStatus)
    wsProvider.on('connection-close', onDisconnect)
    wsProvider.on('connection-error', onDisconnect)
    wsProvider.on('sync', onConnect)

    return () => {
      wsProvider.off('status', onStatus)
      wsProvider.off('connection-close', onDisconnect)
      wsProvider.off('connection-error', onDisconnect)
      wsProvider.off('sync', onConnect)
    }
  }, [collab])

  return status
}
