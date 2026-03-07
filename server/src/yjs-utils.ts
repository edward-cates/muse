import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
import crypto from 'node:crypto'

const _require = createRequire(import.meta.url)
const Y = _require('yjs') as typeof import('yjs')

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type YMapVal = string | number | number[]

/** Load a Yjs doc from Supabase. Returns a new Y.Doc (caller must destroy). */
export async function loadYDoc(documentId: string): Promise<InstanceType<typeof Y.Doc>> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .select('content, type')
    .eq('id', documentId)
    .maybeSingle()

  if (error) throw new Error(`Failed to load document: ${error.message}`)

  const ydoc = new Y.Doc()
  if (data?.content && data.type === 'canvas') {
    try {
      const bytes = Buffer.from(data.content, 'base64')
      Y.applyUpdate(ydoc, new Uint8Array(bytes))
    } catch {
      // Corrupt state — start fresh
    }
  }
  return ydoc
}

/** Save a Yjs doc back to Supabase. */
export async function saveYDoc(documentId: string, ydoc: InstanceType<typeof Y.Doc>): Promise<void> {
  const supabase = getSupabase()
  const state = Y.encodeStateAsUpdate(ydoc)
  const { error } = await supabase
    .from('documents')
    .update({
      content: Buffer.from(state).toString('base64'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  if (error) throw new Error(`Failed to save document: ${error.message}`)
}

/** Add elements to a canvas doc's Y.Array('elements'). Returns generated IDs. */
export async function addElementsToDoc(
  documentId: string,
  elements: Array<Record<string, YMapVal>>,
): Promise<string[]> {
  const ydoc = await loadYDoc(documentId)
  const yElements = ydoc.getArray('elements')
  const ids: string[] = []

  for (const el of elements) {
    const yEl = new Y.Map()
    for (const [key, value] of Object.entries(el)) {
      yEl.set(key, value)
    }
    if (!el.id) {
      const genId = crypto.randomUUID()
      yEl.set('id', genId)
      ids.push(genId)
    } else {
      ids.push(el.id as string)
    }
    yElements.push([yEl])
  }

  await saveYDoc(documentId, ydoc)
  ydoc.destroy()
  return ids
}

/** Update an element in a canvas doc by ID. */
export async function updateElementInDoc(
  documentId: string,
  elementId: string,
  updates: Record<string, YMapVal>,
): Promise<boolean> {
  const ydoc = await loadYDoc(documentId)
  const yElements = ydoc.getArray('elements')
  let found = false

  for (let i = 0; i < yElements.length; i++) {
    const yEl = yElements.get(i) as InstanceType<typeof Y.Map>
    if (yEl.get('id') === elementId) {
      for (const [key, value] of Object.entries(updates)) {
        yEl.set(key, value)
      }
      found = true
      break
    }
  }

  if (found) {
    await saveYDoc(documentId, ydoc)
  }
  ydoc.destroy()
  return found
}

/** Read all elements from a canvas doc. Returns flat objects. */
export async function readElementsFromDoc(
  documentId: string,
): Promise<Array<Record<string, YMapVal>>> {
  const ydoc = await loadYDoc(documentId)
  const yElements = ydoc.getArray('elements')
  const elements: Array<Record<string, YMapVal>> = []

  for (let i = 0; i < yElements.length; i++) {
    const yEl = yElements.get(i) as InstanceType<typeof Y.Map>
    const obj: Record<string, YMapVal> = {}
    for (const [key, value] of yEl.entries()) {
      obj[key] = value as YMapVal
    }
    elements.push(obj)
  }

  ydoc.destroy()
  return elements
}

/** Delete an element from a canvas doc by ID. Also cascade-deletes attached connectors. */
export async function deleteElementFromDoc(
  documentId: string,
  elementId: string,
): Promise<boolean> {
  const ydoc = await loadYDoc(documentId)
  const yElements = ydoc.getArray('elements')

  // Collect indices to delete (the element + any attached connectors)
  const indicesToDelete: number[] = []
  for (let i = 0; i < yElements.length; i++) {
    const yEl = yElements.get(i) as InstanceType<typeof Y.Map>
    const id = yEl.get('id') as string
    if (id === elementId) {
      indicesToDelete.push(i)
    } else {
      const type = yEl.get('type') as string
      if (type === 'line') {
        const startId = yEl.get('startShapeId') as string
        const endId = yEl.get('endShapeId') as string
        if (startId === elementId || endId === elementId) {
          indicesToDelete.push(i)
        }
      }
    }
  }

  if (indicesToDelete.length === 0) {
    ydoc.destroy()
    return false
  }

  // Delete in reverse order to maintain correct indices
  indicesToDelete.sort((a, b) => b - a)
  for (const idx of indicesToDelete) {
    yElements.delete(idx, 1)
  }

  await saveYDoc(documentId, ydoc)
  ydoc.destroy()
  return true
}

/** Create a new document in Supabase. */
export async function createDocument(
  userId: string,
  opts: { title?: string; type?: string },
): Promise<{ id: string; type: string; content_version: number }> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('documents')
    .insert({
      owner_id: userId,
      title: opts.title || 'Untitled',
      type: opts.type || 'canvas',
    })
    .select('id, type, content_version')
    .single()

  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data
}

/** Update a document's content (HTML artifacts, etc.) and bump content_version. */
export async function updateDocumentContent(
  documentId: string,
  content: string,
): Promise<number> {
  const supabase = getSupabase()

  const { data: current, error: fetchError } = await supabase
    .from('documents')
    .select('content_version')
    .eq('id', documentId)
    .maybeSingle()

  if (fetchError) throw new Error(`Failed to fetch document: ${fetchError.message}`)
  if (!current) throw new Error('Document not found')

  const newVersion = current.content_version + 1

  const { error } = await supabase
    .from('documents')
    .update({
      content,
      content_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  if (error) throw new Error(`Failed to update content: ${error.message}`)
  return newVersion
}
