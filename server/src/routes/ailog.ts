import { Router } from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const router = Router()

const LOG_DIR = path.resolve(process.cwd(), '..', 'ai-logs')

router.post('/write', async (req, res) => {
  try {
    const { conversation, turn, filename, data } = req.body as {
      conversation: string
      turn: number
      filename: string
      data: unknown
    }

    if (!conversation || turn == null || !filename || data === undefined) {
      res.status(400).json({ error: 'Missing conversation, turn, filename, or data' })
      return
    }

    // Sanitize path components
    const safeConv = conversation.replace(/[^a-zA-Z0-9_-]/g, '')
    const safeTurn = String(turn).padStart(2, '0')
    const safeFile = filename.replace(/[^a-zA-Z0-9_.-]/g, '')

    const dir = path.join(LOG_DIR, safeConv, `turn-${safeTurn}`)
    await mkdir(dir, { recursive: true })

    const filePath = path.join(dir, safeFile)
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
    await writeFile(filePath, content, 'utf-8')

    res.json({ ok: true, path: path.relative(LOG_DIR, filePath) })
  } catch (err) {
    console.error('[ailog] write error:', err)
    res.status(500).json({ error: 'Failed to write log' })
  }
})

export default router
