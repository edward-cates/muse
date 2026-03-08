import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CanvasElement } from '../types'
import type { ElementActions } from './executeToolCall'
import type { ConnectionStatus } from '../hooks/useConnection'

interface ActiveCanvasState {
  documentId: string | null
  elements: CanvasElement[]
  elementActions: ElementActions | null
  connectionStatus?: ConnectionStatus
  onSettingsClick?: () => void
  onToggleMinimap?: () => void
  onToggleDarkMode?: () => void
}

interface ActiveCanvasContextValue extends ActiveCanvasState {
  register: (state: ActiveCanvasState) => void
  unregister: (documentId: string) => void
}

const ActiveCanvasContext = createContext<ActiveCanvasContextValue>({
  documentId: null,
  elements: [],
  elementActions: null,
  register: () => {},
  unregister: () => {},
})

export function ActiveCanvasProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ActiveCanvasState>({
    documentId: null,
    elements: [],
    elementActions: null,
  })

  const register = useCallback((newState: ActiveCanvasState) => {
    setState(newState)
  }, [])

  const unregister = useCallback((documentId: string) => {
    setState(prev => {
      if (prev.documentId === documentId) {
        return { documentId: null, elements: [], elementActions: null }
      }
      return prev
    })
  }, [])

  return (
    <ActiveCanvasContext.Provider value={{ ...state, register, unregister }}>
      {children}
    </ActiveCanvasContext.Provider>
  )
}

export function useActiveCanvas() {
  return useContext(ActiveCanvasContext)
}
