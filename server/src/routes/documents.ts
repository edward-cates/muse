import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// List user's documents
router.get('/', async (req, res) => {
  const userId = req.userId!
  const supabase = getSupabase()
  const type = req.query.type as string | undefined

  let query = supabase
    .from('documents')
    .select('id, title, type, parent_id, content_version, created_at, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) {
    res.status(500).json({ error: 'Failed to list documents' })
    return
  }

  res.json({ documents: data })
})

// Create or register a document
router.post('/', async (req, res) => {
  const userId = req.userId!
  const { id, title, type, parent_id } = req.body
  const supabase = getSupabase()

  // If an ID is provided, check if the document already exists.
  // Return it as-is to avoid overwriting title on re-registration.
  if (id) {
    const { data: existing } = await supabase
      .from('documents')
      .select('id, title, type, parent_id, content_version, created_at, updated_at')
      .eq('id', id)
      .maybeSingle()

    if (existing) {
      res.json({ document: existing })
      return
    }
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      ...(id ? { id } : {}),
      owner_id: userId,
      title: title || 'Untitled',
      type: type || 'canvas',
      ...(parent_id ? { parent_id } : {}),
    })
    .select()
    .single()

  if (error) {
    console.error('POST /api/documents insert error:', error)
    res.status(500).json({ error: 'Failed to create document' })
    return
  }

  res.json({ document: data })
})

// Rename a document
router.patch('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const { title } = req.body
  const supabase = getSupabase()

  const { error } = await supabase
    .from('documents')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to update document' })
    return
  }

  res.json({ ok: true })
})

// Delete a document
router.delete('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to delete document' })
    return
  }

  res.json({ ok: true })
})

// Get document content
router.get('/:id/content', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('documents')
    .select('content, content_version')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) {
    res.status(500).json({ error: 'Failed to get document content' })
    return
  }

  if (!data) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  res.json({ content: data.content, content_version: data.content_version })
})

// Update document content (and bump content_version)
router.patch('/:id/content', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const { content } = req.body
  const supabase = getSupabase()

  // First get current version
  const { data: current, error: fetchError } = await supabase
    .from('documents')
    .select('content_version')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (fetchError) {
    res.status(500).json({ error: 'Failed to update document content' })
    return
  }

  if (!current) {
    res.status(404).json({ error: 'Document not found' })
    return
  }

  const newVersion = current.content_version + 1

  const { error } = await supabase
    .from('documents')
    .update({
      content,
      content_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('owner_id', userId)

  if (error) {
    res.status(500).json({ error: 'Failed to update document content' })
    return
  }

  res.json({ content_version: newVersion })
})

export default router
