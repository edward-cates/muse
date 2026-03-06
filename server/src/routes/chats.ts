import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '../crypto.js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// List user's chats (metadata only — no decrypted messages)
router.get('/', async (req, res) => {
  const userId = req.userId!
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('ai_chats')
    .select('id, title, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) {
    res.status(500).json({ error: 'Failed to list chats' })
    return
  }

  res.json({ chats: data })
})

// Get a single chat (decrypts messages)
router.get('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('ai_chats')
    .select('id, title, encrypted_messages, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) {
    res.status(500).json({ error: 'Failed to get chat' })
    return
  }

  if (!data) {
    res.status(404).json({ error: 'Chat not found' })
    return
  }

  let messages: unknown
  try {
    messages = JSON.parse(decrypt(data.encrypted_messages))
  } catch {
    res.status(500).json({ error: 'Failed to decrypt chat' })
    return
  }

  res.json({
    id: data.id,
    title: data.title,
    messages,
    created_at: data.created_at,
    updated_at: data.updated_at,
  })
})

// Create or update a chat
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { id, title, messages } = req.body

  if (!messages || !Array.isArray(messages)) {
    res.status(400).json({ error: 'messages array is required' })
    return
  }

  const encrypted = encrypt(JSON.stringify(messages))
  const chatTitle = title || deriveTitle(messages)
  const supabase = getSupabase()

  if (id) {
    // Update existing chat
    const { error } = await supabase
      .from('ai_chats')
      .update({
        title: chatTitle,
        encrypted_messages: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('owner_id', userId)

    if (error) {
      res.status(500).json({ error: 'Failed to update chat' })
      return
    }

    res.json({ id, title: chatTitle })
  } else {
    // Create new chat
    const { data, error } = await supabase
      .from('ai_chats')
      .insert({
        owner_id: userId,
        title: chatTitle,
        encrypted_messages: encrypted,
      })
      .select('id, title, created_at, updated_at')
      .single()

    if (error) {
      res.status(500).json({ error: 'Failed to create chat' })
      return
    }

    res.json(data)
  }
})

// Delete a chat
router.delete('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { error } = await supabase
    .from('ai_chats')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to delete chat' })
    return
  }

  res.json({ ok: true })
})

/** Derive a chat title from the first user message */
function deriveTitle(messages: Array<{ role: string; content: unknown }>): string {
  const firstUser = messages.find(m => m.role === 'user')
  if (!firstUser) return 'Untitled Chat'

  const text = typeof firstUser.content === 'string'
    ? firstUser.content
    : Array.isArray(firstUser.content)
      ? (firstUser.content.find((b: { type: string }) => b.type === 'text') as { text?: string } | undefined)?.text || ''
      : ''

  if (!text) return 'Untitled Chat'
  return text.length > 60 ? text.slice(0, 57) + '...' : text
}

export default router
