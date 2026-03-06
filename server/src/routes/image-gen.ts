import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

router.post('/', async (req, res) => {
  const userId = req.userId!
  const { prompt, size } = req.body

  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'prompt is required' })
    return
  }

  // Get the user's OpenAI API key
  const supabase = getSupabase()
  const { data: secret } = await supabase
    .from('user_secrets')
    .select('encrypted_key')
    .eq('user_id', userId)
    .eq('provider', 'openai')
    .maybeSingle()

  if (!secret) {
    res.status(400).json({ error: 'No OpenAI key configured. Add one in Settings.' })
    return
  }

  let apiKey: string
  try {
    apiKey = decrypt(secret.encrypted_key)
  } catch {
    res.status(500).json({ error: 'Failed to decrypt API key' })
    return
  }

  // Call OpenAI image generation API
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com'
  try {
    const response = await fetch(`${baseUrl}/v1/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        size: size || '1024x1024',
        response_format: 'b64_json',
        n: 1,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error('OpenAI API error:', response.status, errorBody)
      res.status(502).json({ error: `OpenAI API error: ${response.status}` })
      return
    }

    const data = await response.json() as { data: Array<{ b64_json: string }> }
    const b64 = data.data[0].b64_json
    const imageUrl = `data:image/png;base64,${b64}`

    res.json({ imageUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Image generation failed'
    res.status(502).json({ error: message })
  }
})

export default router
