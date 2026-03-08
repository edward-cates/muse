import { useState, useEffect } from 'react'
import * as Y from 'yjs'
import { App } from '../App'
import { AiPanel } from '../components/AiPanel'
import { ActiveCanvasProvider } from '../ai/ActiveCanvasContext'
import { CollabContext } from '../collab/CollabContext'
import { AuthContext } from '../auth/AuthContext'
import type { CollabInstance } from '../collab/provider'

function noop() {}

function createEventEmitter() {
  const listeners = new Map<string, Set<Function>>()
  return {
    on(evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, new Set())
      listeners.get(evt)!.add(fn)
    },
    off(evt: string, fn: Function) {
      listeners.get(evt)?.delete(fn)
    },
  }
}

function createLocalCollab(): CollabInstance {
  const doc = new Y.Doc()
  const wsEmitter = createEventEmitter()
  const awarenessEmitter = createEventEmitter()

  const awareness = {
    clientID: doc.clientID,
    setLocalStateField: noop,
    getStates: () => new Map(),
    on: awarenessEmitter.on,
    off: awarenessEmitter.off,
  }

  const wsProvider = {
    wsconnected: false,
    awareness,
    on: wsEmitter.on,
    off: wsEmitter.off,
  }

  return { doc, wsProvider: wsProvider as any, awareness: awareness as any }
}

function getIdFromHash(): string | null {
  const match = window.location.hash.match(/^#\/d\/(.+)$/)
  return match ? match[1] : null
}

const mockAuth = {
  session: { access_token: 'e2e-test-token' } as any,
  user: { id: 'e2e-user', email: 'test@e2e.local' } as any,
  loading: false,
  signOut: async () => {},
}

declare global {
  interface Window {
    __testDoc?: Y.Doc
    __testY?: typeof Y
  }
}

export function TestRoot() {
  const [drawingId, setDrawingId] = useState(() => getIdFromHash() || 'e2e-test')
  const [instance, setInstance] = useState(createLocalCollab)

  // Support hash-based navigation (mirrors DocumentShell in production)
  useEffect(() => {
    const handler = () => {
      const newId = getIdFromHash()
      if (newId && newId !== drawingId) {
        setDrawingId(newId)
        setInstance(createLocalCollab())
      }
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [drawingId])

  // Expose doc + Y module for e2e tests to create elements programmatically
  window.__testDoc = instance.doc
  window.__testY = Y

  return (
    <AuthContext.Provider value={mockAuth}>
      <ActiveCanvasProvider>
        <div className="app-shell">
          <CollabContext.Provider value={instance}>
            <App drawingId={drawingId} key={drawingId} />
          </CollabContext.Provider>
          <AiPanel />
        </div>
      </ActiveCanvasProvider>
    </AuthContext.Provider>
  )
}
