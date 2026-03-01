import { createServer as createHttpServer, type IncomingMessage, type Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import express from 'express'
import cors from 'cors'
import * as jose from 'jose'
import keysRouter from './routes/keys.js'
import aiRouter from './routes/ai.js'
import drawingsRouter from './routes/drawings.js'
import fetchRouter from './routes/fetch.js'
import { setupPersistence } from './persistence.js'

// ── Express types augmentation ──
declare global {
  namespace Express {
    interface Request {
      userId?: string
    }
  }
}

// ── JWT verification ──
function createVerifier() {
  const supabaseUrl = process.env.SUPABASE_URL!
  const jwtSecret = process.env.SUPABASE_JWT_SECRET

  // JWKS for real Supabase auth tokens (ES256)
  const jwksUrl = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`)
  const jwks = jose.createRemoteJWKSet(jwksUrl)

  // Optional symmetric key for tests (HS256)
  const symmetricKey = jwtSecret
    ? new TextEncoder().encode(jwtSecret)
    : null

  return async function verifyToken(token: string): Promise<string | null> {
    try {
      // Try JWKS first (production ES256 tokens)
      const { payload } = await jose.jwtVerify(token, jwks, {
        audience: 'authenticated',
      })
      return payload.sub ?? null
    } catch {
      // Fall back to symmetric secret (HS256, for tests)
      if (!symmetricKey) return null
      try {
        const { payload } = await jose.jwtVerify(token, symmetricKey, {
          audience: 'authenticated',
        })
        return payload.sub ?? null
      } catch {
        return null
      }
    }
  }
}

export interface AppInstance {
  server: Server
  wss: WebSocketServer
}

export async function createApp(): Promise<AppInstance> {
  if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is required')

  const verifyToken = createVerifier()

  const utils = await import('y-websocket/bin/utils')
  const { setupWSConnection, setPersistence } = utils

  setPersistence(setupPersistence())

  // ── Express ──
  const app = express()
  app.use(cors({ origin: true }))
  app.use(express.json({ limit: '10mb' }))

  app.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'muse-server' })
  })

  const authMiddleware: express.RequestHandler = async (req, res, next) => {
    const header = req.headers.authorization
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization header' })
      return
    }
    const token = header.slice(7)
    const userId = await verifyToken(token)
    if (!userId) {
      res.status(401).json({ error: 'Invalid token' })
      return
    }
    req.userId = userId
    next()
  }

  app.use('/api/keys', authMiddleware, keysRouter)
  app.use('/api/ai', authMiddleware, aiRouter)
  app.use('/api/drawings', authMiddleware, drawingsRouter)
  app.use('/api/fetch', authMiddleware, fetchRouter)

  // ── HTTP + WS ──
  const server = createHttpServer(app)
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    setupWSConnection(ws, req, { gc: true })
  })

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)
    const token = url.searchParams.get('token')

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    const userId = await verifyToken(token)
    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ;(ws as unknown as Record<string, string>).userId = userId
      wss.emit('connection', ws, req)
    })
  })

  return { server, wss }
}
