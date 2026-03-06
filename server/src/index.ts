import 'dotenv/config'
import { createApp } from './app.js'
import { startWorker } from './worker.js'

const PORT = Number(process.env.PORT) || 4444

const { server } = await createApp()

server.listen(PORT, () => {
  console.log(`muse server → http://localhost:${PORT} (WS + HTTP)`)
  startWorker()
})
