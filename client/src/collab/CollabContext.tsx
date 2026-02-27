import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CollabInstance } from './provider'
import { createCollabProvider, destroyCollabProvider } from './provider'
import { useAuth } from '../auth/AuthContext'

const CollabContext = createContext<CollabInstance | null>(null)

export function useCollab(): CollabInstance {
  const ctx = useContext(CollabContext)
  if (!ctx) throw new Error('useCollab must be used within <CollabProvider>')
  return ctx
}

interface Props {
  roomName: string
  children: ReactNode
}

export function CollabProvider({ roomName, children }: Props) {
  const { session, user } = useAuth()
  const [instance, setInstance] = useState<CollabInstance | null>(null)

  const token = session?.access_token
  const userName = user?.user_metadata?.full_name || user?.email || 'Anonymous'
  const userEmail = user?.email || ''

  useEffect(() => {
    if (!token) return
    const inst = createCollabProvider(
      roomName,
      { name: userName, email: userEmail },
      token,
    )
    setInstance(inst)
    return () => {
      destroyCollabProvider(inst)
      setInstance(null)
    }
  }, [roomName, token])

  if (!instance) return null

  return (
    <CollabContext.Provider value={instance}>
      {children}
    </CollabContext.Provider>
  )
}
