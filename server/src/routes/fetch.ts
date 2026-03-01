import { Router } from 'express'

const router = Router()

const MAX_TEXT_LENGTH = 5000
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1_024_000 // 1MB

router.post('/', async (req, res) => {
  const { url } = req.body as { url?: string }

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url is required' })
    return
  }

  // Validate URL scheme
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    res.status(400).json({ error: 'Invalid URL' })
    return
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http and https URLs are allowed' })
    return
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Muse/1.0 (Research Assistant)',
        Accept: 'text/html, text/plain, application/json',
      },
    })
    clearTimeout(timeout)

    if (!response.ok) {
      res.status(502).json({ error: `Upstream returned ${response.status}` })
      return
    }

    const contentType = response.headers.get('content-type') || ''
    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > MAX_BODY_BYTES) {
      // Truncate but still return what we can
    }

    const body = new TextDecoder().decode(buffer.slice(0, MAX_BODY_BYTES))

    // Extract title from HTML
    let title = ''
    const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (titleMatch) title = titleMatch[1].trim()

    // Strip HTML tags to get text content
    let text = body
    if (contentType.includes('html')) {
      // Remove script/style blocks
      text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
      text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
      // Remove all tags
      text = text.replace(/<[^>]+>/g, ' ')
      // Collapse whitespace
      text = text.replace(/\s+/g, ' ').trim()
    }

    // Truncate to max length
    text = text.slice(0, MAX_TEXT_LENGTH)

    res.json({ title, text, url })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      res.status(504).json({ error: 'Request timed out' })
      return
    }
    const message = err instanceof Error ? err.message : 'Fetch failed'
    res.status(502).json({ error: message })
  }
})

export default router
