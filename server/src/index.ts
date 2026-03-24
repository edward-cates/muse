import 'dotenv/config'
import { createApp } from './app.js'
import { startWorker } from './worker.js'

const PORT = Number(process.env.PORT) || 4444

const { server } = await createApp()

server.listen(PORT, '0.0.0.0', () => {
  console.log(`muse server → http://0.0.0.0:${PORT} (WS + HTTP)`)
  startWorker()
})
