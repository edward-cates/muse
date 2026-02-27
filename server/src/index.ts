import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import * as Y from 'yjs'

const DATA_DIR = './muse-data'

// Debounced file-based persistence
const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function persistDoc(docName: string, ydoc: Y.Doc) {
  // Debounce writes to 500ms
  const existing = writeTimers.get(docName)
  if (existing) clearTimeout(existing)
  writeTimers.set(
    docName,
    setTimeout(() => {
      mkdirSync(DATA_DIR, { recursive: true })
      const state = Y.encodeStateAsUpdate(ydoc)
      writeFileSync(join(DATA_DIR, `${docName}.bin`), state)
      writeTimers.delete(docName)
    }, 500),
  )
}

async function main() {
  const utils = await import('y-websocket/bin/utils')
  const { setupWSConnection, setPersistence } = utils

  setPersistence({
    provider: null,
    bindState: async (docName: string, ydoc: Y.Doc) => {
      const filepath = join(DATA_DIR, `${docName}.bin`)
      if (existsSync(filepath)) {
        const data = readFileSync(filepath)
        Y.applyUpdate(ydoc, new Uint8Array(data))
      }
      ydoc.on('update', () => persistDoc(docName, ydoc))
    },
    writeState: async (docName: string, ydoc: Y.Doc) => {
      mkdirSync(DATA_DIR, { recursive: true })
      const state = Y.encodeStateAsUpdate(ydoc)
      writeFileSync(join(DATA_DIR, `${docName}.bin`), state)
    },
  })

  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('muse collab server')
  })

  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws, req) => {
    setupWSConnection(ws, req, { gc: true })
  })

  const PORT = Number(process.env.PORT) || 4444

  server.listen(PORT, () => {
    console.log(`muse collab server → ws://localhost:${PORT}`)
  })
}

main()
