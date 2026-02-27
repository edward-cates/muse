import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CollabInstance } from './provider'
import { createCollabProvider, destroyCollabProvider } from './provider'

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
  const [instance, setInstance] = useState<CollabInstance | null>(null)

  useEffect(() => {
    const inst = createCollabProvider(roomName)
    setInstance(inst)
    return () => {
      destroyCollabProvider(inst)
      setInstance(null)
    }
  }, [roomName])

  if (!instance) return null

  return (
    <CollabContext.Provider value={instance}>
      {children}
    </CollabContext.Provider>
  )
}
