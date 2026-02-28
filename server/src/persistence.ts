import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'
import type { Doc } from 'yjs'

// y-websocket uses require('yjs') (CJS). We must use the same CJS
// instance to avoid the dual-package hazard where ESM and CJS load
// separate copies of Yjs, crashing Y.applyUpdate() across instances.
const _require = createRequire(import.meta.url)
const Y = _require('yjs') as { applyUpdate: typeof import('yjs').applyUpdate; encodeStateAsUpdate: typeof import('yjs').encodeStateAsUpdate }

function getSupabase() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// An empty Yjs doc encodes to exactly 2 bytes. Writing this to the DB
// would clobber real content — e.g. React StrictMode's rapid mount/unmount
// cycle destroys a doc before async bindState loads content, triggering
// writeState with an empty state. Skip these no-op writes.
const EMPTY_STATE_SIZE = 2

export function setupPersistence() {
  const writeTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function drawingId(docName: string) {
    return docName.replace(/^muse-/, '')
  }

  function persistDoc(docName: string, ydoc: Doc) {
    const existing = writeTimers.get(docName)
    if (existing) clearTimeout(existing)
    writeTimers.set(
      docName,
      setTimeout(async () => {
        writeTimers.delete(docName)
        const state = Y.encodeStateAsUpdate(ydoc)
        if (state.length <= EMPTY_STATE_SIZE) return
        await getSupabase()
          .from('drawings')
          .update({ content: Buffer.from(state).toString('base64') })
          .eq('id', drawingId(docName))
      }, 500),
    )
  }

  return {
    provider: null,
    bindState: async (docName: string, ydoc: Doc) => {
      const { data } = await getSupabase()
        .from('drawings')
        .select('content')
        .eq('id', drawingId(docName))
        .maybeSingle()

      if (data?.content) {
        const bytes = Buffer.from(data.content, 'base64')
        Y.applyUpdate(ydoc, new Uint8Array(bytes))
      }

      ydoc.on('update', () => persistDoc(docName, ydoc))
    },
    writeState: async (docName: string, ydoc: Doc) => {
      const existing = writeTimers.get(docName)
      if (existing) clearTimeout(existing)
      writeTimers.delete(docName)

      const state = Y.encodeStateAsUpdate(ydoc)
      if (state.length <= EMPTY_STATE_SIZE) return
      await getSupabase()
        .from('drawings')
        .update({ content: Buffer.from(state).toString('base64') })
        .eq('id', drawingId(docName))
    },
  }
}
