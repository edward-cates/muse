import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const USER_COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9']

export interface CollabInstance {
  doc: Y.Doc
  wsProvider: WebsocketProvider
  awareness: WebsocketProvider['awareness']
}

interface CollabUser {
  name: string
  email: string
}

export function createCollabProvider(
  roomName: string,
  user: CollabUser,
  token: string,
): CollabInstance {
  const doc = new Y.Doc()
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:4444'
  const wsProvider = new WebsocketProvider(wsUrl, roomName, doc, {
    params: { token },
  })
  const awareness = wsProvider.awareness

  const color = USER_COLORS[doc.clientID % USER_COLORS.length]
  awareness.setLocalStateField('user', { name: user.name, color })

  return { doc, wsProvider, awareness }
}

export function destroyCollabProvider(instance: CollabInstance) {
  instance.wsProvider.destroy()
  instance.doc.destroy()
}
