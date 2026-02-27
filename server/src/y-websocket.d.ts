declare module 'y-websocket/bin/utils' {
  import type { Doc } from 'yjs'
  import type { WebSocket } from 'ws'
  import type { IncomingMessage } from 'node:http'

  export function setupWSConnection(
    ws: WebSocket,
    req: IncomingMessage,
    options?: { gc?: boolean; docName?: string },
  ): void

  export function setPersistence(persistence: {
    provider: unknown
    bindState: (docName: string, ydoc: Doc) => Promise<void>
    writeState: (docName: string, ydoc: Doc) => Promise<void>
  }): void
}
