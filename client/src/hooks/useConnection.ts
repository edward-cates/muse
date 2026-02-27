import { useEffect, useState } from 'react'
import { wsProvider } from '../collab/provider'

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected'

export function useConnection(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(
    wsProvider.wsconnected ? 'connected' : 'connecting',
  )

  useEffect(() => {
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
  }, [])

  return status
}
