import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function decryptOpenAIKey(userId: string): Promise<string> {
  const supabase = getSupabase()
  const { data: secret } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .maybeSingle()

  if (!secret) {
    throw Object.assign(new Error('No OpenAI API key configured. Add one in Settings.'), { status: 400 })
  }

  try {
    return decrypt(secret.encrypted_key)
  } catch {
    throw Object.assign(new Error('Failed to decrypt OpenAI API key'), { status: 500 })
  }
}

// POST /api/image-gen — generate an image via OpenAI DALL-E
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { prompt, size = '1024x1024', quality = 'standard' } = req.body

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt string is required' })
    return
  }

  let apiKey: string
  try {
    apiKey = await decryptOpenAIKey(userId)
  } catch (err: unknown) {
    const status = (err as { status?: number }).status || 500
    const message = err instanceof Error ? err.message : 'Failed to get API key'
    res.status(status).json({ error: message })
    return
  }

  try {
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        response_format: 'url',
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      let message = `OpenAI API error (${response.status})`
      try {
        const parsed = JSON.parse(body)
        message = parsed.error?.message || message
      } catch {}
      res.status(502).json({ error: message })
      return
    }

    const data = (await response.json()) as { data: Array<{ url: string; revised_prompt?: string }> }
    const image = data.data[0]

    res.json({
      url: image.url,
      revised_prompt: image.revised_prompt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    res.status(500).json({ error: message })
  }
})

export default router
