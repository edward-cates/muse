import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const USER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9']

export interface CollabInstance {
  doc: Y.Doc
  wsProvider: WebsocketProvider
  awareness: WebsocketProvider['awareness']
}

export function createCollabProvider(roomName: string): CollabInstance {
  const doc = new Y.Doc()
  const wsProvider = new WebsocketProvider('ws://localhost:4444', roomName, doc)
  const awareness = wsProvider.awareness

  const color = USER_COLORS[doc.clientID % USER_COLORS.length]
  const name = `User ${doc.clientID % 1000}`
  awareness.setLocalStateField('user', { name, color })

  return { doc, wsProvider, awareness }
}

export function destroyCollabProvider(instance: CollabInstance) {
  instance.wsProvider.destroy()
  instance.doc.destroy()
}
