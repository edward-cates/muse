import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export const doc = new Y.Doc()

export const wsProvider = new WebsocketProvider(
  'ws://localhost:4444',
  'muse-room',
  doc,
)

export const awareness = wsProvider.awareness

// Set a random user identity
const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#818cf8', '#e879f9']
const color = COLORS[doc.clientID % COLORS.length]
const name = `User ${doc.clientID % 1000}`

awareness.setLocalStateField('user', { name, color })
