import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

async function main() {
  const utils = await import('y-websocket/bin/utils')
  const { setupWSConnection } = utils

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
