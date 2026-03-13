import { Router } from 'express'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const router = Router()

const MAX_TEXT_LENGTH = 5000
const FETCH_TIMEOUT_MS = 10_000
const MAX_BODY_BYTES = 1_024_000 // 1MB

// SSRF protection: block requests to private/internal IP ranges
function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number)
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

const PRIVATE_RANGES: Array<{ start: number; end: number }> = [
  { start: 0x00000000, end: 0x00FFFFFF }, // 0.0.0.0/8
  { start: 0x0A000000, end: 0x0AFFFFFF }, // 10.0.0.0/8
  { start: 0x7F000000, end: 0x7FFFFFFF }, // 127.0.0.0/8
  { start: 0xA9FE0000, end: 0xA9FEFFFF }, // 169.254.0.0/16
  { start: 0xAC100000, end: 0xAC1FFFFF }, // 172.16.0.0/12
  { start: 0xC0A80000, end: 0xC0A8FFFF }, // 192.168.0.0/16
]

function isPrivateIP(ip: string): boolean {
  const version = isIP(ip)
  if (version === 6) return true // block all IPv6 (could be link-local, mapped, etc.)
  if (version === 0) return true // not a valid IP
  const num = ipToInt(ip)
  return PRIVATE_RANGES.some(r => num >= r.start && num <= r.end)
}

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

  // SSRF protection: resolve hostname and block private/internal IPs
  // Skipped when ALLOW_PRIVATE_FETCH=1 (local dev / tests with localhost mock servers)
  if (!process.env.ALLOW_PRIVATE_FETCH) {
    try {
      const { address } = await lookup(parsed.hostname)
      if (isPrivateIP(address)) {
        res.status(400).json({ error: 'URLs resolving to private/internal addresses are not allowed' })
        return
      }
    } catch {
      res.status(400).json({ error: 'Could not resolve hostname' })
      return
    }
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
