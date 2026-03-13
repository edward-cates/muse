import { Router, type Request } from 'express'
import { createClient } from '@supabase/supabase-js'

// Merged params from parent router include :id (document ID)
type ShareParams = { id: string; shareId?: string }

const router = Router({ mergeParams: true })

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Share a document with another user
router.post('/', async (req: Request<ShareParams>, res) => {
  const userId = req.userId!
  const documentId = req.params.id
  const { email } = req.body

  if (!email || typeof email !== 'string') {
    res.status(400).json({ error: 'email is required' })
    return
  }

  const supabase = getSupabase()

  // Verify caller is the document owner
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('owner_id')
    .eq('id', documentId)
    .maybeSingle()

  if (docError) {
    res.status(500).json({ error: 'Failed to verify document ownership' })
    return
  }
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (doc.owner_id !== userId) {
    res.status(403).json({ error: 'Only the document owner can share it' })
    return
  }

  // Try to resolve email to a user ID
  let sharedWithId: string | null = null
  try {
    const { data: userList } = await supabase.auth.admin.listUsers()
    const match = userList?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (match) {
      sharedWithId = match.id
    }
  } catch {
    // If user lookup fails, proceed with null shared_with_id (pending invite)
  }

  // Don't allow sharing with yourself
  if (sharedWithId === userId) {
    res.status(400).json({ error: 'Cannot share a document with yourself' })
    return
  }

  // Insert the share
  const { data: share, error: insertError } = await supabase
    .from('document_shares')
    .insert({
      document_id: documentId,
      owner_id: userId,
      shared_with_id: sharedWithId,
      shared_with_email: email.toLowerCase(),
      role: 'editor',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      res.status(409).json({ error: 'Document is already shared with this email' })
      return
    }
    console.error('POST shares insert error:', insertError)
    res.status(500).json({ error: 'Failed to share document' })
    return
  }

  res.json({ share })
})

// List shares for a document
router.get('/', async (req: Request<ShareParams>, res) => {
  const userId = req.userId!
  const documentId = req.params.id
  const supabase = getSupabase()

  // Verify caller is the document owner
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('owner_id')
    .eq('id', documentId)
    .maybeSingle()

  if (docError) {
    res.status(500).json({ error: 'Failed to verify document ownership' })
    return
  }
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (doc.owner_id !== userId) {
    res.status(403).json({ error: 'Only the document owner can view shares' })
    return
  }

  const { data: shares, error } = await supabase
    .from('document_shares')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(500).json({ error: 'Failed to list shares' })
    return
  }

  res.json({ shares })
})

// Revoke a share
router.delete('/:shareId', async (req: Request<ShareParams>, res) => {
  const userId = req.userId!
  const documentId = req.params.id
  const { shareId } = req.params
  const supabase = getSupabase()

  // Verify caller is the document owner
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('owner_id')
    .eq('id', documentId)
    .maybeSingle()

  if (docError) {
    res.status(500).json({ error: 'Failed to verify document ownership' })
    return
  }
  if (!doc) {
    res.status(404).json({ error: 'Document not found' })
    return
  }
  if (doc.owner_id !== userId) {
    res.status(403).json({ error: 'Only the document owner can revoke shares' })
    return
  }

  const { error } = await supabase
    .from('document_shares')
    .delete()
    .eq('id', shareId)
    .eq('document_id', documentId)

  if (error) {
    res.status(500).json({ error: 'Failed to revoke share' })
    return
  }

  res.json({ ok: true })
})

export default router
