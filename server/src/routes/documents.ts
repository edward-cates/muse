import { Router } from 'express'
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'

const _require = createRequire(import.meta.url)
const Y = _require('yjs') as typeof import('yjs')

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
    .select('id, title, type, content_version, created_at, updated_at')
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
  const { id, title, type } = req.body
  const supabase = getSupabase()

  // If an ID is provided, check if the document already exists.
  // Return it as-is to avoid overwriting title on re-registration.
  if (id) {
    const { data: existing } = await supabase
      .from('documents')
      .select('id, title, type, content_version, created_at, updated_at')
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
    })
    .select()
    .single()

  if (error) {
    // Race condition: another request inserted the same ID between our check and insert
    if (error.code === '23505' && id) {
      const { data: existing } = await supabase
        .from('documents')
        .select('id, title, type, content_version, created_at, updated_at')
        .eq('id', id)
        .maybeSingle()
      if (existing) {
        res.json({ document: existing })
        return
      }
    }
    console.error('POST /api/documents insert error:', error)
    if (error.code === '23503') {
      res.status(401).json({ error: 'User account not found. Please sign out and sign back in.' })
      return
    }
    res.status(500).json({ error: 'Failed to create document' })
    return
  }

  res.json({ document: data })
})

// Get backlinks — other documents whose canvas contains an element pointing to this document
router.get('/:id/backlinks', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('documents')
    .select('id, title, content')
    .eq('owner_id', userId)
    .eq('type', 'canvas')
    .neq('id', id)

  if (error) {
    res.status(500).json({ error: 'Failed to get backlinks' })
    return
  }

  const backlinks: Array<{ id: string; title: string }> = []

  for (const doc of data || []) {
    if (!doc.content) continue
    try {
      const ydoc = new Y.Doc()
      const bytes = Buffer.from(doc.content, 'base64')
      Y.applyUpdate(ydoc, new Uint8Array(bytes))
      const yElements = ydoc.getArray('elements')
      let found = false
      for (let i = 0; i < yElements.length; i++) {
        const yEl = yElements.get(i) as ReturnType<typeof Y.Doc.prototype.getMap>
        if (yEl.get('documentId') === id) {
          found = true
          break
        }
      }
      ydoc.destroy()
      if (found) {
        backlinks.push({ id: doc.id, title: doc.title || 'Untitled' })
      }
    } catch {
      // skip corrupt docs
    }
  }

  res.json({ backlinks })
})

// Get a single document (metadata + source_text)
router.get('/:id', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('documents')
    .select('id, title, type, content_version, source_text, created_at, updated_at')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (error) {
    res.status(500).json({ error: 'Failed to get document' })
    return
  }

  if (!data) {
    res.status(404).json({ error: 'Document not found' })
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

// Add elements to a canvas document's Yjs state (used by AI to write to child canvases)
router.post('/:id/elements', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const { elements } = req.body as { elements: Array<Record<string, string | number | number[]>> }

  if (!elements || !Array.isArray(elements) || elements.length === 0) {
    res.status(400).json({ error: 'elements array is required' })
    return
  }

  const supabase = getSupabase()

  // Verify ownership and type
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('content, type')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (fetchError) {
    res.status(500).json({ error: 'Failed to get document' })
    return
  }
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (doc.type !== 'canvas') {
    res.status(400).json({ error: 'Can only add elements to canvas documents' })
    return
  }

  // Load existing Yjs state or create new doc
  const ydoc = new Y.Doc()
  if (doc.content) {
    try {
      const bytes = Buffer.from(doc.content, 'base64')
      Y.applyUpdate(ydoc, new Uint8Array(bytes))
    } catch {
      // Corrupt state — start fresh
    }
  }

  // Add elements to the Y.Array
  const yElements = ydoc.getArray('elements')
  const ids: string[] = []
  for (const el of elements) {
    const yEl = new Y.Map()
    for (const [key, value] of Object.entries(el)) {
      yEl.set(key, value)
    }
    // Ensure each element has an id
    if (!el.id) {
      const genId = crypto.randomUUID()
      yEl.set('id', genId)
      ids.push(genId)
    } else {
      ids.push(el.id as string)
    }
    yElements.push([yEl])
  }

  // Persist back to DB
  const state = Y.encodeStateAsUpdate(ydoc)
  const { error: updateError } = await supabase
    .from('documents')
    .update({ content: Buffer.from(state).toString('base64'), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)

  ydoc.destroy()

  if (updateError) {
    res.status(500).json({ error: 'Failed to save elements' })
    return
  }

  res.json({ ids, count: elements.length })
})

// Update an element in a canvas document's Yjs state (used by AI to update elements in any canvas)
router.patch('/:id/elements', async (req, res) => {
  const userId = req.userId!
  const { id } = req.params
  const { elementId, updates } = req.body as { elementId: string; updates: Record<string, string | number | number[]> }

  if (!elementId || typeof elementId !== 'string') {
    res.status(400).json({ error: 'elementId is required' })
    return
  }
  if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'updates object is required and must be non-empty' })
    return
  }

  const supabase = getSupabase()

  // Verify ownership and type
  const { data: doc, error: fetchError } = await supabase
    .from('documents')
    .select('content, type')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  if (fetchError) {
    res.status(500).json({ error: 'Failed to get document' })
    return
  }
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (doc.type !== 'canvas') {
    res.status(400).json({ error: 'Can only update elements in canvas documents' })
    return
  }

  // Load existing Yjs state
  const ydoc = new Y.Doc()
  if (doc.content) {
    try {
      const bytes = Buffer.from(doc.content, 'base64')
      Y.applyUpdate(ydoc, new Uint8Array(bytes))
    } catch {
      // Corrupt state
    }
  }

  // Find the element by ID in the Y.Array
  const yElements = ydoc.getArray('elements')
  let found = false
  for (let i = 0; i < yElements.length; i++) {
    const yEl = yElements.get(i) as ReturnType<typeof Y.Doc.prototype.getMap>
    if (yEl.get('id') === elementId) {
      for (const [key, value] of Object.entries(updates)) {
        yEl.set(key, value)
      }
      found = true
      break
    }
  }

  if (!found) {
    ydoc.destroy()
    res.status(404).json({ error: `Element "${elementId}" not found in document` })
    return
  }

  // Persist back to DB
  const state = Y.encodeStateAsUpdate(ydoc)
  const { error: updateError } = await supabase
    .from('documents')
    .update({ content: Buffer.from(state).toString('base64'), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)

  ydoc.destroy()

  if (updateError) {
    res.status(500).json({ error: 'Failed to save element update' })
    return
  }

  res.json({ success: true, elementId })
})

export default router
