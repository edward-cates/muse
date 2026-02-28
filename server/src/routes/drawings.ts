import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// List user's drawings
router.get('/', async (req, res) => {
  const userId = req.userId!
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('drawings')
    .select('id, title, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: 'Failed to list drawings' })
    return
  }

  res.json({ drawings: data })
})

// Create or register a drawing
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { id, title } = req.body
  const supabase = getSupabase()

  // If an ID is provided, check if the drawing already exists.
  // Return it as-is to avoid overwriting title on re-registration.
  if (id) {
    const { data: existing } = await supabase
      .from('drawings')
      .select('id, title, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (existing) {
      res.json({ drawing: existing })
      return
    }
  }

  const { data, error } = await supabase
    .from('drawings')
    .insert({
      ...(id ? { id } : {}),
      owner_id: userId,
      title: title || 'Untitled',
    })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: 'Failed to create drawing' })
    return
  }

  res.json({ drawing: data })
})

// Rename a drawing
router.patch('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const { title } = req.body
  const supabase = getSupabase()

  const { error } = await supabase
    .from('drawings')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to update drawing' })
    return
  }

  res.json({ ok: true })
})

// Delete a drawing
router.delete('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { error } = await supabase
    .from('drawings')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to delete drawing' })
    return
  }

  res.json({ ok: true })
})

export default router
