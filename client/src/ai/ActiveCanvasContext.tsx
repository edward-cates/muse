import { createContext, useContext, useRef, useCallback, useSyncExternalStore, type ReactNode } from 'react'
import type { CanvasElement } from '../types'
import type { ElementActions } from './executeToolCall'
import type { ConnectionStatus } from '../hooks/useConnection'

export interface ActiveCanvasState {
  documentId: string | null
  elements: CanvasElement[]
  elementActions: ElementActions | null
  connectionStatus?: ConnectionStatus
  onSettingsClick?: () => void
  onToggleMinimap?: () => void
  onToggleDarkMode?: () => void
}

interface ActiveCanvasContextValue {
  register: (state: ActiveCanvasState) => void
  unregister: (documentId: string) => void
  subscribe: (cb: () => void) => () => void
  getSnapshot: () => ActiveCanvasState
}

const EMPTY: ActiveCanvasState = { documentId: null, elements: [], elementActions: null }

const ActiveCanvasContext = createContext<ActiveCanvasContextValue>({
  register: () => {},
  unregister: () => {},
  subscribe: () => () => {},
  getSnapshot: () => EMPTY,
})

export function ActiveCanvasProvider({ children }: { children: ReactNode }) {
  const stateRef = useRef<ActiveCanvasState>(EMPTY)
  const listenersRef = useRef(new Set<() => void>())

  const notify = useCallback(() => {
    for (const cb of listenersRef.current) cb()
  }, [])

  const register = useCallback((newState: ActiveCanvasState) => {
    stateRef.current = newState
    notify()
  }, [notify])

  const unregister = useCallback((documentId: string) => {
    if (stateRef.current.documentId === documentId) {
      stateRef.current = EMPTY
      notify()
    }
  }, [notify])

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb)
    return () => { listenersRef.current.delete(cb) }
  }, [])

  const getSnapshot = useCallback(() => stateRef.current, [])

  return (
    <ActiveCanvasContext.Provider value={{ register, unregister, subscribe, getSnapshot }}>
      {children}
    </ActiveCanvasContext.Provider>
  )
}

export function useActiveCanvas() {
  const { register, unregister, subscribe, getSnapshot } = useContext(ActiveCanvasContext)
  const state = useSyncExternalStore(subscribe, getSnapshot)
  return { ...state, register, unregister }
}
