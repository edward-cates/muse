import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Save (upsert) an API key
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { key, provider = 'anthropic' } = req.body

  if (!key || typeof key !== 'string') {
    res.status(400).json({ error: 'key is required' })
    return
  }

  const encrypted_key = encrypt(key)
  const supabase = getSupabase()

  const { error } = await supabase.from('user_secrets').upsert(
    { user_id: userId, provider, encrypted_key, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,provider' },
  )

  if (error) {
    console.error('Failed to save key:', error)
    res.status(500).json({ error: 'Failed to save key' })
    return
  }

  res.json({ ok: true })
})

// Check if user has a key
router.get('/status', async (req, res) => {
  const userId = req.userId!
  const provider = (req.query.provider as string) || 'anthropic'
  const supabase = getSupabase()

  const { data } = await supabase
    .from('user_secrets')
    .select('id')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle()

  res.json({ hasKey: !!data })
})

// Delete a key
router.delete('/', async (req, res) => {
  const userId = req.userId!
  const provider = (req.query.provider as string) || 'anthropic'
  const supabase = getSupabase()

  const { error } = await supabase
    .from('user_secrets')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider)

  if (error) {
    console.error('Failed to delete key:', error)
    res.status(500).json({ error: 'Failed to delete key' })
    return
  }

  res.json({ ok: true })
})

export default router
