import 'dotenv/config'
import { createApp } from './app.js'

const PORT = Number(process.env.PORT) || 4444

const { server } = await createApp()

server.listen(PORT, () => {
  console.log(`muse server → http://localhost:${PORT} (WS + HTTP)`)
})
